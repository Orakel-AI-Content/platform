# Documentação do Worker de borda

Docs desta unidade. O que vale para o repositório inteiro está em `docs/` da raiz; o formato
dos eventos, em `packages/events/docs/`.

| Documento                          | Quando consultar                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `project-spec.yaml`                | Decisões desta unidade, com origem (herda as da raiz)                               |
| `architecture/overview.md`         | Papel na borda, regras, bindings                                                    |
| `architecture/code-design.md`      | Módulos, o que toca o runtime, padrões e anti-padrões                               |
| `architecture/folder-structure.md` | Onde criar; como acrescentar regra, evento ou binding                               |
| `conventions/testing.md`           | Testes em Node, prova no `wrangler dev`, user-agent nos testes de carga             |
| `decisions/`                       | 0001 entrada; 0002 fluxo e respostas; 0003 testes em Node; 0004 wrangler.jsonc base |
