// Troca de tema do cabeçalho (#240; workspace#46). Sem equivalente direto no Ecme: o
// `ThemeConfigurator/ModeSwitcher.tsx` é um Switcher claro/escuro dentro do configurador, que
// não entra. O gatilho segue o `UserProfileDropdown` (ícone no `header-action-item`, nome em
// `sr-only`) e o menu é o `Dropdown` do Ecme, com os itens como `menuitemradio`.
// - O modo inicial vem do servidor (o cookie que o layout raiz também lê), então o HTML já sai
//   com o item certo marcado. O ícone segue a escolha, nunca o tema resolvido do sistema, que o
//   servidor não conhece.
// - A troca grava ou apaga o cookie e troca a classe do <html> na hora; no modo sistema, a
//   classe sai da preferência, como no THEME_SCRIPT. Sem zustand (docs/migration/ecme.md).
'use client';

import { useState } from 'react';
import { PiDesktopDuotone, PiMoonDuotone, PiSunDuotone } from 'react-icons/pi';
import Dropdown from '@/components/ui/Dropdown';
import { applyThemeChoice, type ThemeChoice, type ThemeMode } from '@/configs/theme.config';
import type { IconType } from 'react-icons';

const OPTIONS: readonly { choice: ThemeChoice; label: string; Icon: IconType }[] = [
  { choice: 'light', label: 'Claro', Icon: PiSunDuotone },
  { choice: 'dark', label: 'Escuro', Icon: PiMoonDuotone },
  { choice: 'system', label: 'Sistema', Icon: PiDesktopDuotone },
];

type ThemeSwitcherProps = {
  /** Modo do cookie (`parseThemeMode`); `undefined` é o sistema. */
  initialMode: ThemeMode | undefined;
};

const ThemeSwitcher = ({ initialMode }: ThemeSwitcherProps) => {
  const [choice, setChoice] = useState<ThemeChoice>(initialMode ?? 'system');
  const current = OPTIONS.find((option) => option.choice === choice) ?? OPTIONS[2]!;

  const choose = (next: ThemeChoice) => {
    setChoice(next);
    applyThemeChoice(next);
  };

  return (
    <Dropdown
      className="flex"
      toggleClassName="flex items-center header-action-item header-action-item-hoverable"
      activeKey={choice}
      renderTitle={
        <div className="cursor-pointer flex items-center text-2xl">
          <current.Icon aria-hidden />
          <span className="sr-only">Tema: {current.label}</span>
        </div>
      }
      placement="bottom-end"
    >
      {OPTIONS.map(({ choice: option, label, Icon }) => (
        <Dropdown.Item
          key={option}
          eventKey={option}
          role="menuitemradio"
          aria-checked={option === choice}
          className="gap-2"
          onSelect={() => choose(option)}
        >
          <span className="text-xl">
            <Icon aria-hidden />
          </span>
          <span>{label}</span>
        </Dropdown.Item>
      ))}
    </Dropdown>
  );
};

export default ThemeSwitcher;
