// Ecme v1.3.10 (e5f9a1d): src/configs/navigation-icon.config.tsx
// Adaptado (#236): só os ícones das áreas do Backoffice; o mapa é `as const`, para o `icon` da
// árvore (`navigation.config.ts`) aceitar só uma chave daqui, e os ícones são `aria-hidden`
// (o nome do item vem do título).
import {
  PiArticleDuotone,
  PiBrowsersDuotone,
  PiCheckCircleDuotone,
  PiFileTextDuotone,
  PiImagesDuotone,
  PiListDuotone,
  PiSquaresFourDuotone,
  PiTagDuotone,
  PiUsersDuotone,
} from 'react-icons/pi';
import type { JSX } from 'react';

const navigationIcon = {
  sites: <PiBrowsersDuotone aria-hidden />,
  siteOverview: <PiSquaresFourDuotone aria-hidden />,
  siteContents: <PiFileTextDuotone aria-hidden />,
  siteReview: <PiCheckCircleDuotone aria-hidden />,
  siteMedia: <PiImagesDuotone aria-hidden />,
  siteAuthors: <PiUsersDuotone aria-hidden />,
  siteTaxonomies: <PiTagDuotone aria-hidden />,
  siteMenus: <PiListDuotone aria-hidden />,
  siteInstitutional: <PiArticleDuotone aria-hidden />,
} as const satisfies Record<string, JSX.Element>;

export type NavigationIcons = typeof navigationIcon;

/** Chave de ícone que a árvore de navegação pode usar. */
export type NavigationIconKey = keyof NavigationIcons;

export default navigationIcon;
