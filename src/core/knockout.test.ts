import { describe, expect, it } from 'vitest';
import { choose, createSession, displayPair, undo } from './tournament';
import { battleCopy, bracketRounds } from './competition';
import { exportRecord } from '../platform/browser';

describe('traditional knockout', () => {
  it('plays round by round with exactly N-1 matches and no eliminated contestant returning, including byes', () => {
    for (let n = 1; n <= 65; n++) for (const seed of [0, 13, 817, 4294967295]) {
      const ids = Array.from({ length: n }, (_, i) => String(i).padStart(3, '0'));
      let s = createSession({ imageIds: ids, targetK: 1, seed, mode: 'knockout' });
      const out = new Set<string>(); let depth = Infinity;
      while (s.pending) {
        const m = s.pending;
        expect(out.has(m.leftId) || out.has(m.rightId)).toBe(false);
        expect(Math.floor(Math.log2(m.nodeId))).toBeLessThanOrEqual(depth); depth = Math.floor(Math.log2(m.nodeId));
        const [winner, loser] = [m.leftId, m.rightId].sort(); out.add(loser);
        s = choose(s, { matchId: m.id, winnerId: winner });
      }
      expect(s.history).toHaveLength(n - 1); expect(s.ranked).toEqual([{ imageId: '000', rank: 1 }]);
      expect(out.size).toBe(n - 1); expect(s.completed).toBe(true);
      const record = exportRecord(s, []); expect(record.mode).toBe('knockout'); expect(record.algorithm).toBe('single-elimination-v1');
    }
  });
  it('undo restores round, bracket, display order, and permits a different winner even after final', () => {
    let s = createSession({ imageIds: ['a','b','c','d','e'], targetK: 1, seed: 7, mode: 'knockout' });
    while (s.pending) {
      const before = s, m = s.pending;
      const next = choose(s, { matchId: m.id, winnerId: m.leftId });
      const back = undo(next);
      expect(back.tree).toEqual(before.tree); expect(bracketRounds(back)).toEqual(bracketRounds(before));
      expect(displayPair(back)).toEqual(displayPair(before)); expect(battleCopy(back)).toEqual(battleCopy(before));
      expect(() => choose(back, { matchId: m.id, winnerId: m.rightId })).toThrow('过期');
      s = choose(back, { matchId: back.pending!.id, winnerId: m.rightId });
    }
    expect(s.ranked).toHaveLength(1); expect(undo(s).completed).toBe(false);
  });
  it('rejects invented lower rankings and leaves ranking mode available', () => {
    expect(() => createSession({ imageIds: ['a','b'], seed: 0, targetK: 2, mode: 'knockout' })).toThrow('冠军');
    expect(createSession({ imageIds: ['a','b'], seed: 0, targetK: 2, mode: 'ranking' }).pending).not.toBeNull();
  });
});
