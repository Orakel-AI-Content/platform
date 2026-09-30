# @orakel/elements

Web Components do degrau 2 da escada de interatividade. Só comportamento sobre o HTML que o
servidor já mandou (light DOM): sem JavaScript, o degrau 1 continua funcionando.

| Elemento         | Faz                                                         |
| ---------------- | ----------------------------------------------------------- |
| `<ok-carousel>`  | Botões de anterior e próximo sobre a trilha com scroll-snap |
| `<ok-menu>`      | Esc e clique fora fecham o `<details>` do menu              |
| `<ok-copy-link>` | Copia o link e anuncia; sem clipboard, seleciona o campo    |
| `<ok-share>`     | Compartilhamento nativo, onde houver                        |

```astro
<ok-copy-link data-copied="Link copiado" data-failed="Selecione o link e copie">
  <input data-ok-url readonly value={url} />
  <button type="button" data-ok-copy hidden>
    Copiar link
  </button>
  <span role="status" data-ok-status></span>
</ok-copy-link>
<script>
  import '@orakel/elements/copy-link';
</script>
```

Comandos (nesta pasta): `pnpm test` · `pnpm lint` · `pnpm typecheck`. Container limpo (da
raiz): `docker buildx bake elements-test`. Contrato de cada elemento:
`docs/decisions/0003-componentes.md`. Documentação: `docs/README.md`.
