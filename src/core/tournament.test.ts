import { describe, expect, it } from 'vitest';
import { choose, createSession, displayPair, undo, type Session } from './tournament';

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i).padStart(3, '0'));
function finish(s: Session, vote = (a: string, b: string) => a < b ? a : b) {
  let steps = 0;
  while (s.pending) {
    if (++steps > 1024) throw new Error('未终止');
    s = choose(s, { matchId: s.pending.id, winnerId: vote(s.pending.leftId, s.pending.rightId) });
  }
  return s;
}
describe('winner tree', () => {
  it('validates boundaries and completes a singleton without voting', () => {
    expect(() => createSession({ imageIds: [], targetK: 1, seed: 0 })).toThrow();
    for (const k of [0, 3, 1.5]) expect(() => createSession({ imageIds: ids(2), targetK: k, seed: 0 })).toThrow();
    expect(() => createSession({ imageIds: ['x', 'x'], targetK: 1, seed: 0 })).toThrow();
    const s = createSession({ imageIds: ids(1), targetK: 1, seed: 0 });
    expect(s.completed).toBe(true); expect(s.history).toHaveLength(0); expect(s.ranked).toEqual([{ imageId: '000', rank: 1 }]);
  });
  it('matches the full-order oracle for every N=2..64 and every K, across 5 seeds', () => {
    for (let n = 2; n <= 64; n++) for (let k = 1; k <= n; k++) for (const seed of [0, 1, 73, 51923, 4294967295]) {
      const s = finish(createSession({ imageIds: ids(n), targetK: k, seed }));
      expect(s.ranked.map(r => r.imageId)).toEqual(ids(k));
      expect(s.history.length).toBeLessThanOrEqual(n - 1 + (k - 1) * (Math.ceil(Math.log2(n)) - 1));
      if (k === 1) expect(s.history).toHaveLength(n - 1);
    }
  }, 30000);
  it('keeps A/B eligible after they meet in the first round', () => {
    let seed = 0; let s: Session;
    do { s = createSession({ imageIds: ids(4), targetK: 3, seed: seed++ }); } while (Math.floor(s.layout.indexOf('000') / 2) !== Math.floor(s.layout.indexOf('001') / 2));
    expect(finish(s).ranked.map(r => r.imageId)).toEqual(ids(3));
  });
  it('checks every permutation of eight fixed leaves: Top3 in 10–11 comparisons', () => {
    const values = ids(8); let count = 0;
    function permute(a: string[], at = 0) {
      if (at === a.length) {
        const s = finish(createSession({ imageIds: a, targetK: 3, seed: 41 }));
        if (s.ranked.map(r => r.imageId).join() !== ids(3).join() || s.history.length < 10 || s.history.length > 11 || s.pending) throw new Error('错误的 Top3');
        count++; return;
      }
      for (let i = at; i < a.length; i++) { [a[i], a[at]] = [a[at], a[i]]; permute(a, at + 1); [a[i], a[at]] = [a[at], a[i]]; }
    }
    permute(values); expect(count).toBe(40320);
  }, 30000);
  it('undoes across ranks and completion, replays original answers and can branch', () => {
    const initial = createSession({ imageIds: ids(17), targetK: 17, seed: 12 });
    const snapshots: Session[] = [initial];
    while (snapshots.at(-1)!.pending) {
      const s = snapshots.at(-1)!; const m = s.pending!;
      snapshots.push(choose(s, { matchId: m.id, winnerId: m.leftId < m.rightId ? m.leftId : m.rightId }));
    }
    let s = snapshots.at(-1)!;
    for (let i = snapshots.length - 2; i >= 0; i--) {
      s = undo(s);
      expect(s.tree).toEqual(snapshots[i].tree); expect(s.ranked).toEqual(snapshots[i].ranked); expect(displayPair(s)).toEqual(displayPair(snapshots[i]));
    }
    expect(finish(s).ranked).toEqual(snapshots.at(-1)!.ranked);
    const m = s.pending!; const next = choose(s, { matchId: m.id, winnerId: m.leftId });
    const back = undo(next);
    expect(() => choose(back, { matchId: m.id, winnerId: m.rightId })).toThrow();
    const changed = choose(back, { matchId: back.pending!.id, winnerId: m.rightId });
    expect(changed.tree[m.nodeId]).toBe(m.rightId); expect(s.tree).toEqual(initial.tree);
  });
  it('rejects stale, duplicate and invalid decisions without mutating state', () => {
    const s = createSession({ imageIds: ids(5), targetK: 3, seed: 9 }); const m = s.pending!;
    expect(() => choose(s, { matchId: m.id, winnerId: 'bad' })).toThrow();
    const next = choose(s, { matchId: m.id, winnerId: m.leftId });
    expect(() => choose(next, { matchId: m.id, winnerId: m.leftId })).toThrow(); expect(s.history).toHaveLength(0);
    expect(createSession(s.config)).toEqual(s);
  });
  it('terminates without duplicates even with cyclic preferences', () => {
    const s = finish(createSession({ imageIds: ids(31), targetK: 31, seed: 57 }), (a, b) => (Number(a) - Number(b) + 300) % 3 === 1 ? a : b);
    expect(new Set(s.ranked.map(r => r.imageId)).size).toBe(31);
  });
});
