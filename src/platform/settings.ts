import { useSyncExternalStore } from 'react';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { modes, type TournamentMode } from '../core/tournament';
export type Settings={music:boolean;effects:boolean;volume:number;theme:'light'|'dark';motionPaused:boolean;mode:TournamentMode;preferredK:number;linked:boolean;selectedAction:'keep'|'move';rejectedAction:'keep'|'move'|'recycle';conflict:'rename'|'skip';showPreview:boolean};
export const defaults:Settings={music:true,effects:true,volume:20,theme:'light',motionPaused:false,mode:'ranking',preferredK:3,linked:true,selectedAction:'keep',rejectedAction:'keep',conflict:'rename',showPreview:false};
export function sanitize(value:unknown):Settings {
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};const s={...defaults};
 for(const k of ['music','effects','motionPaused','linked','showPreview'] as const)if(typeof v[k]==='boolean')s[k]=v[k];
 for(const [key,options] of Object.entries({theme:['light','dark'],mode:modes,selectedAction:['keep','move'],rejectedAction:['keep','move','recycle'],conflict:['rename','skip']}))if((options as readonly string[]).includes(v[key] as string))Object.assign(s,{[key]:v[key]});
 if(typeof v.volume==='number'&&Number.isFinite(v.volume))s.volume=Math.max(0,Math.min(100,v.volume));
 if(typeof v.preferredK==='number'&&Number.isInteger(v.preferredK)&&v.preferredK>=1&&v.preferredK<=256)s.preferredK=v.preferredK;
 return s;
}
let settings={...defaults},notice='',queue=Promise.resolve();const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(f=>f());
function applyTheme(){document.documentElement.dataset.theme=settings.theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',settings.theme==='dark'?'#252323':'#f6f2e9');}
export async function initializeSettings(){
 try {if(isTauri()){const result=await invoke<{values:unknown;warning:string}>('load_settings');settings=sanitize(result.values);notice=result.warning;
 // Migrate the old browser theme only when the native settings file has never existed.
 if(result.values===null){try{settings.theme=localStorage.getItem('image-arena-theme')==='dark'?'dark':'light';}catch{} }
 } else {let raw=localStorage.getItem('image-arena-settings');if(raw){try{const parsed=JSON.parse(raw);if(parsed?.version!==1||!parsed.values||typeof parsed.values!=='object')throw Error('settings');settings=sanitize(parsed.values);}catch{try{localStorage.setItem(`image-arena-settings-broken-${Date.now()}`,raw);}catch{}notice='设置记录损坏，已恢复默认设置。';}}else settings.theme=localStorage.getItem('image-arena-theme')==='dark'?'dark':'light';}
 }catch{notice='设置记忆暂不可用，本次选择仍可正常使用。';} applyTheme();notify();
}
export function setPreference<K extends keyof Settings>(key:K,value:Settings[K]){
 settings=sanitize({...settings,[key]:value});applyTheme();notify();const snapshot={...settings};
 try{localStorage.setItem('image-arena-theme',settings.theme);}catch{}
 queue=queue.then(async()=>{try{if(isTauri())await invoke('save_settings',{values:snapshot});else localStorage.setItem('image-arena-settings',JSON.stringify({version:1,values:snapshot}));notice='';}catch{notice='设置暂未保存，下次启动可能恢复旧值。';}notify();});
}
export const flushSettings=()=>queue;
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function usePreference<K extends keyof Settings>(key:K):[Settings[K],(value:Settings[K])=>void]{const s=useSyncExternalStore(subscribe,()=>settings,()=>defaults);return[s[key],value=>setPreference(key,value)];}
export function useSettingsNotice(){return useSyncExternalStore(subscribe,()=>notice,()=>notice);}
