import {groupName,type Session} from '../core/tournament';
import type {Picture} from '../platform';
export function CompetitionDetails({session:s,pictures}: {session:Session;pictures:Picture[]}){
 const label=(id:string|null|undefined)=>id===undefined?'等待晋级':id===null?'空位 / 轮空':`${String(s.config.imageIds.indexOf(id)+1).padStart(2,'0')} 号`;
 if(s.config.mode==='gauntlet')return <details className="bracket-panel"><summary>守擂记录 · 本轮最长连胜 {s.longest} 场</summary><p>本次任期 {s.streak} 胜 · 当前擂主本轮累计 {s.holder ? s.wins[s.holder] ?? 0 : 0} 胜</p><p>连胜只计真实投票，自动接位不加分。出场先后不同，连胜不代表偏好名次。</p><div className="record-list">{s.history.map((d,i)=><p key={i}>第 {i+1} 场 · {label(d.winnerId)} 胜出</p>)}</div></details>;
 return <details className="bracket-panel" open={s.completed}><summary>{s.config.mode==='groups'?'小组积分与晋级路线':'双败晋级路线'} · {s.ranked.length?'冠军已就位':s.completed?'冠军空缺':'查看赛程'}</summary>
 {s.groups.length>0&&<div className="group-tables">{s.groups.map((g,i)=><section key={i}><h3>{groupName(i)} 组 {s.groupsLocked?'· 已锁定':''}</h3>{g.members.map(id=><div className="group-row" key={id}><span title={pictures.find(p=>p.id===id)?.file.name}>{label(id)}</span><b>{g.points[id]??0} 分</b><small>{s.vetoed.includes(id)?'资格已取消':g.qualifiers.includes(id)?`出线第 ${g.qualifiers.indexOf(id)+1} 席`:''}</small></div>)}{Object.values(g.ties).some(t=>t.completed)&&<p>同分席位经加赛确定</p>}</section>)}</div>}
 {s.graph.length>0&&<div className="bracket-rounds">{s.graph.map((b,i)=>i===s.resetIndex&&s.completed&&b.winner===undefined ? null : <section className="bracket-round" key={i}><h3>{b.label}</h3><div className={`bracket-match ${s.pending?.kind==='graph'&&s.pending.nodeId===i?'current':''}`}>{[b.left,b.right].map((id,j)=><div className={id&&id===b.winner?'winner':''} key={j}><span>{label(id)}</span><b>{id&&s.vetoed.includes(id)?'裁判否决':id&&id===b.winner?(b.played?'胜出':'自动晋级'):''}</b></div>)}</div></section>)}</div>}
 <p>轮空不计胜场。赛事仅确定冠军，其余图片不作偏好排名。</p></details>;
}
