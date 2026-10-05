import { bracketRounds } from '../core/competition';
import type { Session } from '../core/tournament';
import type { Picture } from '../platform';

export function Bracket({ session, pictures }: { session: Session; pictures: Picture[] }) {
  const label = (id: string | null | undefined) => id === undefined ? '等待晋级' : id === null ? '轮空 / 席位空缺' : `${String(pictures.findIndex(p => p.id === id) + 1).padStart(2, '0')} 号选手`;
  return <details className="bracket-panel" open={session.completed}>
    <summary>晋级路线 <span>{session.completed ? session.ranked.length ? '冠军已就位' : '冠军席位空缺' : `${session.history.length} 场对决 · ${session.pending ? '点击查看抽签与晋级' : ''}`}</span></summary>
    <div className="bracket-rounds">{bracketRounds(session).map(round => <section key={round.label} className="bracket-round"><h3>{round.label}</h3>{round.matches.map(m => <div key={m.node} className={`bracket-match ${m.current ? 'current' : ''}`} aria-label={`${round.label}：${label(m.left)} 对 ${label(m.right)}${m.current ? '，当前对决' : ''}`}>
      {[m.left, m.right].map((id, index) => <div key={index} className={id && m.winner === id ? 'winner' : ''} title={pictures.find(p => p.id === id)?.file.name}>{id && <img src={pictures.find(p => p.id === id)?.url} alt="" loading="lazy" />}<span>{label(id)}</span>{id && m.winner === id && <b>{m.node === 1 ? '冠军' : '晋级'}</b>}</div>)}
    </div>)}</section>)}</div>
    <p>轮空自动晋级。只评出冠军，退场先后不代表偏好排名。</p>
  </details>;
}
