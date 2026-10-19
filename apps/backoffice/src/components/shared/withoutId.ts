/** Valores do formulário de edição: a entidade sem o ID (que é da URL). */
export function withoutId<T extends { id: number }>(item: T): Omit<T, 'id'> {
  const copy: Partial<T> = { ...item };
  delete copy.id;
  return copy as Omit<T, 'id'>;
}
