import { describe, expect, it, vi } from 'vitest';

import { AeSqlError, memoryAeSqlClient } from '../domain/audience/sql.ts';
import { aeSqlClient, clickhouseSqlClient } from './clickhouse.ts';

const URL_WITH_CREDENTIALS = 'http://orakel:s3cr%40to@clickhouse:8123';

function respond(status: number, body: string) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }));
}

describe('clickhouseSqlClient', () => {
  it('manda a SQL no corpo, as credenciais nos cabeçalhos e devolve as linhas', async () => {
    const fetchImpl = respond(200, JSON.stringify({ data: [{ site: 'a', views: 3 }], rows: 1 }));
    const client = clickhouseSqlClient({ url: URL_WITH_CREDENTIALS, fetch: fetchImpl });

    expect(await client.query('SELECT 1')).toEqual([{ site: 'a', views: 3 }]);

    const [url, init] = fetchImpl.mock.calls[0]!;
    const target = url as URL;
    expect(target.origin).toBe('http://clickhouse:8123');
    expect(target.username).toBe('');
    expect(target.password).toBe('');
    expect(Object.fromEntries(target.searchParams)).toEqual({
      database: 'analytics',
      default_format: 'JSON',
      output_format_json_quote_64bit_integers: '0',
    });
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('SELECT 1');
    expect(init?.headers).toMatchObject({
      'X-ClickHouse-User': 'orakel',
      'X-ClickHouse-Key': 's3cr@to',
    });
  });

  it('o banco da URL vence o padrão; sem usuário, sem cabeçalhos de credencial', async () => {
    const fetchImpl = respond(200, '{"data":[]}');
    await clickhouseSqlClient({
      url: 'http://localhost:8123/?database=default',
      fetch: fetchImpl,
    }).query('SELECT 1');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect((url as URL).searchParams.get('database')).toBe('default');
    expect(init?.headers).not.toHaveProperty('X-ClickHouse-User');
  });

  it('erro HTTP vira AeSqlError com a mensagem do servidor, sem a URL nem a senha', async () => {
    const server = 'Code: 62. DB::Exception: Syntax error: failed at position 1 (SELEC)';
    const client = clickhouseSqlClient({
      url: URL_WITH_CREDENTIALS,
      fetch: respond(400, `${server}\n`),
    });
    const error = await client.query('SELEC 1').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AeSqlError);
    expect((error as Error).message).toBe(`ClickHouse 400: ${server}`);
    expect((error as Error).message).not.toMatch(/s3cr|clickhouse:8123/);
  });

  it('falha de rede e resposta fora do JSON viram AeSqlError sem a URL', async () => {
    const offline = clickhouseSqlClient({
      url: URL_WITH_CREDENTIALS,
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed')),
    });
    await expect(offline.query('SELECT 1')).rejects.toThrow(/^ClickHouse indisponível$/);

    const broken = clickhouseSqlClient({
      url: URL_WITH_CREDENTIALS,
      fetch: respond(200, '{"data":[{"n":1}\nCode: 241. DB::Exception: Memory limit'),
    });
    await expect(broken.query('SELECT 1')).rejects.toThrow(/fora do formato JSON.*Code: 241/s);
  });
});

describe('aeSqlClient', () => {
  it('escolhe o adaptador pelo transporte', async () => {
    const fetchImpl = respond(200, '{"data":[{"n":1}]}');
    const client = aeSqlClient(
      { AE_SQL_TRANSPORT: 'clickhouse', AE_SQL_URL: URL_WITH_CREDENTIALS },
      fetchImpl,
    );
    expect(await client.query('SELECT 1 AS n')).toEqual([{ n: 1 }]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe('memoryAeSqlClient', () => {
  it('registra as consultas e devolve a resposta configurada', async () => {
    const client = memoryAeSqlClient(() => [{ n: 1 }]);
    expect(await client.query('SELECT 1 AS n')).toEqual([{ n: 1 }]);
    expect(client.queries).toEqual(['SELECT 1 AS n']);
  });
});
