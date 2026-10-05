export type ImageId = string;
export type Match = { id: string; nodeId: number; leftId: ImageId; rightId: ImageId; rankBeingSelected: number };
export type Decision = { matchId: string; winnerId: ImageId };
export type TournamentMode = 'ranking' | 'knockout';
export type SessionConfig = { imageIds: ImageId[]; targetK: number; seed: number; mode?: TournamentMode };
export type Ranked = { imageId: ImageId; rank: number };
export type Session = {
  config: SessionConfig;
  layout: (ImageId | null)[];
  tree: (ImageId | null | undefined)[];
  ranked: Ranked[];
  history: Decision[];
  revision: number;
  pending: Match | null;
  completed: boolean;
};

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function matchId(s: Session, node: number, left: string, right: string) {
  return JSON.stringify([s.config.seed, s.revision, s.history.length, s.ranked.length, node, left, right]);
}
// Mutates only the newly allocated session owned by create/choose/undo.
export function advance(s: Session): Session {
  if (s.config.mode === 'knockout') {
    // Finish each complete round before advancing to the next. Empty leaves are byes.
    for (let start = s.layout.length / 2; start >= 1; start /= 2) {
      for (let node = start; node < start * 2; node++) {
        if (s.tree[node] !== undefined) continue;
        const left = s.tree[node * 2], right = s.tree[node * 2 + 1];
        if (!left || !right) { s.tree[node] = left ?? right ?? null; continue; }
        s.pending = { id: matchId(s, node, left, right), nodeId: node, leftId: left, rightId: right, rankBeingSelected: 1 };
        return s;
      }
    }
    s.ranked = [{ imageId: s.tree[1]!, rank: 1 }];
    s.completed = true;
    return s;
  }
  const settle = (node: number): ImageId | null | undefined => {
    if (s.tree[node] !== undefined) return s.tree[node];
    const left = settle(node * 2);
    if (s.pending) return undefined;
    const right = settle(node * 2 + 1);
    if (s.pending) return undefined;
    if (!left || !right) return (s.tree[node] = left ?? right ?? null);
    s.pending = { id: matchId(s, node, left, right), nodeId: node, leftId: left, rightId: right, rankBeingSelected: s.ranked.length + 1 };
    return undefined;
  };
  while (!s.completed) {
    const winner = settle(1);
    if (s.pending) break;
    if (!winner) throw new Error('赛程没有有效候选者');
    s.ranked.push({ imageId: winner, rank: s.ranked.length + 1 });
    if (s.ranked.length === s.config.targetK) { s.completed = true; break; }
    let node = s.layout.length + s.layout.indexOf(winner);
    s.tree[node] = null;
    while ((node = Math.floor(node / 2)) > 0) s.tree[node] = undefined;
  }
  return s;
}

export function createSession(config: SessionConfig): Session {
  const { imageIds, targetK, seed } = config;
  if (!imageIds.length || new Set(imageIds).size !== imageIds.length || imageIds.some(id => !id)) throw new Error('需要非空且互不重复的图片 ID');
  if (!Number.isInteger(targetK) || targetK < 1 || targetK > imageIds.length) throw new Error('保留数量超出范围');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('无效的会话种子');
  if (config.mode && !['ranking', 'knockout'].includes(config.mode)) throw new Error('未知赛制');
  if (config.mode === 'knockout' && targetK !== 1) throw new Error('一败退场只决出一位冠军');
  const b = 2 ** Math.ceil(Math.log2(imageIds.length));
  const layout: (ImageId | null)[] = Array(b).fill(null);
  const rng = random(seed);
  const ids = shuffle(imageIds, rng);
  if (b === 1) layout[0] = ids[0];
  else {
    const pairs = shuffle(Array.from({ length: b / 2 }, (_, i) => i), rng);
    pairs.forEach((pair, i) => { layout[pair * 2] = ids[i]; });
    ids.slice(b / 2).forEach((id, i) => { layout[pairs[i] * 2 + 1] = id; });
  }
  const tree = Array<ImageId | null | undefined>(b * 2).fill(undefined);
  layout.forEach((id, i) => { tree[b + i] = id; });
  return advance({ config: { ...config, imageIds: [...imageIds] }, layout, tree, ranked: [], history: [], revision: 0, pending: null, completed: false });
}
export function getNextMatch(s: Session) { return s.pending; }
export function getRankedResults(s: Session): Ranked[] { return s.ranked.map(r => ({ ...r })); }
export function choose(s: Session, decision: Decision): Session {
  const match = s.pending;
  if (!match || decision.matchId !== match.id) throw new Error('这场对决已过期');
  if (decision.winnerId !== match.leftId && decision.winnerId !== match.rightId) throw new Error('胜者不属于这场对决');
  const next: Session = { ...s, tree: [...s.tree], ranked: [...s.ranked], history: [...s.history, { ...decision }], pending: null, revision: s.revision + 1 };
  next.tree[match.nodeId] = decision.winnerId;
  return advance(next);
}
export function undo(s: Session): Session {
  if (!s.history.length) return s;
  let restored = createSession(s.config);
  for (const decision of s.history.slice(0, -1)) {
    if (!restored.pending) throw new Error('重放记录不一致');
    restored = choose(restored, { matchId: restored.pending.id, winnerId: decision.winnerId });
  }
  restored.revision = s.revision + 1;
  if (restored.pending) {
    const m = restored.pending;
    restored.pending = { ...m, id: matchId(restored, m.nodeId, m.leftId, m.rightId) };
  }
  return restored;
}
export function displayPair(s: Session): [ImageId, ImageId] | null {
  const m = s.pending;
  if (!m) return null;
  // Display randomness is independent of the bracket and unaffected by undo revision.
  let hash = (s.config.seed ^ 0x9e3779b9) >>> 0;
  for (const char of JSON.stringify([m.nodeId, m.leftId, m.rightId, m.rankBeingSelected])) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return (hash & 1) ? [m.rightId, m.leftId] : [m.leftId, m.rightId];
}
