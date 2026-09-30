import type { Task } from 'graphile-worker';

/**
 * Build de um site (build-runner). Backlog: iniciar os containers render e publish da
 * imagem site-builder pela API do Docker (via docker-socket-proxy), classificar a falha
 * pelo código de saída e baixar as mudanças pela lista do snapshot. Até lá, falha.
 */
export const build: Task = (payload) => {
  throw new Error(
    `Build indisponível: a imagem site-builder ainda não existe (${JSON.stringify(payload)})`,
  );
};
