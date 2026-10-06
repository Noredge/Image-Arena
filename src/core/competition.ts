import { t, message } from '../i18n';
import {groupName,type Phase,type Session,type TournamentMode} from './tournament';
/** Stage identity comes from the engine. Labels remain presentation only. */
export function phaseLabel(match: { phase?: Phase; label?: string }) {
 const p=match.phase;
 if(!p)return message(match.label??'');
 if(p.id==='grand-final')return t('总决赛');
 if(p.id==='reset-final')return t('最终决胜局');
 if(p.id==='lower')return t('复活区 · 第 {0} 轮',[p.round??1]);
 if(p.id==='group'||p.id==='tie')return t(p.id==='group'?'{0}组 · 循环赛':'{0}组 · 出线加赛',[groupName(p.group??0)]);
 if(p.id==='ranking')return t('第 {0} 席争夺',[p.place??1]);
 if(p.id==='gauntlet')return t('擂主迎战');
 const round=p.entrants===2?t('决赛'):p.entrants===4?t('半决赛'):p.entrants===8?t('八强赛'):t('{0} 强赛',[p.entrants]);
 return p.id==='upper'?t('胜者组 · {0}',[round]):round;
}
const sourceCompetitionCopy={
 ranking:{name:'精选排名',description:'给喜欢排个座次 · 有序前 K 名',intro:'好图不少，席位有限。',arrival:'好图到齐，给喜欢排个座次。',start:'给喜欢排座次',resultLabel:'本轮偏好排名',resultTitle:'心头好，各就各位。',resultNote:'喜欢有了次序，每一席都算数。',unselected:'本轮未入选',undo:'这一票收回，再看一眼。',empty:'这一轮，席位暂空。',veto:'这张先退席，下一份喜欢补上。'},
 knockout:{name:'一败退场',description:'输一场退场 · 只决冠军',intro:'一局定去留，胜者为王。',arrival:'选手已报到，等你鸣锣开场。',start:'鸣锣开赛',resultLabel:'本届淘汰赛冠军',resultTitle:'一路过关，独占擂台。',resultNote:'一场一场赢来的冠军，这次由你加冕。',unselected:'本届退场选手',undo:'裁判改判，上一局再来。',empty:'本届奖杯，先留在这里。',veto:'裁判示意，本轮提前退场。'},
 gauntlet:{name:'连胜擂台',description:'胜者留台 · 下一张来挑战',intro:'擂主留步，下一位请上台。',arrival:'挑战者排好队，好戏接着来。',start:'迎接第一位挑战者',resultLabel:'本届最终擂主',resultTitle:'最后一声挑战，也接住了。',resultNote:'一张接一张，最后留台的是你。',unselected:'本届挑战者',undo:'上一位留步，这局重看。',empty:'擂台空了，下一轮再见。',veto:'裁判叫停，这位选手退场。'},
 double:{name:'双败复活',description:'首败进复活区 · 再败退场',intro:'输一场，故事还没结束。',arrival:'选手就位，机会不止一次。',start:'开场，还有后手',resultLabel:'本届双败赛冠军',resultTitle:'两条路，终点都是冠军。',resultNote:'跌倒可以再来，喜欢还有机会。',unselected:'本届退场选手',undo:'这次判罚收回，机会还在。',empty:'故事有返场，冠军不勉强。',veto:'裁判否决，这次不走复活通道。'},
 groups:{name:'小组出线',description:'组内循环 · 前二出线争冠',intro:'先混个脸熟，再争出线。',arrival:'同组选手见个面，出线各凭本事。',start:'抽签分组',resultLabel:'本届小组赛冠军',resultTitle:'从小组亮相，到全场压轴。',resultNote:'先拿出线门票，再争最后一席。',unselected:'本届未夺冠选手',undo:'积分先别记，这场重看。',empty:'本届赛程收场，冠军席位空缺。',veto:'资格取消，相关小组积分已重算。'},
} satisfies Record<TournamentMode,Record<string,string>>;

export const competitionCopy = new Proxy(sourceCompetitionCopy, {
 get(target, mode: TournamentMode) { const copy = target[mode]; return copy && Object.fromEntries(Object.entries(copy).map(([key, value]) => [key, t(value)])); }
}) as typeof sourceCompetitionCopy;
const extraLines = {
 ranking: { arrival:['好图先入席，座次慢慢排。','候选已到场，眼缘来做主。'], undo:['这一席再斟酌，喜欢不着急。','座次先收回，再给眼缘一次机会。'], veto:['这一席先空着，继续找喜欢。','这张本轮退席，其他候选接着来。'], result:['喜欢已经排好队，请按顺序入座。','这一轮的心头好，都有了自己的位置。'] },
 knockout: { arrival:['签位等着你，好戏就要开场。','选手入场，一场一场见分晓。'], undo:['上一局先别散场，再过一招。','晋级牌先收回，这局重新看。'], veto:['这位提前谢幕，赛程继续。','裁判亮牌，本届资格到此为止。'], result:['最后一张晋级牌，交到冠军手中。','从第一场到最后一场，这次你说了算。'] },
 gauntlet: { arrival:['队伍排好了，谁能留到最后？','擂台不空场，挑战马上来。'], undo:['擂台倒回上一场，再看谁留步。','挑战先收回，上一局重看。'], veto:['这位本轮退场，擂台按剩余队列继续。','裁判示意退场，本次不计胜负。'], result:['挑战队伍走完，最后一席留下了。','本届守擂故事，暂时写到这里。'] },
 double: { arrival:['先上台过招，故事留着后手。','签位就绪，这次还有一次机会。'], undo:['把这一局收回，两条路线一起倒回。','上一场再看，机会按原样归还。'], veto:['这位资格取消，复活区也不再登场。','裁判亮牌，这一次直接退场。'], result:['一路没掉队，冠军不绕路。','从复活区，一路走回聚光灯下。'] },
 groups: { arrival:['同组先碰面，前二拿门票。','分组桌已摆好，等你请选手入席。'], undo:['这一分先收回，同组再看一眼。','上一场重看，积分与席位一起退回。'], veto:['这位离组，相关积分一并收回。','资格取消，其余选手之间的成绩保留。'], result:['出线门票之后，是最后的冠军席位。','小组里的亮相，走到了全场的压轴。'] },
} satisfies Record<TournamentMode,Record<'arrival'|'undo'|'veto'|'result',string[]>>;
export function phaseLine(mode:TournamentMode,phase:'arrival'|'undo'|'veto'|'result',event:number){
 const first=phase==='result'?competitionCopy[mode].resultNote:competitionCopy[mode][phase];
 return t([first,...extraLines[mode][phase]][event%3]);
}

export function roundLabel(node:number){const entrants=2**(Math.floor(Math.log2(node))+1);return entrants===2?t("决赛"):entrants===4?t("半决赛"):entrants===8?t("八强赛"):t("{0} 强赛", [entrants]);}
export function vetoCopy(before:Session,after:Session,ids:string[]){
 const mode=before.config.mode??'ranking';
 if(mode==='groups'&&before.groupsLocked)return t("资格取消，淘汰席位留空。");
 if(mode==='gauntlet'){
  if(before.holder&&ids.includes(before.holder)&&after.holder)return t("擂台空了，新擂主接位。自动接位不增加连胜。");
  if(after.pending&&before.holder===after.holder)return t("挑战者退场，擂主留步。这次不计连胜。");
 }
 return phaseLine(mode,'veto',after.events.length);
}
export function battleCopy(s:Session){const m=s.pending,mode=s.config.mode??'ranking',i=s.history.length%3;
 if(mode==='gauntlet')return{badge:t("擂主迎战"),title:[t("擂主守得住吗？"),t("这一关，谁来接招？"),t("挑战来了，谁留在台上？")][i],hint:s.streak?t("本次任期连胜 {0} 场 · 累计 {1} 胜 · 还有 {2} 位挑战者", [s.streak, s.wins[s.holder!]??0, s.queue.length-s.cursor]):t("擂台已经就位。下一次喜欢，由你决定。")};
 if(mode==='double')return{badge:m?phaseLabel(m):t("双败赛"),title:[t("这一回，谁先过关？"),t("机会还在，继续过招。"),t("再接一招，机会还在。")][i],hint:m&&s.history.some(d=>[d.leftId,d.rightId].includes(m.leftId)&&[d.leftId,d.rightId].includes(m.rightId))&&m.phase?.id!=='reset-final'?t("老对手，再过一招。这是新的一场，需要重新选胜者。"):m?.phase?.id==='reset-final'?t("双方各输一场。最后一局，现在开始。"):m?.phase?.id==='grand-final'?t("胜者组赢一场夺冠；复活区赢首场后，再打一场决胜局。"):t("首败进入复活区，再败才退场。裁判否决直接取消资格。")};
 if(mode==='groups')return{badge:m?phaseLabel(m):t("小组出线"),title:(m?.kind==='group'?[t("这一分，记在谁名下？"),t("同组过招，谁多得一分？"),t("出线门票，先争这一分。")]:m?.kind==='tie'?[t("同分不纠结，加赛见分晓。"),t("这一席，谁先出线？"),t("再看一眼，门票给谁？")]:[t("小组已过关，接下来争冠。"),t("这一场，谁往前走？"),t("压轴之前，再过一关。")])[i],hint:m?.kind==='tie'?t("有限加赛只决定出线席位，不增加小组积分。"):s.groupsLocked?t("出线名单已锁定，淘汰阶段一败退场。"):t("{0} 组循环 · 胜 1 分，负 0 分 · 前二出线", [groupName(m?.group??0)])};
 if(mode==='knockout')return{badge:m?roundLabel(m.nodeId):t("冠军诞生"),title:m?.nodeId===1?t("最后一局，谁来称王？"):[t("这一局，谁留下？"),t("好图过招，晋级由你拍板。"),t("再过一关，离冠军更近。")][i],hint:[t("赢的继续，输的谢幕。选错了，可以撤销改判。"),t("擂台只留一个位置。这一票，决定谁往前走。"),t("轮空直接晋级，不计真实胜场。")][i]};
 return{badge:s.vetoed.length?t("补选席位"):m?.rankBeingSelected===1?t("冠军争夺"):t("第 {0} 席争夺", [m?.rankBeingSelected]),title:[t("这一席，留给谁？"),t("两张都好，你更偏爱哪张？"),t("给更心动的那张一票。")][i],hint:m&&m.rankBeingSelected>1?t("第一席坐稳，下一席继续。"):t("不用给喜欢找理由。选错了，随时收回这一票。")};
}
export function resultCopy(s:Session){const mode=s.config.mode??'ranking',copy=competitionCopy[mode];if(!s.ranked.length)return{title:s.vetoed.length===s.config.imageIds.length?t("本届奖杯，先留在这里。"):copy.empty,note:s.vetoed.length===s.config.imageIds.length?t("这轮没有留下合适的图片，也是一种明确的选择。"):t("仍在赛选手已退场，本届冠军空缺。普通落败者不自动递补。")};
 if(s.config.imageIds.length===1)return{title:t("只有这一张，先给它留个位置。"),note:t("唯一候选，没有虚构的对决。")};
 if(mode==='ranking'&&s.ranked.length<s.config.targetK)return{title:copy.resultTitle,note:t("原定 {0} 席，留下 {1} 张。喜欢不必凑数。", [s.config.targetK, s.ranked.length])};
 if(s.automaticFinish&&mode!=='ranking')return{title:t("其余选手退场，本届由你留台。"),note:t("自动胜出不增加真实胜场。喜欢不必勉强。")};
 if(mode==='double')return{title:copy.resultTitle,note:s.losses[s.ranked[0].imageId]?t("从复活区，一路走回聚光灯下。"):t("一路没掉队，冠军不绕路。")};
 return{title:copy.resultTitle,note:phaseLine(mode,'result',s.events.length)};
}
export function bracketRounds(s:Session){const rounds=[];for(let start=s.layout.length/2;start>=1;start/=2)rounds.push({label:roundLabel(start),matches:Array.from({length:start},(_,i)=>{const node=start+i;return{node,left:s.tree[node*2],right:s.tree[node*2+1],winner:s.tree[node],current:s.pending?.nodeId===node};})});return rounds;}
