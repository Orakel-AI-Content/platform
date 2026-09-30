# 0002 – API do wrangler atrás de um proxy por Host

- Status: aceito
- Data: 2026-09-30

- Um processo Node (supervisor). Cada versão ativa é uma instância do `unstable_startWorker` do wrangler — o motor do `wrangler dev` (Miniflare/workerd) —, em `127.0.0.1` numa porta livre.
- Todas as instâncias usam o mesmo `dev.registry` (`<data>/registry`, limpo a cada partida): é assim que o binding `EVENTS` dos sites encontra o Worker `ae-sim` pelo nome. Sem registro, instâncias separadas não se enxergam.
- Proxy na 8080: `<site>.localhost` no `Host` → instância ativa; outro host ou site sem versão → 404. Administração na 8081.
- Instância que não fica pronta em 30 s é descartada (binding para serviço inexistente faz o wrangler esperar para sempre).

## Alternativas consideradas

Um processo `wrangler dev` por site (N processos, troca com reinício); `workerd` direto (reescreveria a lógica de assets).
