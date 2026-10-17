// Ecme v1.3.10 (e5f9a1d): src/components/ui/utils/shallowEqual.ts
// Adaptado (#205): tipos sem `any` (lint do monorepo); o comportamento não muda.
function is(x: unknown, y: unknown) {
  if (x === y) {
    return x !== 0 || y !== 0 || 1 / (x as number) === 1 / (y as number);
  }

  return x !== x && y !== y;
}

export default function shallowEqual(objA: unknown, objB: unknown) {
  if (is(objA, objB)) {
    return true;
  }

  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false;
  }

  const a = objA as Record<string, unknown>;
  const b = objB as Record<string, unknown>;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!Object.hasOwn(b, key) || !is(a[key], b[key])) {
      return false;
    }
  }

  return true;
}
