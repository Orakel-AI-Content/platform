// Rótulo de campo no E2E: o asterisco do `FormItem` (campo obrigatório, #329) fica no texto do
// `<label>`, oculto só do leitor de tela, e o `getByLabel` com `exact` compara o texto inteiro.
// `getByLabel(fieldLabel('Nome'))` casa "Nome" e "*Nome", e nada além disso.
export const fieldLabel = (text: string) =>
  new RegExp(`^\\*?${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
