import { t } from '../i18n';
import { phaseLabel } from '../core/competition';
import {groupName,type Session} from '../core/tournament';
import type {Picture} from '../platform';
export function CompetitionDetails({session:s,pictures}: {session:Session;pictures:Picture[]}){
 const label=(id:string|null|undefined)=>id===undefined?t("等待晋级"):id===null?t("空位 / 轮空"):t("{0} 号", [String(s.config.imageIds.indexOf(id)+1).padStart(2,'0')]);
 if(s.config.mode==='gauntlet')return <details className="bracket-panel"><summary>{t("守擂记录 · 本轮最长连胜 {0} 场", [s.longest])}</summary><p>{t("本次任期 {0} 胜 · 当前擂主本轮累计 {1} 胜", [s.streak, s.holder ? s.wins[s.holder] ?? 0 : 0])}</p><p>{t("连胜只计真实投票，自动接位不加分。出场先后不同，连胜不代表偏好名次。")}</p><div className="record-list">{s.history.map((d,i)=><p key={i}>{t("第 {0} 场 · {1} 胜出", [i+1, label(d.winnerId)])}</p>)}</div></details>;
 return <details className="bracket-panel" open={s.completed}><summary>{s.config.mode==='groups'?t("小组积分与晋级路线"):t("双败晋级路线")} · {s.ranked.length?t("冠军已就位"):s.completed?t("冠军空缺"):t("查看赛程")}</summary>
 {s.groups.length>0&&<div className="group-tables">{s.groups.map((g,i)=><section key={i}><h3>{t("{0} 组 {1}", [groupName(i), s.groupsLocked?t("· 已锁定"):''])}</h3>{g.members.map(id=><div className="group-row" key={id}><span title={pictures.find(p=>p.id===id)?.file.name}>{label(id)}</span><b>{t("{0} 分", [g.points[id]??0])}</b><small>{s.vetoed.includes(id)?t("资格已取消"):g.qualifiers.includes(id)?t("出线第 {0} 席", [g.qualifiers.indexOf(id)+1]):''}</small></div>)}{Object.values(g.ties).some(t=>t.completed)&&<p>{t("同分席位经加赛确定")}</p>}</section>)}</div>}
 {s.graph.length>0&&<div className="bracket-rounds">{s.graph.map((b,i)=>i===s.resetIndex&&s.completed&&b.winner===undefined ? null : <section className="bracket-round" key={i}><h3>{phaseLabel(b)}</h3><div className={`bracket-match ${s.pending?.kind==='graph'&&s.pending.nodeId===i?'current':''}`}>{[b.left,b.right].map((id,j)=><div className={id&&id===b.winner?'winner':''} key={j}><span>{label(id)}</span><b>{id&&s.vetoed.includes(id)?t("裁判否决"):id&&id===b.winner?(b.played?t("胜出"):t("自动晋级")):''}</b></div>)}</div></section>)}</div>}
 <p>{t("轮空不计胜场。赛事仅确定冠军，其余图片不作偏好排名。")}</p></details>;
}
