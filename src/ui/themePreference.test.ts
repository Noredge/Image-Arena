import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const bootstrap = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8');
function load(saved: string | null, dark: boolean, blocked = false, full: string | null = null) {
  const dataset: Record<string, string> = {};
  let metaColor = '';
  runInNewContext(bootstrap, {
    localStorage: { getItem: (key: string) => {
      if (blocked) throw new Error('Storage unavailable');
      return key === 'image-arena-settings' ? full : saved;
    } },
    window: { matchMedia: () => ({ matches: dark }) },
    document: { documentElement: { dataset }, querySelector: () => ({ setAttribute: (_: string, value: string) => { metaColor = value; } }) },
  });
  return { theme: dataset.theme, metaColor };
}

describe('theme bootstrap before app paint', () => {
  it('uses day mode for a first visit regardless of system appearance', () => {
    expect(load(null, true)).toEqual({ theme: 'light', metaColor: '#f6f2e9' });
    expect(load(null, false)).toEqual({ theme: 'light', metaColor: '#f6f2e9' });
  });
  it('retains explicit preference over the system setting', () => {
    expect(load('light', true).theme).toBe('light');
    expect(load('dark', false).theme).toBe('dark');
  });
  it('recovers from invalid or inaccessible storage', () => {
    expect(load('unknown', true).theme).toBe('light');
    expect(load('dark', false, true).theme).toBe('light');
  });
  it('honors complete saved settings before a stale legacy preference', () => {
    expect(load('light', false, false, JSON.stringify({version:1,values:{theme:'dark'}}))).toEqual({theme:'dark',metaColor:'#252323'});
    expect(load('dark', true, false, JSON.stringify({version:1,values:{theme:'light'}}))).toEqual({theme:'light',metaColor:'#f6f2e9'});
  });
  it('matches application defaults for missing fields or corrupt full settings', () => {
    for(const raw of ['{','{"version":8}',JSON.stringify({version:1,values:{volume:0}})]) {
      expect(load('dark', true, false, raw).theme).toBe('light');
    }
  });
});
