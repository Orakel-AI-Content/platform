import type { Issue } from '@orakel/content-model';

// Erros das rotas HTTP em application/problem+json (RFC 9457), sem vazar detalhes internos.
export function problem(status: number, title: string, issues?: Issue[]): Response {
  return new Response(
    JSON.stringify({ type: 'about:blank', title, status, ...(issues ? { issues } : {}) }),
    {
      status,
      headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
    },
  );
}
