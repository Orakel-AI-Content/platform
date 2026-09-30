/** Quem pediu menos movimento no sistema não recebe rolagem animada. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
