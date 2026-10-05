import {useEffect,useRef,useState} from 'react';
import {SettingsPopover} from './SettingsPopover';
import {Icon} from './Icon';
import {usePreference} from '../platform/settings';
import type {TournamentMode} from '../core/tournament';
import {ArenaSoundtrack,themes,type Cue,type SoundStage} from './soundtrack';
export function useArenaSound(mode:TournamentMode,stage:SoundStage,mood?:string){
 const[music,setMusic]=usePreference('music'),[effects,setEffects]=usePreference('effects'),[volume,setVolume]=usePreference('volume');
 const[error,setError]=useState(''),[waiting,setWaiting]=useState(false),[hidden,setHidden]=useState(document.hidden),[focused,setFocused]=useState(document.hasFocus());
 const engine=useRef<ArenaSoundtrack|null>(null);if(!engine.current)engine.current=new ArenaSoundtrack(setError);
 const paused=hidden||!focused, settings={music,effects,volume,mode,stage,paused,mood},latest=useRef(settings);latest.current=settings;
 async function unlock(){const ok=await engine.current!.unlock();setWaiting(!ok);engine.current!.update(latest.current);}
 useEffect(()=>{const visibility=()=>setHidden(document.hidden),focus=()=>setFocused(true),blur=()=>setFocused(false);document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',focus);window.addEventListener('blur',blur);return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',focus);window.removeEventListener('blur',blur);};},[]);
 useEffect(()=>{engine.current!.update(settings);},[music,effects,volume,mode,stage,paused,mood]);
 useEffect(()=>{let disposed=false;const resume=()=>{if(latest.current.music||latest.current.effects)void unlock();};if(music||effects){setWaiting(true);void engine.current!.unlock().then(ok=>{if(!disposed){setWaiting(!ok);engine.current!.update(latest.current);}});}window.addEventListener('pointerdown',resume,{once:true});window.addEventListener('keydown',resume,{once:true});return()=>{disposed=true;window.removeEventListener('pointerdown',resume);window.removeEventListener('keydown',resume);};},[]);
 useEffect(()=>()=>engine.current?.dispose(),[]);
 const toggle=async(which:'music'|'effects')=>{await unlock();if(which==='music')setMusic(!music);else setEffects(!effects);};
 return{music,effects,volume,setVolume,error,waiting,unlock,paused,mode,toggle,cue:(cue:Cue)=>engine.current!.cue(cue)};
}
export function SoundControl({sound}:{sound:ReturnType<typeof useArenaSound>}){return <SettingsPopover className="sound-control"><summary aria-label="声音设置">♪ <span>{sound.music||sound.effects?'声音已开':'声音关闭'}</span></summary><div className="sound-panel"><strong>给擂台一点声音</strong><p>{themes[sound.mode].name}</p><button className="secondary" aria-pressed={sound.music} onClick={()=>void sound.toggle('music')}>背景音乐：{sound.music?'开':'关'}</button><button className="secondary" aria-pressed={sound.effects} onClick={()=>void sound.toggle('effects')}>比赛音效：{sound.effects?'开':'关'}</button><label>音量 {sound.volume}%<input aria-label="声音音量" type="range" min="0" max="100" value={sound.volume} onChange={e=>sound.setVolume(Number(e.target.value))}/></label>{sound.waiting&&(sound.music||sound.effects)&&<button className="secondary" onClick={()=>void sound.unlock()}>声音已开启，点击后播放</button>}<small>已自动记住声音设置。看大图时继续播放，切到后台时暂停。</small>{sound.error&&<p role="status">{sound.error}</p>}</div></SettingsPopover>;}
