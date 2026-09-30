# Testes do elements

- `pnpm test`: Vitest com happy-dom. `mount(html)` põe o HTML do degrau 1 e espera o `setup`; `flush()` espera microtasks; `setScroll` fixa medidas de layout.
- APIs do navegador (`navigator.clipboard`, `navigator.share`, `matchMedia`) entram com `vi.stubGlobal` e saem no `afterEach`.
- Casos obrigatórios por elemento: parte do HTML faltando (nada muda), comportamento principal, falha da API, remoção do documento (listeners soltos).
- Navegador real: `e2e/interactions.spec.ts` do blog (`pnpm --filter @orakel/blog test:a11y`).
