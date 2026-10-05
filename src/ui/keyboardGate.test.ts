import { expect, it } from 'vitest';
import { KeyboardGate, keyIdentity } from './keyboardGate';
it('a held key cannot vote in a subsequent match until release', () => {
  const gate = new KeyboardGate();
  expect(gate.accept('ArrowLeft', false)).toBe(true);
  for (let nextMatch = 0; nextMatch < 10; nextMatch++) expect(gate.accept('ArrowLeft', true)).toBe(false);
  expect(gate.accept('ArrowLeft', false)).toBe(false);
  gate.release('ArrowLeft'); expect(gate.accept('ArrowLeft', false)).toBe(true);
  gate.clear(); expect(gate.accept('ArrowLeft', false)).toBe(true);
});
it('an empty physical code does not merge Control and Z into one held key', () => {
  const gate = new KeyboardGate();
  const control = keyIdentity({ code: '', key: 'Control' });
  const z = keyIdentity({ code: '', key: 'z' });
  expect(gate.accept(control, false)).toBe(true);
  expect(gate.accept(z, false)).toBe(true);
  expect(gate.accept(z, true)).toBe(false);
  gate.release(z); gate.release(control);
  expect(gate.accept(control, false)).toBe(true);
  expect(gate.accept(z, false)).toBe(true);
  expect(keyIdentity({ code: 'KeyZ', key: 'z' })).toBe('KeyZ');
});
it('normalizes accessible vote keys while preferring physical layout codes', () => {
  expect(keyIdentity({ code: '', key: 'a' })).toBe('KeyA');
  expect(keyIdentity({ code: '', key: 'D' })).toBe('KeyD');
  expect(keyIdentity({ code: '', key: 'ArrowLeft' })).toBe('ArrowLeft');
  expect(keyIdentity({ code: '', key: 'ArrowRight' })).toBe('ArrowRight');
  expect(keyIdentity({ code: 'KeyQ', key: 'a' })).toBe('KeyQ');
});
