'use client';

import { useState } from 'react';

import { MediaDetails } from '@/components/media/MediaDetails';
import { MediaGrid } from '@/components/media/MediaGrid';
import type { MediaItem } from '@/components/media/MediaLibrary';
import { MediaPicker, type MediaPickerPage } from '@/components/media/MediaPicker';
import { MAX_FILES, UploadList, type UploadEntry } from '@/components/media/UploadQueue';
import { Card } from '@/components/ui/Card';

// Seções da mídia na vitrine (#389): o seletor do editor, os detalhes da biblioteca e a fila de
// envio, com dados fixos no lugar das Server Actions. O `load` do seletor lê páginas de uma
// lista local; a fila é a `UploadList` com uma entrada em cada estado, sem o `useUploadQueue`
// (XHR e leitura dos envios), para todos os estados ficarem na tela de uma vez. As miniaturas
// são SVG em `data:`, sem arquivo a versionar.

const CORES = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

/** Miniatura fixa: um retângulo colorido com o número da mídia. */
function thumbnail(id: number, width: number, height: number): string {
  const cor = CORES[id % CORES.length] ?? '#2563eb';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${cor}"/><text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-size="${Math.round(height / 4)}" text-anchor="middle" dominant-baseline="middle">${id}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function media(id: number, width: number, height: number, extra?: Partial<MediaItem>): MediaItem {
  return { id, width, height, sources: [], src: thumbnail(id, width, height), ...extra };
}

/** 30 imagens fixas: três páginas de 12 no seletor. */
const BIBLIOTECA: MediaItem[] = Array.from({ length: 30 }, (_, i) =>
  media(i + 1, i % 2 === 0 ? 480 : 320, i % 3 === 0 ? 320 : 480),
);

const PAGE_SIZE = 12;

function loadPage(page: number): Promise<MediaPickerPage | null> {
  const start = (page - 1) * PAGE_SIZE;
  return Promise.resolve({
    items: BIBLIOTECA.slice(start, start + PAGE_SIZE),
    total: BIBLIOTECA.length,
    page,
    pageSize: PAGE_SIZE,
  });
}

/** Uma imagem com envio registrado (nome longo, data e formatos) e uma sem. */
const DETALHES: MediaItem[] = [
  media(41, 1200, 800, {
    originalName: 'capa-da-materia-sobre-o-festival-de-inverno-de-2026-na-serra.jpg',
    uploadedAt: '2026-07-14T13:05:00.000Z',
    formats: ['avif', 'jpeg', 'webp'],
  }),
  media(42, 640, 640),
];

const FUSO = 'America/Sao_Paulo';

/** Uma entrada em cada estado da fila, na ordem em que acontecem. */
const ENVIOS: UploadEntry[] = [
  { id: 1, name: 'abertura.jpg', state: { kind: 'aguardando' } },
  { id: 2, name: 'galeria-01.png', state: { kind: 'enviando', percent: 42 } },
  { id: 3, name: 'galeria-02.webp', state: { kind: 'processando', uploadKey: 'k3', deadline: 0 } },
  { id: 4, name: 'galeria-03.avif', state: { kind: 'pronta' } },
  { id: 5, name: 'documento.pdf', state: { kind: 'recusada', reason: 'formato não aceito' } },
  { id: 6, name: 'panorama-grande.jpg', state: { kind: 'demorando' } },
];

const AVISO = `Só as ${MAX_FILES} primeiras imagens foram enviadas; envie as outras em seguida.`;

export function MediaShowcase() {
  const [escolhida, setEscolhida] = useState<MediaItem | null>(null);
  return (
    <>
      <section aria-labelledby="vitrine-media-picker" className="space-y-3">
        <h2 id="vitrine-media-picker" className="text-lg font-semibold">
          MediaPicker
        </h2>
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <MediaPicker
              label="Escolher imagem"
              load={loadPage}
              onSelect={(_, item) => setEscolhida(item)}
            />
            <p className="text-sm">
              {escolhida
                ? `Escolhida: Mídia ${escolhida.id} · ${escolhida.width}×${escolhida.height}`
                : 'Nenhuma imagem escolhida.'}
            </p>
          </div>
        </Card>
      </section>

      <section aria-labelledby="vitrine-media-details" className="space-y-3">
        <h2 id="vitrine-media-details" className="text-lg font-semibold">
          MediaDetails
        </h2>
        <Card>
          <MediaGrid label="Imagens de exemplo">
            {DETALHES.map((item) => (
              <li key={item.id}>
                <MediaDetails item={item} timeZone={FUSO} />
              </li>
            ))}
          </MediaGrid>
        </Card>
      </section>

      <section aria-labelledby="vitrine-fila-de-envio" className="space-y-3">
        <h2 id="vitrine-fila-de-envio" className="text-lg font-semibold">
          Fila de envio
        </h2>
        <Card>
          <UploadList entries={ENVIOS} notice={AVISO} />
        </Card>
      </section>
    </>
  );
}
