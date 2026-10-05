import { usePreference } from '../platform/settings';
import { useEffect, useRef, useState } from 'react';
import { desktop } from '../platform';
import type { Destination, FileAction, OrganizationPlan } from '../platform/desktop';
import { Dialog } from './Dialog';
import { organizationSummary } from './organizationSummary';
import './organizer.css';

const labels: Record<string, string> = { ready: '待执行', kept: '保持原位', noop: '无需移动', skipped: '同名跳过', failed: '未完成', cancelled: '已停止', moved: '已移动', recycled: '已回收', copied: '两处保留', review: '需要核对' };
export function Organizer({ selectedIds, rejectedIds, vetoedCount, plan, onPlan, onExecuted, onActivity, onClose }: {
  vetoedCount: number; selectedIds: string[]; rejectedIds: string[]; plan: OrganizationPlan | null;
  onPlan: (plan: OrganizationPlan | null) => void; onExecuted: () => void; onActivity: (active: boolean) => void; onClose: () => void;
}) {
  const [selected, setSelected] = usePreference('selectedAction');
  const [rejected, setRejected] = usePreference('rejectedAction');
  const [selectedDir, setSelectedDir] = useState<Destination | null>(null);
  const [rejectedDir, setRejectedDir] = useState<Destination | null>(null);
  const [conflict, setConflict] = usePreference('conflict');
  const [busy, setBusy] = useState(false); const [executing, setExecuting] = useState(false);
  const [confirmed, setConfirmed] = useState(false); const [error, setError] = useState('');
  const [saving, setSaving] = useState(''); const [stopping, setStopping] = useState(false);
  const [showPreview, setShowPreview] = usePreference('showPreview');
  const [restoring, setRestoring] = useState(true);
  const [directoryNotice, setDirectoryNotice] = useState('');
  const busyRef = useRef(false);
  const planRef = useRef(plan); planRef.current = plan;
  const callbacks = useRef({ onPlan, onExecuted }); callbacks.current = { onPlan, onExecuted };
  useEffect(() => {
    let disposed = false;
    void desktop().then(d => d.rememberedDestinations()).then(saved => {
      if (disposed) return;
      setSelectedDir(saved.selected); setRejectedDir(saved.rejected);
      setDirectoryNotice(saved.warnings.join(' '));
    }).catch(e => { if (!disposed) setDirectoryNotice(`未能读取上次目录：${String(e)}`); })
      .finally(() => { if (!disposed) setRestoring(false); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    let disposed = false; let unlisten: (() => void) | undefined;
    void desktop().then(d => d.watchOrganization(next => {
      if (!disposed && next.id === planRef.current?.id) { callbacks.current.onPlan(next); if (next.started) callbacks.current.onExecuted(); }
    })).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); };
  }, []);
  async function run(task: () => Promise<void>) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); onActivity(true); setError('');
    try { await task(); } catch (e) { setError(String(e)); }
    finally { busyRef.current = false; setBusy(false); setExecuting(false); onActivity(false); }
  }
  const chooseDirectory = (group: 'selected' | 'rejected') => run(async () => {
    const chosen = await (await desktop()).pickDestination(group);
    if (chosen) (group === 'selected' ? setSelectedDir : setRejectedDir)(chosen);
  });
  async function executePlan(prepared: OrganizationPlan) {
    setExecuting(true); setStopping(false);
    const next = await (await desktop()).executeOrganization(prepared.id, prepared.started, confirmed);
    onPlan(next); if (next.started) onExecuted(); setConfirmed(false);
  }
  const preview = () => run(async () => {
    const prepared = await (await desktop()).prepareOrganization({ selectedIds, rejectedIds,
      selected: { action: selectedIds.length ? selected : 'keep', destinationId: selectedDir?.id ?? null },
      rejected: { action: rejectedIds.length ? rejected : 'keep', destinationId: rejectedDir?.id ?? null }, conflict });
    planRef.current = prepared; onPlan(prepared);
    if (!showPreview && prepared.entries.some(e => e.status === 'ready')) await executePlan(prepared);
  });
  const entries = plan?.entries ?? [];
  const eligible = entries.filter(e => plan?.started ? ['failed', 'cancelled'].includes(e.status) : e.status === 'ready');
  const recycling = eligible.filter(e => e.action === 'recycle').length;
  const summary = plan ? organizationSummary(plan) : null;
  const requested = (selected === 'move' ? selectedIds.length : 0) + (rejected !== 'keep' ? rejectedIds.length : 0);
  const execute = () => run(async () => {
    if (plan) await executePlan(plan);
  });
  const edit = () => run(async () => { if (plan) await (await desktop()).discardOrganization(plan.id); onPlan(null); setConfirmed(false); });
  const close = () => { if (busy) return; if (plan && !plan.started) { void run(async () => { await (await desktop()).discardOrganization(plan.id); onPlan(null); onClose(); }); } else onClose(); };
  const options = (group: 'selected' | 'rejected', count: number, action: FileAction, setAction: (a: FileAction) => void, dir: Destination | null) => <fieldset disabled={busy || restoring || !count}>
    <legend>{group === 'selected' ? '入选图片' : '未入选图片'} <span>{count} 张{group === 'rejected' && vetoedCount > 0 ? '（含裁判否决 ' + vetoedCount + ' 张）' : ''}</span></legend>
    <label>处理方式<select aria-label={group === 'selected' ? '入选图片处理方式' : '未入选图片处理方式'} value={action} onChange={e => setAction(e.target.value as FileAction)}>
      <option value="keep">保持原位</option><option value="move">移动到指定目录</option>{group === 'rejected' && <option value="recycle">送入 Windows 回收站</option>}
    </select></label>
    {action === 'move' && <div className="destination"><button className="secondary" onClick={() => void chooseDirectory(group)}>{dir ? '更换' : '选择'}{group === 'selected' ? '入选' : '未入选'}目标目录</button><p>{dir?.path ?? '由你选择位置，文件名默认保持不变。'}</p></div>}
    {action === 'recycle' && <p className="organize-warning">执行前还需额外确认。回收站不可用时会停止，不永久删除。</p>}
  </fieldset>;
  return <Dialog label="整理本轮图片" onClose={close} className="organizer">
    <header className="organize-header"><div><span className="eyebrow">喜欢有了归处</span><h2>{plan?.started ? '本轮整理记录' : '把好图安顿好。'}</h2></div><button className="quiet" disabled={busy} onClick={close} aria-label="关闭文件整理">关闭</button></header>
    <p>只处理本轮图片。详细预览可选，执行前始终检查文件与目标。开始执行后排名锁定。</p>
    {!plan && <>
      <p className="directory-memory" role="status">{restoring ? '正在读取上次目标目录…' : directoryNotice || '已恢复上次整理设置。核对本次数量后，再点击执行。'}</p>
      <div className="organize-choices">{options('selected', selectedIds.length, selected, a => setSelected(a === 'move' ? 'move' : 'keep'), selectedDir)}{options('rejected', rejectedIds.length, rejected, setRejected, rejectedDir)}</div>
      <label className="conflict-choice">目标同名时<select aria-label="同名处理方式" disabled={busy} value={conflict} onChange={e => setConflict(e.target.value as 'rename' | 'skip')}><option value="rename">自动加括号序号，不覆盖</option><option value="skip">跳过同名文件</option></select></label>
      <label className="preview-choice"><input type="checkbox" checked={showPreview} disabled={busy} onChange={e => setShowPreview(e.target.checked)} />执行前展开逐文件预览（可选）</label>
      {rejected === 'recycle' && !!rejectedIds.length && <label className="recycle-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />我确认将 {rejectedIds.length} 张未入选图片的原文件送入 Windows 回收站。</label>}
      <footer className="organize-actions"><button className="secondary" disabled={busy} onClick={close}>暂不整理</button><button className="primary" disabled={restoring || busy || !requested || (selectedIds.length > 0 && selected === 'move' && !selectedDir) || (rejectedIds.length > 0 && rejected === 'move' && !rejectedDir) || (!showPreview && rejected === 'recycle' && !!rejectedIds.length && !confirmed)} onClick={() => void preview()}>{busy ? '正在检查…' : showPreview ? '预览文件去向' : rejected === 'recycle' ? `执行整理（${requested} 张）` : `移动这 ${requested} 张`}</button></footer>
    </>}
    {plan && <>
      <div className="organize-summary">{entries.length} 个原文件 · 移动 {entries.filter(e => e.action === 'move').length} 个 · 回收 {entries.filter(e => e.action === 'recycle').length} 个 · 原位保留 {entries.filter(e => e.action === 'keep').length} 个</div>
      <p className={`organize-outcome ${summary?.success ? 'success' : ''}`} role="status">{summary?.text}</p>
      <details key={`${plan.started}:${summary?.attention ? 'attention' : 'normal'}`} open={!plan.started || !!summary?.attention}><summary>查看文件去向与逐项状态</summary><div className="organize-list" aria-label="逐文件执行清单">{entries.map(entry => <article key={entry.operationId} className={`file-operation status-${entry.status}`}>
        <div><strong>{entry.name}</strong><span>{entry.group} · {labels[entry.status] ?? entry.status}</span></div>
        <p><span>从</span> {entry.source}</p><p><span>到</span> {entry.action === 'keep' ? '保持原位' : entry.action === 'recycle' ? 'Windows 回收站' : entry.target}</p>
        {entry.note && <small>{entry.note}</small>}
      </article>)}</div></details>
      <p className="organize-warning">{plan.notice}</p>
      {!plan.started && <p>确认执行后，本轮排名会锁定。Ctrl+Z 只用于比赛，不撤销磁盘操作。</p>}
      {!!recycling && <label className="recycle-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />我确认将本次待处理的 {recycling} 个未入选原文件送入 Windows 回收站。</label>}
      <footer className="organize-actions">
        {!plan.started && <button className="secondary" disabled={busy} onClick={() => void edit()}>返回修改</button>}
        {plan.started && <button className="secondary" disabled={busy} onClick={() => void run(async () => { const saved = await (await desktop()).saveNativeRecord(JSON.stringify(plan, null, 2), `image-arena-files-${plan.id}.json`); setSaving(saved ? '执行记录已另存（包含原位置与实际去向）。' : ''); })}>保存执行清单</button>}
        {executing ? <button className="secondary" disabled={stopping} onClick={() => { setStopping(true); void desktop().then(d => d.cancelOrganization()).catch(e => setError(String(e))); }}>{stopping ? '正在等待当前文件完成…' : '停止后续文件'}</button> : <>
          {!!eligible.length && <button className={plan.started ? 'secondary' : 'primary'} disabled={busy || (!!recycling && !confirmed)} onClick={() => void execute()}>{plan.started ? `重试未完成项（${eligible.length}）` : `确认执行（${eligible.length}）`}</button>}
          {(plan.started || !eligible.length) && <button className="primary" disabled={busy} onClick={close}>{summary?.success ? '完成，返回结果' : '关闭，返回结果'}</button>}
        </>}
      </footer>
      {plan.journalPath && <details className="journal-location"><summary>本机自动执行记录</summary><p>{plan.journalPath}</p><small>部分成功会逐项记录。不确定的结果须人工核对，不自动重试。</small><button className="quiet" disabled={busy} onClick={() => void run(async () => { await (await desktop()).openOperationRecords(); })}>打开记录文件夹</button></details>}
      {saving && <p role="status">{saving}</p>}
    </>}
    {error && <p className="organize-error" role="alert">{error}</p>}
  </Dialog>;
}
