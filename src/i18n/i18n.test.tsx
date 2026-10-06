import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { getLanguage, message, messages, setLanguage, t } from './index';
import { battleCopy, competitionCopy, phaseLabel, resultCopy } from '../core/competition';
import { choose, createSession, modes, undo, veto } from '../core/tournament';
import { exportRecord, type Picture } from '../platform/browser';
import { Comparison } from '../ui/Comparison';
import { CompetitionDetails } from '../ui/CompetitionDetails';
import { Organizer } from '../ui/Organizer';
import { organizationRecord, pickDestination, pickNativeImages, saveNativeRecord } from '../platform/desktop';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
afterEach(() => { setLanguage('zh'); vi.mocked(invoke).mockReset(); });
const picture=(id: string): Picture => ({ id, file:new File(['fake'], '冠军：入选.png', {lastModified:123}), url:'blob:'+id, width:100, height:80 });

describe('shared Chinese and English messages', () => {
  it('keeps all source interpolation slots and covers every literal translation call', () => {
    const slots=(s:string)=>[...new Set([...s.matchAll(/\{(\d+)\}/g)].map(m=>m[1]))].sort();
    for(const [zh,en] of Object.entries(messages)) { expect(en,zh).not.toMatch(/[\u3400-\u9fff]/); expect(slots(en),zh).toEqual(slots(zh)); }
    const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
    for(const file of walk('src').filter(f=>/\.tsx?$/.test(f)&&!f.includes('.test.'))) {
      const tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      const visit=(n:ts.Node)=>{if(ts.isCallExpression(n)&&n.expression.getText(tree)==='t'&&ts.isStringLiteral(n.arguments[0]))expect(messages[n.arguments[0].text],file+': '+n.arguments[0].text).toBeDefined();ts.forEachChild(n,visit);};visit(tree);
    }
  });
  it('changes existing notices in either direction while keeping user filenames and paths opaque', () => {
    const name='冠军：入选.png', path='C:\\图片\\冠军.png';
    expect(t('查看候选 {0}：{1}',[2,name],'en')).toBe('View image 2: '+name);
    expect(message(name+'：PNG 数据块损坏或不完整，请重新导出图片','en')).toBe(name+': The PNG data is damaged or incomplete. Export the image again.');
    expect(message('Error: 无法锁定原文件（被占用或无权限）：'+path,'en')).toBe("Error: Couldn't lock the original file (in use or no permission): "+path);
    const notice=t('{0} 位选手到了。{1}',[2,t('候选已到场，眼缘来做主。',[],'en')],'en');
    expect(message(notice,'zh')).toBe('2 位选手到了。候选已到场，眼缘来做主。');
    expect(message(t('返回准备区？',[],'en'),'zh')).toBe('返回准备区？');
    expect(t('好图过招，',[],'en')+t('胜者为王。',[],'en')).toBe('Which image comes out on top?');
    expect(t('{0} 分',[1],'en')).toBe('1 point');expect(t('{0} 分',[2],'en')).toBe('2 points');
    expect(message(t('{0} 位选手到了。{1}',[1,t('候选已到场，眼缘来做主。',[],'en')],'en'),'zh')).toBe('1 位选手到了。候选已到场，眼缘来做主。');
  });
});

it.each(modes)('keeps %s decisions, undo, veto and results identical across languages', mode => {
  const config={mode,imageIds:Array.from({length:8},(_,i)=>String(i)),seed:42,targetK:mode==='ranking'?3:1};
  const play=(language:'zh'|'en')=>{
    setLanguage(language);let s=createSession(config), guard=0;
    while(s.pending&&guard++<200){
      const saved=structuredClone(s), m=s.pending;
      expect(battleCopy(s).title).toBeTruthy();
      s=choose(s,{matchId:m.id,winnerId:m.leftId});
      if(guard===1){const {id:_,...original}=saved.pending!;expect(undo(s).pending).toMatchObject(original);s=undo(s);s=veto(s,[s.pending!.rightId],s.revision);expect(undo(s).pending).toMatchObject(original);s=undo(s);s=choose(s,{matchId:s.pending!.id,winnerId:s.pending!.leftId});}
    }
    expect(s.completed).toBe(true);expect(resultCopy(s).title).toBeTruthy();return s;
  };
  const zh=play('zh'),en=play('en');expect(en).toEqual(zh);
  setLanguage('en');const record=exportRecord(en,config.imageIds.map(picture));
  expect(record.note).not.toMatch(/[\u3400-\u9fff]/);expect(record.images[0].originalName).toBe('冠军：入选.png');
  setLanguage('zh');const chinese=exportRecord(zh,config.imageIds.map(picture));
  expect(Object.keys(record)).toEqual(Object.keys(chinese));expect(record.images).toEqual(chinese.images);
});

it('uses stable phases for lower bracket, grand final and reset final even with misleading labels', () => {
  let s=createSession({mode:'double',imageIds:['a','b','c','d'],seed:2,targetK:1});const seen=new Set();
  while(s.pending){const m=s.pending;seen.add(m.phase!.id);m.label='任意展示文本';setLanguage('en');
    expect(phaseLabel(m)).not.toContain('任意');
    if(m.phase!.id==='reset-final')expect(battleCopy(s).hint).toContain('Both have lost once');
    s=choose(s,{matchId:m.id,winnerId:m.phase!.id==='grand-final'?m.rightId:m.leftId});
  }
  expect(seen).toEqual(new Set(['upper','lower','grand-final','reset-final']));
});

it('renders English match details and file safety states without translating filenames', () => {
  setLanguage('en');const s=createSession({mode:'groups',imageIds:['a','b','c','d','e','f'],seed:1,targetK:1});
  const compare=renderToStaticMarkup(<Comparison compact pictures={[picture('a'),picture('b')]} contestantNumbers={[1,2]} loaded={new Set(['a','b'])} ready cooldown={false} selected={null} linked onLinked={()=>{}} vote={()=>{}} veto={()=>{}} onLoad={()=>{}} onError={()=>{}} open={()=>{}} onGesture={()=>{}} />);
  expect(compare).toContain('冠军：入选.png');expect(compare.replaceAll('冠军：入选.png','')).not.toMatch(/[\u3400-\u9fff]/);
  const details=renderToStaticMarkup(<CompetitionDetails session={s} pictures={s.config.imageIds.map(picture)} />);
  expect(details).toContain('Group A');expect(details.replaceAll('冠军：入选.png','')).not.toMatch(/[\u3400-\u9fff]/);
  for(const status of ['ready','moved','kept','noop','failed','cancelled','skipped','copied','review','recycled']){
    const plan={id:'plan',started:true,finished:true,journalPath:null,notice:'已逐项记录。比赛撤销不会撤销磁盘操作；失败或停止项可单独重试。',entries:[{operationId:'op',imageIds:['a'],name:'冠军.png',group:'入选',action:'move' as const,source:'C:\\原图\\冠军.png',target:'C:\\入选\\冠军.png',status,note:'目标同名，按设置跳过'}]};
    const html=renderToStaticMarkup(<Organizer selectedIds={['a']} rejectedIds={[]} vetoedCount={0} plan={plan} onPlan={()=>{}} onExecuted={()=>{}} onActivity={()=>{}} onClose={()=>{}} />);
    expect(html.replaceAll('C:\\原图\\冠军.png','').replaceAll('C:\\入选\\冠军.png','').replaceAll('冠军.png','')).not.toMatch(/[\u3400-\u9fff]/);
    const record=organizationRecord(plan);expect(record.entries[0].name).toBe(plan.entries[0].name);expect(record.entries[0].source).toBe(plan.entries[0].source);expect(record.entries[0].status).toBe(status);expect(record.notice).not.toMatch(/[\u3400-\u9fff]/);
  }
  expect(competitionCopy.double.intro).toBe('Everybody gets a second chance.');
});

it('sends the language explicitly to native pickers and save dialogs', async () => {
  setLanguage('en');await pickNativeImages();await pickDestination('selected');await saveNativeRecord('{}','image-arena-test.json');
  expect(invoke).toHaveBeenCalledWith('pick_images',{language:'en'});
  expect(invoke).toHaveBeenCalledWith('pick_destination',{group:'selected',language:'en'});
  expect(invoke).toHaveBeenCalledWith('save_record',{content:'{}',filename:'image-arena-test.json',language:'en'});
});
