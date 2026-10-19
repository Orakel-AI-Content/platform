'use client';

import { useLayoutEffect } from 'react';

import { applyStoredTheme } from '@/configs/theme.config';

// Tema do sistema na renderização no cliente (#283): sem cookie, o THEME_SCRIPT do <head> põe a
// classe. Mas o 404 e a exceção antes do shell chegam no shell de erro do Next, sem o <head> do
// layout raiz, e a árvore inteira é montada no cliente sem classe de tema. O efeito de layout a
// põe antes da pintura; na renderização normal, só reaplica a mesma classe.
export function SystemTheme() {
  useLayoutEffect(() => applyStoredTheme(), []);
  return null;
}
