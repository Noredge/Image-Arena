import { useRef, useState } from 'react';
import type { Picture } from '../platform/browser';
import { ImageCanvas } from './ImageCanvas';
import { Icon } from './Icon';
import { fitView, updatePair, type ImageView } from './imageView';
type Props = {
  compact?: boolean; vetoBoth?: () => void;
  voteVerb?: string; flashText?: string; veto: (id: string) => void; roleLabels?: [string,string]; knockout?: boolean; pictures: [Picture, Picture]; contestantNumbers: [number, number]; loaded: Set<string>; ready: boolean; cooldown: boolean; selected: string | null;
  linked: boolean; onLinked: (linked: boolean) => void; vote: (id: string) => void;
  onLoad: (id: string) => void; onError: () => void; open: (picture: Picture) => void; onGesture: (active: boolean) => void;
};
export function Comparison({ compact = false, vetoBoth, voteVerb, flashText, veto, roleLabels, knockout = false, pictures, contestantNumbers, loaded, ready, cooldown, selected, linked, onLinked, vote, onLoad, onError, open, onGesture }: Props) {
  const [views, setViews] = useState<[ImageView, ImageView]>([fitView(), fitView()]); const lastSide = useRef(0);
  return <>
    <div className="inspect-toolbar"><span className="inspect-hint"><Icon name="mouse" size={17} />滚轮放大 · 按住拖动</span>
      <div className="inspect-controls"><button className={`link-toggle ${linked ? 'active' : ''}`} aria-pressed={linked} disabled={cooldown} title="联动相对放大倍数与图内位置" onClick={() => {
        if (!linked) setViews(old => updatePair(old, lastSide.current, old[lastSide.current], true)); onLinked(!linked);
      }}><Icon name={linked ? 'link' : 'unlink'} size={17} />{linked ? '同步查看' : '独立查看'}</button>
      <button disabled={cooldown} onClick={() => setViews([fitView(), fitView()])}><Icon name="fit" size={17} />恢复全图</button></div>
    </div>
    <div className="duel">{pictures.map((p, side) => <article className={`contender side-${side} ${selected === p.id ? 'chosen' : selected ? 'round-lost' : ''}`} key={side}>
      <div className="contender-label"><span><b>{compact ? side === 0 ? 'A' : 'B' : contestantNumbers[side]}</b>{compact ? `${contestantNumbers[side]} 号选手` : '号选手'} {roleLabels?.[side] && <small>{roleLabels[side]}</small>}</span><button className="zoom-button" aria-label={`放大${side === 0 ? '左图' : '右图'}`} onClick={() => open(p)} disabled={cooldown}><Icon name="expand" size={18} />单独查看</button></div>
      <div className="image-stage"><ImageCanvas picture={p} view={views[side]} onView={next => { lastSide.current = side; setViews(old => updatePair(old, side, next, linked)); }} disabled={!ready || cooldown}
        testId={`image-${side}`} onLoad={() => onLoad(p.id)} onError={onError} onGesture={onGesture} onTouchTap={() => open(p)}>
        {!loaded.has(p.id) && <span className="image-loading">选手准备中…</span>}
      </ImageCanvas>{compact && <span className="compact-canvas-caption" title={p.file.name}>触屏点图查看 · {p.file.name}</span>}{selected === p.id && <span className="winner-flash"><Icon name="star" size={24} />{flashText ?? (knockout ? '晋级，下一局见。' : '这一票，给你。')}</span>}</div>
      {!compact && <div className="contender-footer"><span title={p.file.name}>{p.file.name}</span><button data-testid={`vote-${side}`} className="select-button" disabled={!ready || cooldown} onClick={e => { if (e.detail <= 1) vote(p.id); }}><kbd>{side === 0 ? 'A / ←' : 'D / →'}</kbd><span>{voteVerb ? (side === 0 ? '左边' : '右边') + voteVerb : knockout ? (side === 0 ? '左边晋级' : '右边晋级') : (side === 0 ? '偏爱左边' : '偏爱右边') }</span><Icon name="heart" size={20} /></button><button className="veto-button" disabled={!ready || cooldown} onClick={() => veto(p.id)}>裁判一票否决</button></div>}
    </article>)}<span className="vs" aria-hidden="true">VS<span>{knockout ? '一决高下' : '一决偏爱'}</span></span></div>
    {compact && <div className="mobile-vote-bar" aria-label="本局投票">{pictures.map((p, side) => <button key={side} data-testid={`vote-${side}`} className={`mobile-vote side-${side}`} disabled={!ready || cooldown} onClick={e => { if (e.detail <= 1) vote(p.id); }} aria-label={`${side === 0 ? 'A' : 'B'} 胜：${p.file.name}${voteVerb ? `，${voteVerb}` : ''}`}>{side === 0 ? 'A' : 'B'} 胜<Icon name="heart" size={18} /></button>)}<details className="mobile-match-actions"><summary>更多</summary><div>{pictures.map((p, side) => <button key={side} disabled={!ready || cooldown} onClick={() => veto(p.id)}>裁判否决 {side === 0 ? 'A' : 'B'}</button>)}{vetoBoth && <button disabled={!ready || cooldown} onClick={vetoBoth}>两张都否决</button>}</div></details></div>}
  </>;
}
