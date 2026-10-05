import { useCallback, useEffect, useRef, useState } from 'react';
import { choose, createSession, displayPair, undo, veto, modes, minimum, estimate, type Session } from '../core/tournament';
import { downloadResults, importPictures, releasePictures, copyNames, isDesktop, desktop, type Picture } from '../platform';
import type { NativeBatch } from '../platform/desktop';
import { Icon } from '../ui/Icon';
import { Viewer } from '../ui/Viewer';
import { Dialog } from '../ui/Dialog';
import { KeyboardGate, keyIdentity } from '../ui/keyboardGate';
import { hasOngoingMatch, warnBeforeUnload } from '../ui/exitGuard';
import { SettingsPopover } from '../ui/SettingsPopover';
import { useCompactLayout } from '../ui/useCompactLayout';
import type { ImportProgress } from '../platform/browser';
import { Comparison } from '../ui/Comparison';
import { ArenaScene } from '../ui/ArenaScene';
import { SceneMotionControl, useSceneMotion } from '../ui/SceneMotion';
import { ThemeControl } from '../ui/ThemeControl';
import { Organizer } from '../ui/Organizer';
import type { OrganizationPlan } from '../platform/desktop';

import { battleCopy, competitionCopy, resultCopy, vetoCopy, phaseLine } from '../core/competition';
import { usePreference, useSettingsNotice, flushSettings } from '../platform/settings';
import { CompetitionDetails } from '../ui/CompetitionDetails';
import { Bracket } from '../ui/Bracket';
import { SoundControl, useArenaSound } from '../ui/SoundControl';
import '../ui/competition.css';

type Confirmation = { title: string; body: string; action: string; run: () => void };
export function App() {
  const compact = useCompactLayout();
  const [pictures, setPictures] = useState<Picture[]>([]);
  const picturesRef = useRef<Picture[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [preferredK, setPreferredK] = usePreference('preferredK');
  const [mode, setMode] = usePreference('mode');
  const [excluded, setExcluded] = useState<string[]>([]);
  const settingsNotice = useSettingsNotice();
  const candidates = pictures.filter(p => !excluded.includes(p.id));
  const k = Math.min(preferredK, candidates.length || preferredK);
  const setK = (n: number) => { if (Number.isInteger(n) && n >= 1 && n <= 256) setPreferredK(n); };
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const importingRef = useRef(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [viewer, setViewer] = useState<Picture | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [organizationPlan, setOrganizationPlan] = useState<OrganizationPlan | null>(null);
  const [filesLocked, setFilesLocked] = useState(false);
  const filesLockedRef = useRef(false);
  const fileActivity = useRef(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [toast, setToast] = useState('');
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const heldKeys = useRef(new KeyboardGate());
  const inspecting = useRef(false);
  const [linked, setLinked] = usePreference('linked');
  const nativeDropHandler = useRef<(batch: NativeBatch) => void>(() => {});
  const nativeCloseHandler = useRef<() => void>(() => {});
  const closingNativeWindow = useRef(false);
  const stage = !session ? 'prepare' : session.completed ? 'results' : 'battle';
  const activeMode = session?.config.mode ?? mode;
  const copy = competitionCopy[activeMode];
  const seats = activeMode === 'ranking' ? (session?.config.targetK ?? k) : 1;
  const sound = useArenaSound(activeMode, stage, session?.groupsLocked ? 'knockout' : session?.pending?.label?.startsWith('复活区') ? 'lower' : '');
  const words = session ? battleCopy(session) : null;
  const sceneMotion = useSceneMotion(stage === 'battle' || !!viewer || !!confirmation || organizing);
  const match = session?.pending;
  const pair = session ? displayPair(session) : null;
  const byId = new Map(pictures.map(p => [p.id, p]));
  const ready = !!pair && pair.every(id => loaded.has(id)) && !loadError;
  const syncSession = (s: Session | null) => { sessionRef.current = s; setSession(s); setLoaded(new Set()); setLoadError(false); };
  const syncPictures = (p: Picture[]) => { picturesRef.current = p; setPictures(p); };
  const validK = Number.isInteger(seats) && seats >= 1 && seats <= candidates.length;
  useEffect(() => { window.scrollTo(0, 0); }, [stage]);
  useEffect(() => {
    if (!compact || isDesktop || !viewer) return;
    const token = crypto.randomUUID();
    history.pushState({ ...history.state, arenaViewer: token }, '');
    const back = () => { if (history.state?.arenaViewer !== token) setViewer(null); };
    window.addEventListener('popstate', back);
    return () => {
      window.removeEventListener('popstate', back);
      // Let the dialog finish closing before traversing browser history.
      // Navigating during modal teardown can stall a pending touch event.
      if (history.state?.arenaViewer === token) setTimeout(() => { if (history.state?.arenaViewer === token) history.back(); }, 0);
    };
  }, [compact, viewer?.id]);
  useEffect(() => () => { releasePictures(picturesRef.current); clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!isDesktop) return;
    let disposed = false; let cleanup: (() => void)[] = [];
    void desktop().then(async d => {
      for (const stop of await Promise.all([
        d.watchNativeDrops(batch => nativeDropHandler.current(batch), error => setErrors([String(error)])),
        d.watchClose(() => nativeCloseHandler.current()),
      ])) { if (disposed) stop(); else cleanup.push(stop); }
    }).catch(error => setErrors([`桌面连接失败：${String(error)}`]));
    return () => { disposed = true; cleanup.forEach(stop => stop()); };
  }, []);
  useEffect(() => {
    if (isDesktop) void desktop().then(d => d.setImportEnabled(stage === 'prepare' && !viewer && !confirmation && !organizing)).catch(error => setErrors([String(error)]));
  }, [stage, viewer, confirmation, organizing]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent); window.addEventListener('drop', prevent);
    const unload = (e: BeforeUnloadEvent) => warnBeforeUnload(e, sessionRef.current, isDesktop);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent); window.removeEventListener('beforeunload', unload); };
  }, []);
  async function importFiles(files: File[]) {
    if (!files.length || importingRef.current || sessionRef.current) return;
    importingRef.current = true; setImporting(true); setDragging(false); setErrors([]);
    setImportProgress({ completed: 0, total: files.length });
    try {
      const result = await importPictures(files, picturesRef.current, setImportProgress);
      const all = [...picturesRef.current, ...result.pictures];
      syncPictures(all); setErrors(result.errors);
      if (!result.errors.length) setImportProgress(null);

      if (result.pictures.length) setToast(`${result.pictures.length} 位选手到了。${phaseLine(activeMode,'arrival',picturesRef.current.length)}`);
    } finally { importingRef.current = false; setImporting(false); if (input.current) input.current.value = ''; }
  }
  async function importNative(batch?: NativeBatch) {
    if (importingRef.current || sessionRef.current || viewer || confirmation) {
      if (batch) void desktop().then(d => d.releaseNativeIds(batch.images.map(i => i.id))).catch(() => {});
      return;
    }
    importingRef.current = true; setImporting(true); setErrors([]);
    setImportProgress(null);
    try {
      const d = await desktop(); const selectedBatch = batch ?? await d.pickNativeImages();
      if (!selectedBatch.images.length && !selectedBatch.errors.length) return;
      const result = await d.loadNativeBatch(selectedBatch);
      const all = [...picturesRef.current, ...result.pictures];
      syncPictures(all); setErrors(result.errors);

      if (result.pictures.length) setToast(`${result.pictures.length} 位选手到了。${phaseLine(activeMode,'arrival',picturesRef.current.length)}`);
    } catch (error) { setErrors([`导入失败：${error instanceof Error ? error.message : String(error)}`]); }
    finally { importingRef.current = false; setImporting(false); }
  }
  nativeDropHandler.current = batch => { void importNative(batch); };
  nativeCloseHandler.current = () => {
    if (closingNativeWindow.current) return;
    if (fileActivity.current) { setToast('正在检查或处理文件，请等待完成；执行时可停止后续文件。'); return; }
    const close = () => {
      if (closingNativeWindow.current) return;
      closingNativeWindow.current = true;
      void flushSettings().then(() => desktop()).then(d => d.closeNativeWindow()).catch(error => { closingNativeWindow.current = false; setToast(String(error)); });
    };
    if (!hasOngoingMatch(sessionRef.current)) { close(); return; }
    setConfirmation({ title: '现在散场？', body: '比赛还没结束，关闭会丢失本轮进度，磁盘原图不会改变。', action: '关闭选图擂台', run: close });
  };
  function removePicture(id: string) {
    const remaining = pictures.filter(p => p.id !== id);
    releasePictures(pictures.filter(p => p.id === id)); syncPictures(remaining);
    setExcluded(old => old.filter(value => value !== id));
  }
  function start(replay = false) {
    const ids = replay && sessionRef.current ? sessionRef.current.config.imageIds.filter(id => !sessionRef.current!.vetoed.includes(id)) : candidates.map(p => p.id);
    if (ids.length < minimum[mode] || importingRef.current) return;
    const replayVetoes = [...(sessionRef.current?.vetoed ?? [])];
    if (replay) setExcluded(old => [...new Set([...old, ...replayVetoes])]);
    const targetK = mode === 'ranking' ? Math.min(preferredK, ids.length) : 1;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    syncSession(createSession({ imageIds: ids, targetK, seed, mode })); setOrganizationPlan(null); setErrors([]); setToast('');
    if(ids.length > 1) sound.cue('start');
  }
  function judge(ids: string[], revision: number) {
    const current = sessionRef.current;
    if (!current || current.revision !== revision || lock.current || filesLockedRef.current || organizing || confirmation || inspecting.current) return;
    lock.current = true; setCooldown(true); setSelected(null); setViewer(null);
    if(organizationPlan && !organizationPlan.started) void desktop().then(d => d.discardOrganization(organizationPlan.id)).catch(() => {});
    setOrganizationPlan(null);
    const next = veto(current, ids, revision); syncSession(next);
    const message = vetoCopy(current, next, ids);
    setToast('裁判示意：' + ids.map(id => String(current.config.imageIds.indexOf(id)+1).padStart(2,'0') + ' 号').join('、') + '本轮退场。' + message); sound.cue(ids.length > 1 ? 'vetoBoth' : 'veto');
    timer.current = setTimeout(() => { lock.current = false; setCooldown(false); }, 400);
  }
  const vote = useCallback((id: string, matchId: string) => {
    const current = sessionRef.current;
    if (lock.current || inspecting.current || !ready || viewer || confirmation || organizing || filesLockedRef.current || !current?.pending || current.pending.id !== matchId) return;
    lock.current = true; setCooldown(true); setToast('');
    const next = choose(current, { matchId, winnerId: id });
    sound.cue('vote');
    sessionRef.current = next; setSelected(id);
    timer.current = setTimeout(() => {
      syncSession(next); setSelected(null);
      if (next.completed && next.ranked.length) sound.cue(next.automaticFinish ? 'settle' : 'win');
      if (next.ranked.length > current.ranked.length && !next.completed) setToast(`${next.ranked.length === 1 ? '冠军诞生' : `第 ${next.ranked.length} 名就位`}！接下来争夺第 ${next.ranked.length + 1} 名。`);
      timer.current = setTimeout(() => { lock.current = false; setCooldown(false); }, 180);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
  }, [ready, viewer, confirmation, organizing]);
  const goBack = useCallback(() => {
    if (organizing || filesLockedRef.current || lock.current || inspecting.current || !sessionRef.current?.events.length || viewer || confirmation) return;
    syncSession(undo(sessionRef.current)); setToast(sessionRef.current?.config.mode==='groups'&&sessionRef.current?.groupsLocked?'出线名单仍锁定，上一场淘汰赛重看。':phaseLine(sessionRef.current?.config.mode ?? 'ranking','undo',sessionRef.current?.events.length ?? 0)); sound.cue('undo');
  }, [viewer, confirmation, organizing]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const code = keyIdentity(e);
      if (!heldKeys.current.accept(code, e.repeat)) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], dialog') || viewer || confirmation) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); goBack(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!match || !pair) return;
      if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(code)) {
        e.preventDefault(); vote(pair[['ArrowLeft', 'KeyA'].includes(code) ? 0 : 1], match.id);
      }
    };
    const keyup = (e: KeyboardEvent) => heldKeys.current.release(keyIdentity(e));
    const blur = () => heldKeys.current.clear();
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur); };
  }, [match, pair, vote, goBack, viewer, confirmation]);
  function confirmReset(type: 'prepare' | 'replay' | 'clear') {
    if (filesLockedRef.current && type !== 'clear') { setToast('本轮文件已处理，请开始新一批图片。'); return; }
    const options = {
      prepare: { title: '返回准备区？', body: '本轮对决会清空，图片会保留。你可以调整图片和入选数量。', action: '返回准备区' },
      replay: { title: '用这些图片再玩一轮？', body: '重新抽签会清空本轮对决与名次。需要保留结果的话，请先下载清单。', action: '重新抽签' },
      clear: { title: '开始新一批图片？', body: '本轮图片与结果将从页面移除，磁盘原图不会改变。', action: '开始新一批' },
    };
    const reset = () => {
      setConfirmation(null); setToast('');
      if (type === 'replay') start(true);
      else { const denied = [...(sessionRef.current?.vetoed ?? [])]; setExcluded(old => [...new Set([...old, ...denied])]); syncSession(null); if (type === 'clear') { filesLockedRef.current = false; setFilesLocked(false); setOrganizationPlan(null); releasePictures(picturesRef.current); syncPictures([]); setExcluded([]); setErrors([]); setImportProgress(null); } }
    };
    if (hasOngoingMatch(sessionRef.current)) setConfirmation({ ...options[type], run: reset });
    else reset();
  }
  const roundPictures = session ? pictures.filter(p => session.config.imageIds.includes(p.id)) : pictures;
  const outcome = session ? resultCopy(session) : null;
  const ranked = session?.ranked.map(r => ({ ...r, picture: byId.get(r.imageId)! })) ?? [];
  return <div className={`app ${stage}${compact ? ' compact' : ''}`}>
    <ArenaScene moving={sceneMotion.moving} />
    <header className="topbar"><button type="button" className="brand" aria-label="选图擂台，返回准备区" disabled={cooldown || filesLocked} onClick={() => { if (session) confirmReset('prepare'); }}><span className="brand-icon"><Icon name="arena" size={26} /></span><span>选图擂台<small>IMAGE ARENA</small></span></button>
      <nav aria-label="当前进度" className="steps"><span className={stage === 'prepare' ? 'current' : 'done'}><Icon name="image" size={16} />选手入场</span><i /><span className={stage === 'battle' ? 'current' : stage === 'results' ? 'done' : ''}><Icon name="arena" size={16} />两图过招</span><i /><span className={stage === 'results' ? 'current' : ''}><Icon name="trophy" size={16} />{activeMode === 'ranking' ? '心头好落座' : '冠军加冕'}</span></nav>
      <div className="top-action">{compact ? <SettingsPopover className="compact-settings"><summary>设置</summary><div><SoundControl sound={sound} /><SceneMotionControl {...sceneMotion} /><ThemeControl /></div></SettingsPopover> : <><SoundControl sound={sound} /><SceneMotionControl {...sceneMotion} /><ThemeControl /></>}{session ? <button className="quiet" disabled={cooldown || filesLocked} onClick={() => confirmReset('prepare')}>返回准备区</button> : <span className="local-badge"><Icon name="shield" size={16} /> 原图只在本机</span>}</div>
    </header>
    {settingsNotice && <p className="settings-notice" role="status">{settingsNotice}</p>}
    {stage === 'prepare' && <main className="prepare-main">
      <section className="intro"><span className="eyebrow sticker"><Icon name="star" size={16} />今日开擂 · 好图请上台</span><h1>好图过招，<span>胜者为王。</span></h1><p>{copy.intro}</p><span className="hero-doodle doodle-left" aria-hidden="true">✦</span><span className="hero-doodle doodle-right" aria-hidden="true">✧</span></section>
      <fieldset className="competition-picker"><legend>今天怎么过招？</legend>{modes.map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}><strong>{competitionCopy[value].name}</strong><span>{competitionCopy[value].description}</span><small>至少 {minimum[value]} 张</small></button>)}</fieldset>
      <div className="setup-grid"><section className="import-panel">
        <div className="section-heading"><h2>选手席 <span className="count">{pictures.length.toString().padStart(2, '0')}</span></h2><span>PNG / JPEG / WebP</span></div>
        {!isDesktop && <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp" className="file-input" aria-label="导入图片" disabled={importing} onChange={e => void importFiles(Array.from(e.target.files ?? []))} />}
        <button className={`drop-zone ${dragging ? 'dragging' : ''} ${pictures.length ? 'compact' : ''}`} disabled={importing} onClick={() => isDesktop ? void importNative() : input.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => {
          e.preventDefault(); setDragging(false);
          if (isDesktop) return;
          if (Array.from(e.dataTransfer.items).some(item => item.webkitGetAsEntry?.()?.isDirectory)) {
            setImportProgress(null); setErrors(['拖入的内容包含文件夹。请直接拖入图片文件；本轮没有读取该文件夹。']); return;
          }
          void importFiles(Array.from(e.dataTransfer.files));
        }}>
          <span className="upload-symbol"><Icon name={pictures.length ? 'plus' : 'upload'} size={30} /></span><strong>{importing ? '正在检查图片…' : pictures.length ? '继续添加图片' : '张张都不错？那就过两招。'}</strong><span>{importing ? '逐张读取，原文件保持不变' : pictures.length ? '拖入或点击选择' : '拖入图片，或点这里挑选'}</span>
        </button>
        {!!pictures.length && <div className="thumbnail-grid">{pictures.map((p, index) => <div className={`thumbnail ${excluded.includes(p.id) ? 'excluded' : ''}`} key={p.id}><button className="thumb-preview" aria-label={`查看候选 ${index + 1}：${p.file.name}`} onClick={() => setViewer(p)}><img src={p.url} alt="" loading="lazy" /><span>{p.file.name}</span></button>{excluded.includes(p.id) && <button className="restore-candidate" onClick={() => setExcluded(old => old.filter(id => id !== p.id))}>重新纳入</button>}<button className="remove" disabled={importing} aria-label={`移除候选 ${index + 1}：${p.file.name}`} onClick={() => removePicture(p.id)}><Icon name="close" size={14} /></button></div>)}</div>}
        {importProgress && (importing || errors.length > 0) && <div className="import-progress" role="status" aria-live="polite"><progress value={importProgress.completed} max={Math.max(1, importProgress.total)} aria-label="图片导入进度" /><span>{importing ? '正在处理' : '处理完成'} {importProgress.completed} / {importProgress.total}</span></div>}
        {!!errors.length && <div className="import-errors" role="alert"><strong>{errors.length} 个文件未加入</strong><ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
        {!isDesktop && compact && <p className="mobile-import-note">从相册或文件多选 PNG / JPEG / WebP。手机建议先试少量图片；大图较多时可能需要更久。HEIC 等不支持的格式请先转为 JPEG。</p>}
        <p className="local-note"><Icon name="shield" size={16} /> 只读取图片，不上传，也不修改原文件。</p>
      </section>
      <aside className="setup-options">{mode === 'ranking' ? <><div className="seat-title"><Icon name="trophy" size={26} /><h2>留几个心头好？<small>按喜欢的顺序，慢慢选</small></h2></div><div className="seat-options">{[1, 2, 3].map(num => <button className={k === num ? 'active' : ''} key={num} disabled={candidates.length > 0 && num > candidates.length} aria-pressed={k === num} onClick={() => { setK(num); }}><b>{num}</b><span>{num === 1 ? '冠军' : num === 2 ? '前两名' : '前三名'}</span></button>)}</div>
        <label className="custom-k">自定义数量 <input type="number" aria-label="自定义入选数量" min={1} max={candidates.length || 1} value={Number.isNaN(k) ? '' : k} disabled={!candidates.length} onChange={e => { setK(e.target.value === '' ? NaN : Number(e.target.value)); }} /><span>/ {candidates.length || '—'}</span></label>
        </> : <div className="knockout-invitation"><Icon name="trophy" size={26} /><div><h2>{copy.name}</h2><p>{copy.description}</p><small>退场先后不作排名；选错仍可撤销改判。</small></div></div>}
        <div className="start-area"><button className="primary start" aria-label={candidates.length === 1 && mode === 'ranking' ? '查看唯一候选' : '开始对决'} disabled={candidates.length < minimum[mode] || !validK || importing} onClick={() => start()}>{candidates.length === 1 && mode === 'ranking' ? '查看唯一候选' : copy.start}<Icon name="arrow" /></button><p>{candidates.length < minimum[mode] ? `再来 ${minimum[mode] - candidates.length} 张，就能开${copy.name}。` : `${candidates.length} 位选手 · ${mode === 'ranking' || mode === 'double' ? '至多' : '预计'} ${estimate(mode, candidates.length, k)} 场${mode === 'groups' ? '，另计同分加赛' : ''}`}</p>{estimate(mode,candidates.length,k)>80 && <small>这场会比较长，想快一点可以选一败退场。</small>}</div>
      </aside></div>
      <footer className="prepare-footer"><div className="postcard-note"><span>{sceneMotion.paused || sceneMotion.reduced ? '停一下，也不耽误喜欢。' : '风正好，慢慢选。'}</span></div>{isDesktop && <button className="quiet" onClick={() => void desktop().then(d => d.openOperationRecords()).catch(e => setToast(String(e)))}>打开整理记录文件夹</button>}<span>{isDesktop ? '临时对局 · 关闭后需重新导入' : '临时会话 · 刷新后需重新导入'}</span></footer>
    </main>}
    {stage === 'battle' && session && match && pair && <main className="battle-main">
      <div className="battle-heading"><div><span className="eyebrow stage-badge"><Icon name="trophy" size={14} />{copy.name} · {words?.badge}</span><h1>{words?.title}</h1></div><div className="battle-meta"><span>已 PK <strong data-testid="comparison-count">{session.history.length}</strong> 场</span><button className="secondary" disabled={!session.events.length || cooldown || filesLocked} onClick={goBack}><Icon name="undo" size={17} />撤销 <kbd>Ctrl Z</kbd></button></div></div>
      <Comparison compact={compact} vetoBoth={() => judge(pair, session.revision)} voteVerb={match.kind === 'group' ? '得分' : activeMode === 'gauntlet' ? '留台' : activeMode === 'double' ? '胜出' : undefined} flashText={match.kind === 'group' ? '这一分，记下了。' : match.kind === 'tie' ? '出线加赛，这票给你。' : activeMode === 'gauntlet' ? session.cursor + 1 >= session.queue.length ? '最后一席，留给你。' : '留步，下一位请。' : activeMode === 'double' ? '这场拿下，继续过招。' : undefined} veto={id => judge([id], session.revision)} roleLabels={pair.map(id => activeMode === 'gauntlet' ? session.history.length === 0 && session.events.length === 0 ? '首轮选手' : id === session.holder ? '当前擂主' : '前来挑战' : activeMode === 'double' ? `${session.losses[id] ?? 0} 败` : '') as [string,string]} knockout={activeMode !== 'ranking'} key={`${match.id}:${retry}`} pictures={[byId.get(pair[0])!, byId.get(pair[1])!]} contestantNumbers={[session.config.imageIds.indexOf(pair[0]) + 1, session.config.imageIds.indexOf(pair[1]) + 1]} loaded={loaded} ready={ready} cooldown={cooldown} selected={selected} linked={linked} onLinked={setLinked} vote={id => vote(id, match.id)} onLoad={id => setLoaded(old => new Set([...old, id]))} onError={() => setLoadError(true)} open={setViewer} onGesture={active => { inspecting.current = active; }} />
      <div className="battle-bottom">{loadError ? <div role="alert" className="load-error">图片载入失败。<button onClick={() => { setLoadError(false); setLoaded(new Set()); setRetry(n => n + 1); }}>重试加载</button><button onClick={() => confirmReset('prepare')}>返回调整图片</button></div> : <p>{words?.hint}</p>}<span>{session.vetoed.length ? `裁判否决 ${session.vetoed.length} 张 · 比较场次不含自动晋级` : activeMode === 'ranking' ? `已入选 ${session.ranked.length} / ${seats} 名` : `${roundPictures.length} 位选手 · 只决冠军`}</span></div>
      <button className="quiet veto-both" disabled={cooldown || !ready} onClick={() => judge(pair, session.revision)}>这两张都否决</button>
      {activeMode === 'knockout' && <Bracket session={session} pictures={roundPictures} />}
      {['gauntlet','double','groups'].includes(activeMode) && <CompetitionDetails session={session} pictures={roundPictures} />}
    </main>}
    {stage === 'results' && session && <main className="results-main"><div className="result-heading"><span className="eyebrow sticker"><Icon name="trophy" size={18} />{ranked.length ? copy.resultLabel : '本轮无人入选'}</span><h1>{outcome?.title}</h1><p>{roundPictures.length} 张参赛 · {session.history.length} 场对决 · {session.vetoed.length} 张裁判否决 · {ranked.length} 张入选</p><p>{outcome?.note}</p></div>
      {!!ranked.length && <section className={`podium seats-${Math.min(ranked.length,3)}`} aria-label="本轮领奖台">{ranked.slice(0,3).map(({rank,picture:p})=><article className={`podium-card rank-${rank}`} key={p.id} data-testid={`rank-${rank}`}><div className="rank-label"><span className="rank-number">{String(rank).padStart(2,'0')}</span><span>{roundPictures.length===1?'唯一候选':activeMode==='gauntlet'?'最终擂主':['','本轮冠军','第二名','第三名'][rank]}</span><Icon name="trophy" size={23}/></div><button className="result-image" aria-label={`查看第 ${rank} 名：${p.file.name}`} onClick={()=>setViewer(p)}><img src={p.url} alt={p.file.name}/><span><Icon name="zoom" size={18}/></span></button><div className="result-file"><strong title={p.file.name}>{p.file.name}</strong><span>{p.width} × {p.height}</span></div></article>)}</section>}
      {!ranked.length && <div className="empty-award">空席，也是一种认真选择。</div>}
      {ranked.length>3 && <section className="more-results" aria-label="其他入选图片">{ranked.slice(3).map(({rank,picture:p})=><button className="result-row" key={p.id} data-testid={`rank-${rank}`} onClick={()=>setViewer(p)}><b>{rank}</b><img src={p.url} alt="" loading="lazy"/><span>{p.file.name}</span><Icon name="zoom" size={18}/></button>)}</section>}
      <div className="result-actions"><div className="action-primary">{!ranked.length && <button className="primary" disabled={filesLocked} onClick={()=>confirmReset('prepare')}>返回准备区</button>}<button className="primary" onClick={()=>confirmReset('replay')} disabled={cooldown||filesLocked||roundPictures.length-session.vetoed.length<minimum[activeMode]}><Icon name="repeat" size={18}/>再玩一轮</button>{isDesktop&&<button className="primary" onClick={()=>setOrganizing(true)}>{organizationPlan?.started?'查看整理记录':'整理文件'}</button>}<button className="primary" onClick={()=>confirmReset('clear')}>开始新一批<Icon name="arrow" size={17}/></button></div><div className="action-secondary"><button className="secondary" disabled={!ranked.length} onClick={async()=>{try{await copyNames(ranked.map(r=>r.picture.file.name).join('\n'));setToast('已复制入选文件名。');}catch{setToast('复制失败，请下载结果清单。');}}}><Icon name="copy" size={17}/>复制入选文件名</button><button className="secondary" onClick={async()=>{try{const saved=await downloadResults(session,roundPictures);if(saved&&isDesktop)setToast('对局记录已保存。');}catch(e){setToast(String(e));}}}><Icon name="download" size={17}/>下载结果 JSON</button></div></div>
      <p className="replay-note">再玩一轮使用剩余 {roundPictures.length-session.vetoed.length} 张{roundPictures.length-session.vetoed.length<minimum[activeMode]?'，不足开赛门槛，请返回准备区调整。':'，重新抽签。'}</p>
      <div className="result-secondary"><button className="quiet" disabled={!session.events.length||cooldown||filesLocked} onClick={goBack}><Icon name="undo" size={16}/>{session.events.at(-1)?.type==='veto'?'撤销上次否决':'撤销最后一次选择'}</button><span>{isDesktop?'喜欢有了着落，需要的话，给原图安个新家。':'刷新前记得下载结果清单。'}</span></div>
      {filesLocked&&<p className="file-lock-note">文件处理已开始，本轮排名已锁定。查看整理记录，或开始新一批继续选图。</p>}
      {activeMode==='knockout'&&<Bracket session={session} pictures={roundPictures}/>}
      {['gauntlet','double','groups'].includes(activeMode)&&<CompetitionDetails session={session} pictures={roundPictures}/>}
      {[false,true].map(denied=>{const list=roundPictures.filter(p=>!session.ranked.some(r=>r.imageId===p.id)&&session.vetoed.includes(p.id)===denied);return list.length>0&&<details className="unselected" key={String(denied)}><summary>{denied?'裁判否决':copy.unselected} <span>{list.length} 张 · 不区分先后</span></summary><div className="unselected-grid">{list.map(p=><button key={p.id} onClick={()=>setViewer(p)}><img src={p.url} alt="" loading="lazy"/><span>{p.file.name}</span></button>)}</div></details>;})}
    </main>}
    {organizing && <Organizer vetoedCount={session?.vetoed.length ?? 0} selectedIds={ranked.map(r => r.imageId)} rejectedIds={roundPictures.filter(p => !ranked.some(r => r.imageId === p.id)).map(p => p.id)} plan={organizationPlan} onPlan={setOrganizationPlan} onExecuted={() => { filesLockedRef.current = true; setFilesLocked(true); }} onActivity={active => { fileActivity.current = active; }} onClose={() => setOrganizing(false)} />}
    {viewer && <Viewer compact={compact} returnLabel={stage === 'battle' ? '返回比赛' : stage === 'results' ? '返回结果' : '返回选图区'} picture={viewer} onClose={() => setViewer(null)} onVeto={session && session.config.imageIds.includes(viewer.id) ? () => judge([viewer.id], session.revision) : undefined} vetoDisabled={filesLocked || cooldown || !!session?.vetoed.includes(viewer.id)} />}
    {confirmation && <Dialog label={confirmation.title} onClose={() => setConfirmation(null)} className="confirm-dialog"><h2>{confirmation.title}</h2><p>{confirmation.body}</p><div><button className="secondary" onClick={() => setConfirmation(null)} autoFocus>继续当前一轮</button><button className="primary" onClick={confirmation.run}>{confirmation.action}</button></div></Dialog>}
    <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast}{toast && session?.events.at(-1)?.type === 'veto' && !filesLocked && !viewer && <button disabled={cooldown} onClick={goBack}>撤销</button>}</div>
  </div>;
}
