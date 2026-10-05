import { expect, it } from 'vitest';
import { TouchTap } from './touchTap';
it('accepts a stationary primary touch only once', () => {
  const tap = new TouchTap(); tap.start(1, 20, 30);
  tap.move(1, 23, 33); expect(tap.release(1)).toBe(true); expect(tap.release(1)).toBe(false);
});
it('a scroll is not converted to a tap even after moving back', () => {
  const tap = new TouchTap(); tap.start(1, 20, 30);
  tap.move(1, 20, 40); tap.move(1, 20, 30); expect(tap.release(1)).toBe(false);
});
it('a second finger cancels opening while keeping the primary lifecycle until release', () => {
  const tap = new TouchTap(); tap.start(1, 20, 30); tap.cancel();
  expect(tap.has(1)).toBe(true); expect(tap.release(2)).toBe(false); expect(tap.has(1)).toBe(true);
  expect(tap.release(1)).toBe(false); expect(tap.has(1)).toBe(false);
});
it('pointer cancellation/reset never leaves a tap to open on a later release', () => {
  const tap = new TouchTap(); tap.start(1, 20, 30); tap.cancel(); expect(tap.release(1)).toBe(false);
  tap.start(2, 20, 30); tap.reset(); expect(tap.release(2)).toBe(false);
  tap.start(3, 20, 30); expect(tap.release(3)).toBe(true);
});
it('unrelated pointer movement or release cannot alter a primary tap', () => {
  const tap = new TouchTap(); tap.start(1, 20, 30); tap.move(2, 100, 100);
  expect(tap.release(2)).toBe(false); expect(tap.release(1)).toBe(true);
});
