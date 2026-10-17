// Ecme v1.3.10 (e5f9a1d): src/components/ui/Menu/context/groupContext.tsx
// Adaptado (#235): o valor diz se o item está dentro de um MenuGroup (o Ecme passava `null`),
// para o item virar <li> na <ul> do grupo.
'use client';

import { createContext } from 'react';

const GroupContext = createContext(false);

export const GroupContextProvider = GroupContext.Provider;

export const GroupContextConsumer = GroupContext.Consumer;

export default GroupContext;
