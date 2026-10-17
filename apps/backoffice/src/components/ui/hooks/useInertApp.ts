// Hook do #209 (não é do Ecme): enquanto `active`, o contêiner da app fica `inert`
// (ui/utils/modalApp.ts). Usado pelo Dialog e pelo Drawer com o `isOpen` deles.
'use client';

import { useEffect } from 'react';
import { holdAppInert } from '../utils/modalApp';

export default function useInertApp(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return holdAppInert();
  }, [active]);
}
