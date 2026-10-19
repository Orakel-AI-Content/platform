// Ecme v1.3.10 (e5f9a1d): src/components/ui/ConfigProvider/ConfigProvider.ts
// Adaptado (#317): locale padrão `pt-br` (nome do locale no dayjs), não `en`: o Backoffice é só
// pt-BR e nenhum ConfigProvider é montado, então o calendário lê este padrão.
'use client';

import { createContext, useContext } from 'react';
import { SIZES } from '../utils/constants';
import type { TypeAttributes } from '../@types/common';

export type Config = {
  mode: 'light' | 'dark';
  locale: string;
  controlSize: TypeAttributes.ControlSize;
  direction: TypeAttributes.Direction;
  ui?: {
    card?: {
      cardBordered?: boolean;
    };
    button?: {
      disableClickFeedback?: boolean;
    };
  };
};

export const defaultConfig: Config = {
  direction: 'ltr',
  mode: 'light',
  locale: 'pt-br',
  controlSize: SIZES.MD,
} as const;

export const ConfigContext = createContext<Config>(defaultConfig);

const ConfigProvider = ConfigContext.Provider;

export const ConfigConsumer = ConfigContext.Consumer;

export function useConfig() {
  return useContext(ConfigContext);
}

export default ConfigProvider;
