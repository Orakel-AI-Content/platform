// Ecme v1.3.10 (e5f9a1d): src/components/ui/utils/arrayIndexOf.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function arrayIndexOf(one: any, ofTarget: any) {
  if (Array.isArray(ofTarget)) {
    return ofTarget.indexOf(one) >= 0;
  }
  return one === ofTarget;
}
