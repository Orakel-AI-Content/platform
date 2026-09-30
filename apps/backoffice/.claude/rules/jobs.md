---
paths:
  - 'src/jobs/**'
  - 'src/bin/**'
---

# Jobs e processos

- Task nova em `src/jobs/tasks/`, registrada em `WORKER_TASKS` (e no `WORKER_CRONTAB` se periódica); o `build-runner` só tem `build`.
- Enfileire na transação da gravação (`graphile_worker.add_job`, como `scheduleBuild`), com `job_key` e fila nomeada quando precisar serializar.
- Job crítico pinga `pingHeartbeat(HEARTBEAT_BASE_URL, <nome>)` ao terminar.
- Processos começam por `runProcess` (env validado, Sentry, falha fatal logada) e encerram o pool.
  Detalhes: `docs/architecture/overview.md`
