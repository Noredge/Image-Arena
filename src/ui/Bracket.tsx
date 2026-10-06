import { t } from '../i18n';
import { bracketRounds } from '../core/competition';
import type { Session } from '../core/tournament';
import type { Picture } from '../platform';

export function Bracket({ session, pictures }: { session: Session; pictures: Picture[] }) {
  const label = (id: string | null | undefined) => id === undefined ? t("等待晋级") : id === null ? t("轮空 / 席位空缺") : t("{0} 号选手", [String(pictures.findIndex(p => p.id === id) + 1).padStart(2, '0')]);
  return <details className="bracket-panel" open={session.completed}>
    <summary>{t("晋级路线")}<span>{session.completed ? session.ranked.length ? t("冠军已就位") : t("冠军席位空缺") : t("{0} 场对决 · {1}", [session.history.length, session.pending ? t("点击查看抽签与晋级") : ''])}</span></summary>
    <div className="bracket-rounds">{bracketRounds(session).map(round => <section key={round.label} className="bracket-round"><h3>{round.label}</h3>{round.matches.map(m => <div key={m.node} className={`bracket-match ${m.current ? 'current' : ''}`} aria-label={t("{0}：{1} 对 {2}{3}", [round.label, label(m.left), label(m.right), m.current ? t("，当前对决") : ''])}>
      {[m.left, m.right].map((id, index) => <div key={index} className={id && m.winner === id ? 'winner' : ''} title={pictures.find(p => p.id === id)?.file.name}>{id && <img src={pictures.find(p => p.id === id)?.url} alt="" loading="lazy" />}<span>{label(id)}</span>{id && m.winner === id && <b>{m.node === 1 ? t("冠军") : t("晋级")}</b>}</div>)}
    </div>)}</section>)}</div>
    <p>{t("轮空自动晋级。只评出冠军，退场先后不代表偏好排名。")}</p>
  </details>;
}
