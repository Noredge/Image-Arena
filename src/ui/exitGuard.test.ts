import { describe, expect, it } from 'vitest';
import { choose, createSession, modes, type Session } from '../core/tournament';
import { hasOngoingMatch, warnBeforeUnload } from './exitGuard';

function event() { return new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent; }
describe('unfinished-match exit policy', () => {
  it('does not guard preparation, regardless of an imported image list', () => {
    expect(hasOngoingMatch(null)).toBe(false);
    const e = event(); warnBeforeUnload(e, null, false); expect(e.defaultPrevented).toBe(false);
  });
  for (const mode of modes) it(`${mode}: guards only until the competition finishes`, () => {
    let session: Session = createSession({ imageIds: Array.from({ length: 8 }, (_, i) => `image-${i}`), targetK: mode === 'ranking' ? 2 : 1, seed: 42, mode });
    expect(hasOngoingMatch(session)).toBe(true);
    const web = event(); warnBeforeUnload(web, session, false); expect(web.defaultPrevented).toBe(true);
    const native = event(); warnBeforeUnload(native, session, true); expect(native.defaultPrevented).toBe(false);
    let votes = 0;
    while (session.pending && votes++ < 100) session = choose(session, { matchId: session.pending.id, winnerId: session.pending.leftId });
    expect(session.completed).toBe(true); expect(hasOngoingMatch(session)).toBe(false);
    const complete = event(); warnBeforeUnload(complete, session, false); expect(complete.defaultPrevented).toBe(false);
  });
});
