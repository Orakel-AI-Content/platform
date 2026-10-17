// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Avatar } from './index.tsx';

// AvatarGroup do Ecme (#211): mostra até `maxCount` avatares e resume o resto em "+N", com a
// dica "N a mais" ligada ao avatar omitido.

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

const pessoas = ['AL', 'BM', 'CS', 'DR', 'EF', 'GH'];

describe('Avatar.Group', () => {
  it('até maxCount avatares e o resto como "+N"', () => {
    const { container } = render(
      <Avatar.Group maxCount={3} chained>
        {pessoas.map((iniciais) => (
          <Avatar key={iniciais}>{iniciais}</Avatar>
        ))}
      </Avatar.Group>,
    );

    const group = container.querySelector('.avatar-group')!;
    expect(group.className).toContain('avatar-group-chained');
    expect([...group.querySelectorAll('.avatar')].map((avatar) => avatar.textContent)).toEqual([
      'AL',
      'BM',
      'CS',
      '+3',
    ]);
  });

  it('sem passar do maxCount, mostra todos', () => {
    const { container } = render(
      <Avatar.Group maxCount={8}>
        {pessoas.map((iniciais) => (
          <Avatar key={iniciais}>{iniciais}</Avatar>
        ))}
      </Avatar.Group>,
    );

    expect(container.querySelectorAll('.avatar')).toHaveLength(6);
  });

  it('omittedAvatarTooltip: a dica "N a mais" descreve o avatar omitido', async () => {
    render(
      <Avatar.Group maxCount={2} omittedAvatarTooltip omittedAvatarTooltipProps={{ isOpen: true }}>
        {pessoas.map((iniciais) => (
          <Avatar key={iniciais}>{iniciais}</Avatar>
        ))}
      </Avatar.Group>,
    );

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('4 a mais');
    const omitted = screen.getByText('+4').closest('.avatar')!;
    expect(omitted.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(omitted.parentElement?.className).toContain('tooltip-wrapper');
  });

  it('onOmittedAvatarClick no clique do avatar omitido', () => {
    const onClick = vi.fn();
    render(
      <Avatar.Group maxCount={1} onOmittedAvatarClick={onClick}>
        <Avatar>AL</Avatar>
        <Avatar>BM</Avatar>
      </Avatar.Group>,
    );

    const omitted = screen.getByText('+1').closest('.avatar')!;
    expect(omitted.className).toContain('cursor-pointer');
    fireEvent.click(omitted);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
