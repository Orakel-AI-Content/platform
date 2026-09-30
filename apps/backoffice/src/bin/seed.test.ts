import { describe, expect, it } from 'vitest';

import { readFixture, readLocalSites, withLocalDomains } from './seed.ts';

describe('seed local', () => {
  it('aplica os domínios <site>.localhost do infra/local/seeds/sites.json', async () => {
    const local = await readLocalSites();
    expect(local['exemplo-a']?.domains).toEqual(['exemplo-a.localhost']);
    const lines = withLocalDomains(await readFixture('exemplo-a'), local);
    const config = lines.find((line) => line.type === 'config');
    expect(config?.type === 'config' && config.data.domains).toEqual(['exemplo-a.localhost']);
    expect(lines.filter((line) => line.type === 'content')).toHaveLength(3);
  });

  it('sem o arquivo, a fixture entra como está', async () => {
    const lines = withLocalDomains(
      await readFixture('exemplo-b'),
      await readLocalSites('/nao/existe'),
    );
    const config = lines.find((line) => line.type === 'config');
    expect(config?.type === 'config' && config.data.domains[0]).toBe('exemplo-b.com.br');
  });
});
