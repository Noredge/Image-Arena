import { afterEach, expect, it, vi } from 'vitest';
import { ArenaSoundtrack, initialSound } from './soundtrack';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('stays silent by default, schedules distinct music, separates effects, pauses, and releases its context', async () => {
  vi.useFakeTimers(); const voices: { frequency: { value: number }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const contexts: FakeAudio[] = [];
  class FakeAudio {
    currentTime = 0; state = 'running'; destination = {}; close = vi.fn(async () => {}); resume = vi.fn(async () => {});
    constructor() { contexts.push(this); }
    createGain() { return { gain: { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
    createOscillator() { const v = { frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: () => {} }; voices.push(v); return v; }
  }
  vi.stubGlobal('AudioContext', FakeAudio);
  const engine = new ArenaSoundtrack(() => {}); engine.update(initialSound); engine.cue('win'); expect(contexts).toHaveLength(0);
  await engine.unlock(); engine.update(initialSound); await vi.advanceTimersByTimeAsync(200); expect(voices).toHaveLength(0);
  engine.update({ ...initialSound, music: true }); await vi.advanceTimersByTimeAsync(100); const rankingNote = voices[0].frequency.value;
  // An in-app UI update with the same stage must not restart or silence the score.
  const scheduledStops = voices.map(v => v.stop.mock.calls.length);
  engine.update({ ...initialSound, music: true });
  expect(voices.map(v => v.stop.mock.calls.length)).toEqual(scheduledStops);
  expect(vi.getTimerCount()).toBe(1);
  const count = voices.length; engine.cue('win'); expect(voices).toHaveLength(count);
  engine.update({ ...initialSound, music: true, mode: 'knockout' }); await vi.advanceTimersByTimeAsync(100);
  expect(voices[count].frequency.value).not.toBe(rankingNote);
  engine.update({ ...initialSound, effects: true }); const effectsBefore = voices.length; engine.cue('win'); expect(voices.length).toBe(effectsBefore + 4);
  engine.update({ ...initialSound, music: true, effects: true, paused: true }); const pausedCount = voices.length;
  engine.cue('vote'); await vi.advanceTimersByTimeAsync(5000); expect(voices).toHaveLength(pausedCount); expect(vi.getTimerCount()).toBe(0);
  engine.dispose(); expect(contexts[0].close).toHaveBeenCalledOnce();
});
