import * as tree from './winnerTree';
export type ImageId = string;
export type TournamentMode = 'ranking' | 'knockout' | 'gauntlet' | 'double' | 'groups';
export const modes: TournamentMode[] = ['ranking', 'knockout', 'gauntlet', 'double', 'groups'];
export const minimum: Record<TournamentMode, number> = { ranking: 1, knockout: 2, gauntlet: 3, double: 4, groups: 6 };
export type SessionConfig = { imageIds: string[]; targetK: number; seed: number; mode?: TournamentMode };
export type Match = tree.Match & { label?: string; kind?: 'group' | 'tie' | 'graph' | 'gauntlet'; group?: number; key?: string };
export type Decision = tree.Decision & { leftId?: string; rightId?: string; label?: string };
export type Event = { type: 'vote'; decision: Decision } | { type: 'veto'; ids: string[] };
export type Ranked = tree.Ranked;
type Source = { id: string | null } | { node: number; output: 'winner' | 'loser' };
export type Bout = { a: Source; b: Source; label: string; winner?: string | null; loser?: string | null; played?: boolean; left?: string | null; right?: string | null };
export type Group = { members: string[]; results: Record<string, Decision>; ties: Record<string, tree.Session>; qualifiers: string[]; points: Record<string, number> };
export type Session = {
  config: SessionConfig; layout: (string | null)[]; tree: (string | null | undefined)[];
  ranked: Ranked[]; history: Decision[]; events: Event[]; vetoed: string[]; revision: number; pending: Match | null; completed: boolean;
  ranking?: tree.Session; graph: Bout[]; graphKind?: 'double' | 'groups'; finalIndex?: number; resetIndex?: number;
  groups: Group[]; groupsLocked: boolean; queue: string[]; cursor: number; holder: string | null;
  streak: number; wins: Record<string, number>; longest: number; losses: Record<string, number>; automaticFinish: boolean;
};
function rng(seed: number) { let a = seed >>> 0; return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffled<T>(a: T[], seed: number) { const b = [...a], r = rng(seed); for (let i = b.length - 1; i; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const pairKey = (a: string, b: string) => JSON.stringify([a,b].sort());
const allowed = (s: Session, id: string | null | undefined) => id && !s.vetoed.includes(id) ? id : null;
function token(s: Session, m: Match) { return JSON.stringify([s.config.seed, s.revision, s.events.length, m.kind, m.nodeId, m.key, m.leftId, m.rightId, m.rankBeingSelected]); }
function ask(s: Session, m: Omit<Match,'id'>) { s.pending = { ...m, id: '' }; s.pending.id = token(s, s.pending); return s; }
function finish(s: Session, id: string | null, automatic = false) { s.pending = null; s.ranked = id ? [{ imageId: id, rank: 1 }] : []; s.completed = true; s.automaticFinish = automatic; return s; }
function graph(s: Session, leaves: (string | null)[], labelPrefix = '') {
  let refs: Source[] = leaves.map(id => ({ id })); const rounds: number[][] = [];
  while (refs.length > 1) {
    const row: number[] = [], label = refs.length === 2 ? '决赛' : refs.length === 4 ? '半决赛' : `${refs.length} 强赛`;
    for (let i = 0; i < refs.length; i += 2) { row.push(s.graph.length); s.graph.push({ a: refs[i], b: refs[i+1], label: labelPrefix + label }); }
    rounds.push(row); refs = row.map(node => ({ node, output: 'winner' }));
  }
  return rounds;
}
function doubleGraph(s: Session) {
  const wr = graph(s, s.layout, '胜者组 · ');
  let lower: Source[] = [];
  for (let i = 0; i < wr[0].length; i += 2) {
    const node = s.graph.length; s.graph.push({ a: { node: wr[0][i], output: 'loser' }, b: { node: wr[0][i+1], output: 'loser' }, label: '复活区 · 首轮' }); lower.push({ node, output:'winner' });
  }
  for (let r = 1; r < wr.length; r++) {
    lower = lower.map((a, i) => { const node = s.graph.length; s.graph.push({ a, b: { node: wr[r][wr[r].length - 1 - i], output:'loser' }, label: `复活区 · 第 ${r * 2} 轮` }); return { node, output:'winner' as const }; });
    if (r < wr.length - 1) { const next: Source[] = []; for (let i = 0; i < lower.length; i += 2) { const node = s.graph.length; s.graph.push({ a: lower[i], b: lower[i+1], label: `复活区 · 第 ${r * 2 + 1} 轮` }); next.push({ node, output:'winner' }); } lower = next; }
  }
  const a: Source = { node: wr.at(-1)![0], output: 'winner' }, b = lower[0];
  s.finalIndex = s.graph.length; s.graph.push({ a, b, label:'总决赛' });
  s.resetIndex = s.graph.length; s.graph.push({ a, b, label:'最终决胜局' }); s.graphKind = 'double';
}
function read(s: Session, ref: Source): string | null | undefined { if ('id' in ref) return allowed(s, ref.id); const value = s.graph[ref.node][ref.output]; return value === undefined ? undefined : allowed(s, value); }
function advanceGraph(s: Session): Session {
  for (let i = 0; i < s.graph.length; i++) {
    const b = s.graph[i];
    if (i === s.resetIndex) { const f = s.graph[s.finalIndex!]; if (!f.played || f.winner === read(s, f.a)) return finish(s, allowed(s, f.winner), !f.played); }
    if (b.winner !== undefined) continue;
    const a = read(s, b.a), c = read(s, b.b); if (a === undefined || c === undefined) throw new Error('晋级依赖未结算');
    b.left = a; b.right = c;
    if (!a || !c) { b.winner = a ?? c; b.loser = null; continue; }
    if (a === c) throw new Error('同一图片不能占据两个席位');
    return ask(s, { nodeId: i, leftId: a, rightId: c, rankBeingSelected: 1, kind:'graph', label: b.label });
  }
  const last = s.graph.at(-1)!; return finish(s, allowed(s, last.winner), !last.played);
}
export function groupCount(n: number) { return n < 6 ? 0 : 2 ** Math.floor(Math.log2(n / 3)); }
export function estimate(mode: TournamentMode, n: number, k = 3) {
  if (!n) return 0; if (mode === 'ranking') return n === 1 ? 0 : n - 1 + (Math.min(k,n)-1)*(Math.ceil(Math.log2(n))-1);
  if (mode === 'double') return 2*n-1;
  if (mode !== 'groups') return n-1;
  const g=groupCount(n); if (!g) return 0; const q=Math.floor(n/g), extra=n%g;
  return extra*q*(q+1)/2+(g-extra)*q*(q-1)/2+2*g-1;
}
function advanceGroups(s: Session): Session {
  if (s.groupsLocked) return advanceGraph(s);
  for (let gi=0; gi<s.groups.length; gi++) {
    const g=s.groups[gi], members=g.members.filter(id=>allowed(s,id));
    g.points=Object.fromEntries(members.map(id=>[id,0]));
    for (const d of Object.values(g.results)) if (members.includes(d.leftId!) && members.includes(d.rightId!)) g.points[d.winnerId]++;
    for (let i=0;i<members.length;i++) for(let j=i+1;j<members.length;j++) {
      const a=members[i], b=members[j], key=pairKey(a,b), result=g.results[key];
      if (!result) return ask(s,{nodeId:gi*100+i*10+j,leftId:a,rightId:b,rankBeingSelected:1,kind:'group',group:gi,key,label:`${groupName(gi)}组 · 循环赛`});

    }
    const scores=[...new Set(Object.values(g.points))].sort((a,b)=>b-a); const buckets:string[][]=[];
    for (const score of scores) {
      const tied=members.filter(id=>g.points[id]===score), mini=Object.fromEntries(tied.map(id=>[id,0]));
      for(let i=0;i<tied.length;i++) for(let j=i+1;j<tied.length;j++) mini[g.results[pairKey(tied[i],tied[j])].winnerId]++;
      for(const points of [...new Set(Object.values(mini))].sort((a,b)=>b-a)) buckets.push(tied.filter(id=>mini[id]===points));
    }
    g.qualifiers=[];
    for(const bucket of buckets) {
      const needed=Math.min(2-g.qualifiers.length,bucket.length); if(!needed) break;
      if(bucket.length===1) { g.qualifiers.push(bucket[0]); continue; }
      const key=JSON.stringify([bucket,needed]);
      const t=g.ties[key]??(g.ties[key]=tree.createSession({imageIds:bucket,targetK:needed,seed:(s.config.seed+gi)>>>0}));
      if(t.pending) return ask(s,{...t.pending,kind:'tie',group:gi,key,label:`${groupName(gi)}组 · 出线加赛`});
      g.qualifiers.push(...t.ranked.map(r=>r.imageId));
    }
  }
  s.groupsLocked=true; const left:(string|null)[]=[],right:(string|null)[]=[];
  for(let i=0;i<s.groups.length;i+=2) { const a=s.groups[i].qualifiers,b=s.groups[i+1].qualifiers; left.push(a[0]??null,b[1]??null); right.push(b[0]??null,a[1]??null); }
  s.graph=[]; graph(s,[...left,...right]); s.graphKind='groups'; return advanceGraph(s);
}
export function groupName(index:number) { let n=index+1, result=''; while(n) { n--; result=String.fromCharCode(65+n%26)+result; n=Math.floor(n/26); } return result; }
function advance(s:Session):Session {
  s.pending=null; const mode=s.config.mode??'ranking';
  if(mode==='ranking') {
    let t=s.ranking!;
    // Only after a veto, reuse explicit surviving pair answers, never inferred comparisons.
    if(s.vetoed.length) { const answers=new Map(s.history.filter(d=>d.leftId&&d.rightId&&!s.vetoed.includes(d.leftId)&&!s.vetoed.includes(d.rightId)).map(d=>[pairKey(d.leftId!,d.rightId!),d.winnerId]));
      while(t.pending) { const m=t.pending, answer=answers.get(pairKey(m.leftId,m.rightId)); if(!answer) break; t=tree.choose(t,{matchId:m.id,winnerId:answer}); }
    }
    s.ranking=t; s.tree=t.tree; s.ranked=t.ranked; s.completed=t.completed;
    if(t.pending) ask(s,{...t.pending,label:`第 ${t.pending.rankBeingSelected} 席争夺`}); return s;
  }
  if(mode==='knockout') {
    for(let start=s.layout.length/2; start>=1; start/=2) for(let node=start;node<start*2;node++) {
      if(s.tree[node]!==undefined) continue;
      const a=allowed(s,s.tree[node*2]),b=allowed(s,s.tree[node*2+1]);
      if(!a||!b) {s.tree[node]=a??b;continue;}
      return ask(s,{nodeId:node,leftId:a,rightId:b,rankBeingSelected:1});
    }
    return finish(s,allowed(s,s.tree[1]),!s.history.length || s.events.at(-1)?.type==='veto');
  }
  if(mode==='gauntlet') {
    s.holder=allowed(s,s.holder);
    while(s.cursor<s.queue.length && !allowed(s,s.queue[s.cursor])) s.cursor++;
    if(!s.holder && s.cursor<s.queue.length) { s.holder=s.queue[s.cursor++]; s.streak=0; }
    while(s.cursor<s.queue.length && !allowed(s,s.queue[s.cursor])) s.cursor++;
    if(s.cursor===s.queue.length) return finish(s,s.holder,s.events.at(-1)?.type==='veto');
    return ask(s,{nodeId:s.cursor,leftId:s.holder!,rightId:s.queue[s.cursor],rankBeingSelected:1,kind:'gauntlet',label:'擂主迎战'});
  }
  return mode==='double'?advanceGraph(s):advanceGroups(s);
}
export function createSession(config:SessionConfig):Session {
  const mode=config.mode??'ranking'; if(!modes.includes(mode)) throw new Error('未知赛制');
  if(mode!=='ranking'&&config.targetK!==1) throw new Error('此赛制只决出一位冠军');
  // Legacy singleton knockout can still be read/replayed; UI enforces the new two-image gate.
  if(['gauntlet','double','groups'].includes(mode)&&config.imageIds.length<minimum[mode]) throw new Error('参赛图片不足');
  const base=tree.createSession({...config,mode:mode==='knockout'?'knockout':'ranking'});
  const s:Session={...base,config:{...config,imageIds:[...config.imageIds],mode},events:[],vetoed:[],history:[],pending:null,completed:false,ranked:[],graph:[],groups:[],groupsLocked:false,queue:shuffled(config.imageIds,config.seed),cursor:0,holder:null,streak:0,wins:{},longest:0,losses:{},automaticFinish:false};
  if(mode==='ranking') s.ranking=base;
  if(mode==='double') doubleGraph(s);
  if(mode==='groups') { const count=groupCount(config.imageIds.length); let at=0; for(let i=0;i<count;i++) {const size=Math.floor(config.imageIds.length/count)+(i<config.imageIds.length%count?1:0);s.groups.push({members:s.queue.slice(at,at+=size),results:{},ties:{},qualifiers:[],points:{}});}}
  return advance(s);
}
function clone(s:Session):Session {
  // Ranking dominates large permutation tests; no need to copy immutable config/layout or recursive histories.
  if((s.config.mode??'ranking')==='ranking') return {...s,history:[...s.history],events:[...s.events],vetoed:[...s.vetoed]};
  return structuredClone(s);
}
export function choose(s:Session,decision:Decision):Session {
  const m=s.pending; if(!m||m.id!==decision.matchId) throw new Error('这场对决已过期');
  if(![m.leftId,m.rightId].includes(decision.winnerId)) throw new Error('胜者不属于这场对决');
  const n=clone(s),d={...decision,leftId:m.leftId,rightId:m.rightId,label:m.label};
  n.history.push(d);n.events.push({type:'vote',decision:d}); n.revision++;n.pending=null;
  const winner=d.winnerId,loser=winner===m.leftId?m.rightId:m.leftId;
  if(n.config.mode==='ranking') n.ranking=tree.choose(n.ranking!,{matchId:n.ranking!.pending!.id,winnerId:winner});
  else if(n.config.mode==='knockout') n.tree[m.nodeId]=winner;
  else if(m.kind==='gauntlet') { n.streak=winner===n.holder?n.streak+1:1; n.holder=winner;n.cursor++;n.wins[winner]=(n.wins[winner]??0)+1;n.longest=Math.max(n.longest,n.streak); }
  else if(m.kind==='graph') { const b=n.graph[m.nodeId];b.winner=winner;b.loser=loser;b.played=true;n.losses[loser]=(n.losses[loser]??0)+1; }
  else if(m.kind==='group') n.groups[m.group!].results[m.key!]=d;
  else if(m.kind==='tie') { const g=n.groups[m.group!],t=g.ties[m.key!];g.ties[m.key!]=tree.choose(t,{matchId:t.pending!.id,winnerId:winner}); }
  return advance(n);
}
export function veto(s:Session,ids:string[],revision=s.revision):Session {
  if(revision!==s.revision) throw new Error('这次否决已过期');
  if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!s.config.imageIds.includes(id)||s.vetoed.includes(id))) throw new Error('无效的否决对象');
  const n=clone(s);n.vetoed.push(...ids);n.events.push({type:'veto',ids:[...ids]});n.revision++;
  if(n.config.mode==='ranking') {
    const members=n.config.imageIds.filter(id=>!n.vetoed.includes(id));
    if(!members.length) { n.ranked=[];n.pending=null;n.completed=true;return n; }
    const layout=n.layout.map(id=>allowed(n,id)),t=tree.createSession({imageIds:members,targetK:Math.min(n.config.targetK,members.length),seed:n.config.seed});
    t.layout=layout;t.tree=Array(layout.length*2).fill(undefined);layout.forEach((id,i)=>t.tree[layout.length+i]=id);t.ranked=[];t.pending=null;t.completed=false;t.history=[];
    n.ranking=tree.advance(t);n.completed=false;return advance(n);
  }
  if(n.completed) { n.ranked=n.ranked.filter(r=>!ids.includes(r.imageId));return n; }
  if(n.config.mode==='knockout') n.tree=n.tree.map(id=>id===undefined?undefined:allowed(n,id));
  if(n.config.mode==='groups'&&!n.groupsLocked) for(const g of n.groups) if(ids.some(id=>g.members.includes(id))) g.ties={};
  return advance(n);
}
export function undo(s:Session):Session {
  if(!s.events.length) return s; let n=createSession(s.config);
  for(const e of s.events.slice(0,-1)) n=e.type==='veto'?veto(n,e.ids):choose(n,{matchId:n.pending!.id,winnerId:e.decision.winnerId});
  n.revision=s.revision+1;if(n.pending)n.pending={...n.pending,id:token(n,n.pending)};return n;
}
export function displayPair(s:Session):[string,string]|null { const m=s.pending;if(!m)return null;let hash=(s.config.seed^0x9e3779b9)>>>0;for(const c of JSON.stringify([m.kind,m.group,m.nodeId,m.leftId,m.rightId,m.rankBeingSelected]))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;return hash&1?[m.rightId,m.leftId]:[m.leftId,m.rightId]; }
export const getNextMatch=(s:Session)=>s.pending;
export const getRankedResults=(s:Session)=>s.ranked.map(r=>({...r}));
