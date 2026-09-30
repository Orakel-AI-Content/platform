# Design de código do build-site

- `render` e `publish` recebem as dependências de fora (`buildSite`, `deployCloudflare`, `uploadEdgeLocal`, `uploadBuildCache`, `now`): os testes trocam por falsos; o `cli.ts` liga as reais.
- Toda falha esperada é `ClassifiedError` (ou erro do blog/content-client com `kind`); `classify` decide. Nada escreve código de saída fora do `cli.ts`.
- O resultado (`result.json`/`publish.json`) é escrito **sempre**, validado pelo schema do contrato.
- Variáveis por `parseEnv` (Zod); mensagens nunca com valores. Tokens só por variável.
- Caminhos da imagem em `src/paths.ts` (layout do workspace).

Anti-padrões: ler o banco ou a API no publish; classificar erro por texto de log quando dá para ler `kind`; tocar o artefato depois do `result.json`; escrever fora de `/build` e de pastas temporárias.
