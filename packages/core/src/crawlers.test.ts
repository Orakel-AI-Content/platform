import { describe, expect, it } from 'vitest';
import { CRAWLERS, blockedUserAgents } from './crawlers.ts';

describe('lista de crawlers', () => {
  it('bloqueia só o treinamento de IA por padrão', () => {
    expect(blockedUserAgents()).toEqual(
      CRAWLERS.filter((crawler) => crawler.category === 'ai-training').map(
        (crawler) => crawler.userAgent,
      ),
    );
    expect(blockedUserAgents()).not.toContain('Googlebot');
    expect(blockedUserAgents()).not.toContain('OAI-SearchBot');
  });

  it('o site libera (sem diferenciar maiúsculas) e bloqueia a mais, sem repetir', () => {
    const blocked = blockedUserAgents({ allow: ['ccbot'], block: ['NovoBot', 'GPTBot'] });
    expect(blocked).not.toContain('CCBot');
    expect(blocked).toContain('NovoBot');
    expect(blocked.filter((agent) => agent.toLowerCase() === 'gptbot')).toHaveLength(1);
  });

  it('não repete user-agents na lista', () => {
    const agents = CRAWLERS.map((crawler) => crawler.userAgent.toLowerCase());
    expect(new Set(agents).size).toBe(agents.length);
  });
});
