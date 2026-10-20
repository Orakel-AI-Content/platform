// Rótulo de campo nos testes de componente: o asterisco do `FormItem` (campo obrigatório, #329)
// fica no texto do `<label>`, oculto só do leitor de tela; `getByLabelText` compara o texto
// inteiro. Use `fieldLabel('Nome')` para casar "Nome" e "*Nome".
export const fieldLabel = (text: string) => (content: string) =>
  content.replace(/^\*/, '') === text;
