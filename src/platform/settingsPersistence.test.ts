import { it, expect, vi, afterEach } from 'vitest';
const native = vi.hoisted(() => ({ enabled: false, values: null as unknown, warning: '', invoke: vi.fn() }));
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.enabled, invoke: native.invoke }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); native.enabled = false; native.values = null; native.warning = ''; native.invoke.mockReset(); });
function storage(entries: [string, string][] = []) {
  const data = new Map(entries);
  vi.stubGlobal('document', { documentElement: { dataset: { theme: 'dark' } }, querySelector: () => null });
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  return data;
}
function saved(values: unknown) { return JSON.stringify({ version: 1, values }); }
it('starts in day mode with music and effects enabled at 20%, irrespective of the document theme', async () => {
  storage(); const m = await import('./settings'); await m.initializeSettings();
  expect(m.usePreference('theme')[0]).toBe('light'); expect(m.usePreference('music')[0]).toBe(true);
  expect(m.usePreference('effects')[0]).toBe(true); expect(m.usePreference('volume')[0]).toBe(20);
});
it('preserves saved dark/mute preferences across reload without persisting session data', async () => {
  const data = storage([['image-arena-settings', saved({ theme: 'dark', music: false, effects: false, volume: 0 })]]);
  let m = await import('./settings'); await m.initializeSettings();
  expect(m.usePreference('theme')[0]).toBe('dark'); expect(m.usePreference('music')[0]).toBe(false);
  expect(m.usePreference('effects')[0]).toBe(false); expect(m.usePreference('volume')[0]).toBe(0);
  m.setPreference('preferredK', 5); m.setPreference('mode', 'double'); m.setPreference('selectedAction', 'move');
  m.setPreference('rejectedAction', 'recycle'); m.setPreference('showPreview', true); await m.flushSettings();
  vi.resetModules(); m = await import('./settings'); await m.initializeSettings();
  expect(m.usePreference('preferredK')[0]).toBe(5); expect(m.usePreference('mode')[0]).toBe('double');
  expect(m.usePreference('rejectedAction')[0]).toBe('recycle'); expect(m.usePreference('volume')[0]).toBe(0);
  expect(m.usePreference('music')[0]).toBe(false); expect(m.usePreference('effects')[0]).toBe(false);
  expect(data.get('image-arena-settings')).not.toMatch(/confirmed|images|events/i);
});
it('preserves an explicit legacy dark theme when no full settings exist', async () => {
  storage([['image-arena-theme', 'dark']]); const m = await import('./settings'); await m.initializeSettings();
  expect(m.usePreference('theme')[0]).toBe('dark');
});
it('fills missing fields without overriding saved independent mute/volume choices', async () => {
  storage([['image-arena-settings', saved({ effects: false, volume: 7 })]]);
  const m = await import('./settings'); await m.initializeSettings();
  expect(m.usePreference('music')[0]).toBe(true); expect(m.usePreference('effects')[0]).toBe(false);
  expect(m.usePreference('volume')[0]).toBe(7); expect(m.usePreference('theme')[0]).toBe('light');
});
it('keeps old settings in Chinese and persists an explicit English choice without losing other settings', async () => {
  const data=storage([['image-arena-settings',saved({theme:'dark',volume:7,linked:false})]]);
  let m=await import('./settings');await m.initializeSettings();expect(m.usePreference('language')[0]).toBe('zh');
  m.setPreference('language','en');await m.flushSettings();
  vi.resetModules();m=await import('./settings');await m.initializeSettings();
  expect(m.usePreference('language')[0]).toBe('en');expect(m.usePreference('theme')[0]).toBe('dark');
  expect(m.usePreference('volume')[0]).toBe(7);expect(m.usePreference('linked')[0]).toBe(false);
  expect(JSON.parse(data.get('image-arena-settings')!).version).toBe(1);
});
it('preserves language in native settings updates and defaults invalid languages to Chinese', async () => {
  storage();desktop({language:'en',music:false,volume:0});const m=await import('./settings');await m.initializeSettings();
  expect(m.usePreference('language')[0]).toBe('en');m.setPreference('theme','dark');await m.flushSettings();
  expect(native.invoke).toHaveBeenCalledWith('save_settings',{values:expect.objectContaining({language:'en',music:false,volume:0,theme:'dark'})});
  expect(m.sanitize({language:'fr',volume:7}).language).toBe('zh');
});
it('backs up malformed settings and uses shared defaults without preventing startup', async () => {
  const data = storage([['image-arena-settings', '{"version":8}'], ['image-arena-theme', 'dark']]);
  const m = await import('./settings'); await m.initializeSettings();
  expect(m.useSettingsNotice()).toBeTruthy(); expect([...data.keys()].some(key => key.startsWith('image-arena-settings-broken-'))).toBe(true);
  expect(m.usePreference('theme')[0]).toBe('light'); expect(m.usePreference('music')[0]).toBe(true);
});
it('uses defaults with blocked storage and tolerates failed preference writes', async () => {
  storage(); vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } });
  const m = await import('./settings'); await m.initializeSettings();
  expect(m.usePreference('theme')[0]).toBe('light'); expect(m.usePreference('effects')[0]).toBe(true);
  m.setPreference('volume', 42); await m.flushSettings(); expect(m.usePreference('volume')[0]).toBe(42); expect(m.useSettingsNotice()).toBeTruthy();
});
function desktop(values: unknown, warning = '') {
  native.enabled = true; native.values = values; native.warning = warning;
  native.invoke.mockImplementation(async (command: string) => { if (command === 'load_settings') return { values: native.values, warning: native.warning }; });
}
it('uses identical first-launch defaults on desktop with mocked native storage', async () => {
  storage(); desktop(null); const m = await import('./settings'); await m.initializeSettings();
  for (const [key, expected] of Object.entries(m.defaults)) expect(m.usePreference(key as keyof typeof m.defaults)[0]).toBe(expected);
  expect(native.invoke).toHaveBeenCalledWith('load_settings');
});
it('preserves native dark/mute settings and sends updates only to mocked native storage', async () => {
  storage(); desktop({ theme: 'dark', music: false, effects: false, volume: 0 });
  const m = await import('./settings'); await m.initializeSettings();
  expect(m.usePreference('theme')[0]).toBe('dark'); expect(m.usePreference('music')[0]).toBe(false);
  expect(m.usePreference('effects')[0]).toBe(false); expect(m.usePreference('volume')[0]).toBe(0);
  m.setPreference('volume', 8); await m.flushSettings();
  expect(native.invoke).toHaveBeenCalledWith('save_settings', { values: expect.objectContaining({ theme: 'dark', music: false, effects: false, volume: 8 }) });
});
it('uses shared defaults when desktop reports corrupt settings', async () => {
  storage(); desktop({}, 'Recovered corrupt settings'); const m = await import('./settings'); await m.initializeSettings();
  expect(m.useSettingsNotice()).toBe('Recovered corrupt settings');
  expect(m.usePreference('theme')[0]).toBe('light'); expect(m.usePreference('volume')[0]).toBe(20);
});
