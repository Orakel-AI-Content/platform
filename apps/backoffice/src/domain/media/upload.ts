import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type { Result } from '@orakel/content-model';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { mediaUploads } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { checkWrite, refuse } from '../content/write.ts';
import { siteExists } from '../sites/sites.ts';
import { detectImageFormat, EXTENSIONS, SIGNATURE_BYTES, type ImageFormat } from './formats.ts';
import { ORIGINALS_BUCKET, type ObjectStore } from './store.ts';

// Recebimento do envio de uma imagem (12.0, L4): confere papel, nome, tamanho e formato antes
// de gravar qualquer coisa, grava o arquivo cru em `media-originals/uploads/` em streaming e,
// numa transação, registra o envio (`media_uploads`, #184) e enfileira a ingestão no
// backoffice-worker. O sharp não entra aqui (processo web).

/** Limite de um envio; uma foto de câmera passa com folga. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Maior nome de arquivo aceito, em caracteres. */
export const MAX_FILE_NAME = 255;

/** Cabeçalho com o nome original, codificado com `encodeURIComponent` (só Latin-1 em HTTP). */
export const FILE_NAME_HEADER = 'x-file-name';

export const INGEST_TASK = 'ingest-media';

export type IngestPayload = { siteId: string; uploadKey: string };

export type UploadDeps = { db: Executor; store: ObjectStore; newId?: () => string };

export type UploadInput = {
  /** Cabeçalho Content-Length, como veio. */
  contentLength: string | null;
  /** Cabeçalho `X-File-Name`, como veio (nome original codificado). */
  fileName: string | null;
  body: ReadableStream<Uint8Array> | null;
};

export async function receiveUpload(
  deps: UploadDeps,
  actor: Actor,
  siteId: string,
  input: UploadInput,
): Promise<Result<{ uploadKey: string; format: ImageFormat }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  if (input.fileName === null) {
    return refuse('media.name_required', 'Envie o nome do arquivo no cabeçalho X-File-Name');
  }
  const originalName = parseFileName(input.fileName);
  if (originalName === undefined) {
    return refuse(
      'media.name_invalid',
      `O nome do arquivo precisa ter de 1 a ${MAX_FILE_NAME} caracteres`,
    );
  }
  const length = parseLength(input.contentLength);
  if (length === undefined) {
    return refuse('media.length_required', 'Envie o arquivo com o cabeçalho Content-Length');
  }
  if (length > MAX_UPLOAD_BYTES) {
    return refuse('media.too_large', `A imagem passa do limite de ${MAX_UPLOAD_BYTES} bytes`);
  }
  if (length === 0 || input.body === null) return refuse('media.empty', 'O arquivo está vazio');

  const reader = input.body.getReader();
  const head = await readHead(reader);
  const format = detectImageFormat(Buffer.concat(head));
  if (format === undefined) {
    await reader.cancel();
    return refuse('media.unsupported_type', 'O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF');
  }
  if (!(await siteExists(deps.db, siteId))) {
    await reader.cancel();
    return refuse('site.not_found', `Site ${siteId} não encontrado`);
  }

  const uploadKey = `uploads/${siteId}/${(deps.newId ?? randomUUID)()}.${EXTENSIONS[format]}`;
  const body = Readable.from(limited(head, reader, length));
  await deps.store.put(ORIGINALS_BUCKET, uploadKey, body, length, `image/${format}`);
  // Depois do arquivo: nenhum envio fica `processando` sem objeto, nem na fila sem registro.
  await deps.db.transaction(async (tx) => {
    await tx.insert(mediaUploads).values({ uploadKey, siteId, originalName });
    await enqueueIngest(tx, { siteId, uploadKey });
  });
  return { ok: true, value: { uploadKey, format } };
}

/** Nome original decodificado e sem espaços nas pontas; `undefined` se inválido. */
function parseFileName(header: string): string | undefined {
  let name: string;
  try {
    name = decodeURIComponent(header).trim();
  } catch {
    return undefined;
  }
  return name.length >= 1 && [...name].length <= MAX_FILE_NAME ? name : undefined;
}

function parseLength(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header)) return undefined;
  return Number(header);
}

/** Lê pedaços do corpo até ter a assinatura (ou o corpo acabar). */
async function readHead(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < SIGNATURE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  return chunks;
}

/** O corpo inteiro (o que já foi lido e o resto), sem passar do tamanho anunciado. */
async function* limited(
  head: Uint8Array[],
  reader: ReadableStreamDefaultReader<Uint8Array>,
  length: number,
): AsyncGenerator<Uint8Array> {
  let size = 0;
  const take = (chunk: Uint8Array) => {
    size += chunk.byteLength;
    if (size > length) throw new Error(`Corpo maior que o Content-Length (${length})`);
    return chunk;
  };
  for (const chunk of head) yield take(chunk);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield take(value);
  }
}

/** Enfileira a ingestão de um envio (até 5 tentativas, com o backoff do Graphile Worker). */
export async function enqueueIngest(db: Executor, payload: IngestPayload): Promise<void> {
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${INGEST_TASK},
      payload => ${JSON.stringify(payload)}::json,
      max_attempts => 5
    )`);
}

/** Como um envio termina: pronto com a mídia gerada, ou recusado com o motivo (#185). */
export type UploadOutcome =
  { status: 'pronta'; mediaId: number } | { status: 'recusada'; reason: string };

/** Motivo de um arquivo que o worker não conseguiu decodificar. */
export const UNREADABLE_REASON = 'A imagem está corrompida ou não pôde ser lida';
/** Motivo de um envio cujas tentativas se esgotaram por falha transitória. */
export const FAILED_REASON = 'Falha no processamento';

/**
 * Fecha um envio que ainda está `processando` (#185). Envio já fechado, ou sem registro
 * (anterior à #184), fica como está: um job repetido não reabre nem troca o resultado.
 */
export async function closeUpload(
  db: Executor,
  upload: { siteId: string; uploadKey: string },
  outcome: UploadOutcome,
): Promise<void> {
  await db
    .update(mediaUploads)
    .set(
      outcome.status === 'pronta'
        ? { status: 'pronta', mediaId: outcome.mediaId }
        : { status: 'recusada', reason: outcome.reason },
    )
    .where(
      and(
        eq(mediaUploads.uploadKey, upload.uploadKey),
        eq(mediaUploads.siteId, upload.siteId),
        eq(mediaUploads.status, 'processando'),
      ),
    );
}

/** Envio já concluído que chega por importação (seed local): nome e data na biblioteca. */
export type ImportedUpload = {
  siteId: string;
  mediaId: number;
  originalName: string;
  uploadedAt: Date;
};

/**
 * Registra como `pronta` o envio de uma mídia importada, com a chave `import/<site>/<id>`
 * (não há arquivo cru). Repetir não duplica.
 */
export async function recordImportedUpload(db: Executor, upload: ImportedUpload): Promise<void> {
  await db
    .insert(mediaUploads)
    .values({
      uploadKey: `import/${upload.siteId}/${upload.mediaId}`,
      siteId: upload.siteId,
      originalName: upload.originalName,
      status: 'pronta',
      mediaId: upload.mediaId,
      uploadedAt: upload.uploadedAt,
    })
    .onConflictDoNothing();
}

/** Maior lista de chaves aceita numa leitura de envios. */
export const MAX_UPLOAD_KEYS = 100;

export type UploadState = {
  uploadKey: string;
  status: (typeof mediaUploads.$inferSelect)['status'];
  reason: string | null;
  mediaId: number | null;
};

/**
 * Estado dos envios do site pelas chaves (#185), para a tela acompanhar cada arquivo. Chaves
 * de outro site ou inexistentes ficam de fora.
 */
export async function getUploads(
  db: Executor,
  actor: Actor,
  siteId: string,
  keys: readonly string[],
): Promise<Result<UploadState[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  if (keys.length > MAX_UPLOAD_KEYS) {
    return refuse('media.upload_keys_invalid', `Até ${MAX_UPLOAD_KEYS} envios por consulta`);
  }
  if (keys.length === 0) return { ok: true, value: [] };
  const rows = await db
    .select({
      uploadKey: mediaUploads.uploadKey,
      status: mediaUploads.status,
      reason: mediaUploads.reason,
      mediaId: mediaUploads.mediaId,
    })
    .from(mediaUploads)
    .where(and(eq(mediaUploads.siteId, siteId), inArray(mediaUploads.uploadKey, [...keys])));
  return { ok: true, value: rows };
}
