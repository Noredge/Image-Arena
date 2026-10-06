import { t } from '../i18n';
import type {TournamentMode} from '../core/tournament';
export type SoundStage='prepare'|'battle'|'results';
export type Cue='start'|'vote'|'undo'|'win'|'veto'|'vetoBoth'|'settle';
export type SoundSettings={music:boolean;effects:boolean;volume:number;mode:TournamentMode;stage:SoundStage;paused:boolean;mood?:string};
export const initialSound:SoundSettings={music:false,effects:false,volume:20,mode:'ranking',stage:'prepare',paused:false};
export const themes={
 ranking:{name:'席间小调',bpm:72,roots:[48,45,53,43],notes:[72,0,76,0,79,76,0,74,72,0,69,0,67,0,0,0,69,0,72,0,76,0,74,0,72,0,67,0,69,0,0,0]},
 knockout:{name:'月下过招',bpm:88,roots:[50,46,48,45],notes:[62,0,69,0,65,67,69,0,72,0,69,67,65,0,0,0,62,0,65,0,69,0,72,0,74,72,69,0,65,0,0,0]},
 gauntlet:{name:'下一位，请',bpm:96,roots:[48,53,55,48],notes:[72,0,79,76,0,74,0,76,79,0,81,79,0,76,0,0,74,0,77,79,0,77,0,74,76,0,79,76,0,72,0,0]},
 double:{name:'再起一局',bpm:80,roots:[45,53,48,55],notes:[69,0,72,0,76,0,74,72,71,0,67,0,69,0,0,0,65,0,69,0,72,74,76,0,74,0,72,0,69,0,0,0]},
 groups:{name:'会场正热闹',bpm:84,roots:[53,48,50,55],notes:[77,0,76,72,0,74,0,77,79,0,77,76,0,72,0,0,74,0,77,0,79,77,74,0,72,0,76,0,77,0,0,0]},
};
export const noteFrequency=(midi:number)=>440*2**((midi-69)/12);
// Original offline procedural scores: 160 half-beats, 50–67 second form.
export class ArenaSoundtrack {
 private context?:AudioContext;private musicBus?:GainNode;private effectsBus?:GainNode;private timer?:ReturnType<typeof setInterval>;
 private voices=new Map<OscillatorNode,{kind:'music'|'effects';bus:GainNode}>();private retired=new Set<GainNode>();
 private settings=initialSound;private nextBeat=0;private step=0;private lastCue=-Infinity;
 constructor(private onError:(message:string)=>void){}
 async unlock(){try{if(!this.context){this.context=new AudioContext();this.musicBus=this.context.createGain();this.effectsBus=this.context.createGain();this.musicBus.gain.value=0;this.effectsBus.gain.value=0;this.musicBus.connect(this.context.destination);this.effectsBus.connect(this.context.destination);}await this.context.resume();this.onError('');return this.context.state==='running';}catch{this.onError(t("声音暂时不可用；选图不受影响。"));return false;}}
 private level(){return this.settings.volume/100*(this.settings.stage==='battle'?.35:.65);}
 update(settings:SoundSettings){const changed=settings.mode!==this.settings.mode;this.settings=settings;const ctx=this.context;if(!ctx)return;
  const musicOn=settings.music&&!settings.paused;
  if(changed&&musicOn){const old=this.musicBus!;old.gain.setTargetAtTime(0,ctx.currentTime,.25);this.retired.add(old);for(const [v,data]of this.voices)if(data.bus===old)v.stop(ctx.currentTime+1);if(![...this.voices.values()].some(v=>v.bus===old)){old.disconnect();this.retired.delete(old);}this.musicBus=ctx.createGain();this.musicBus.gain.value=0;this.musicBus.connect(ctx.destination);clearInterval(this.timer);this.timer=undefined;this.step=0;}
  this.musicBus!.gain.setTargetAtTime(musicOn?this.level():0,ctx.currentTime,changed?.25:.08);
  this.effectsBus!.gain.setTargetAtTime(settings.effects&&!settings.paused?settings.volume/100*.65:0,ctx.currentTime,.015);
  if(!musicOn){clearInterval(this.timer);this.timer=undefined;for(const [v,d]of this.voices)if(d.kind==='music')v.stop(ctx.currentTime+.06);}
  if(settings.paused)for(const v of this.voices.keys())v.stop(ctx.currentTime+.06);
  if(musicOn&&!this.timer){this.nextBeat=ctx.currentTime+.12;this.timer=setInterval(()=>this.schedule(),100);void ctx.resume().catch(()=>this.onError(t("声音已开启，点击后播放。")));}
 }
 private tone(midi:number,at:number,duration:number,level:number,kind:'music'|'effects',soft=false){const ctx=this.context!,v=ctx.createOscillator(),envelope=ctx.createGain(),bus=kind==='music'?this.musicBus!:this.effectsBus!;
  v.type=soft?'sine':'triangle';v.frequency.value=noteFrequency(midi);envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(level,at+Math.min(soft?.09:.008,duration/3));envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);v.connect(envelope);envelope.connect(bus);
  v.onended=()=>{v.disconnect();envelope.disconnect();this.voices.delete(v);if(this.retired.has(bus)&&![...this.voices.values()].some(d=>d.bus===bus)){bus.disconnect();this.retired.delete(bus);}};
  this.voices.set(v,{kind,bus});v.start(at);v.stop(at+duration+.02);
 }
 private schedule(){const ctx=this.context!;if(ctx.state!=='running')return;if(this.nextBeat<ctx.currentTime)this.nextBeat=ctx.currentTime+.05;
  const {mode,stage,mood}=this.settings,t=themes[mode],beat=60/t.bpm/2;
  while(this.nextBeat<ctx.currentTime+.25){const step=this.step%160,phrase=Math.floor(step/32),note=t.notes[step%32],root=t.roots[Math.floor(step/8)%4];
   if(note&&(stage!=='battle'||step%2===0))this.tone(note-12+(phrase===3?5:0),this.nextBeat,mode==='gauntlet'?.25:.6,.08,'music',mode==='ranking');
   if(step%8===0){this.tone(root,this.nextBeat,beat*7,.065,'music',true);this.tone(root+7,this.nextBeat+.05,beat*6,.03,'music',true);}
   if(mode==='gauntlet'&&step%4===3)this.tone(root-12,this.nextBeat,.18,.06,'music',true);
   if((mode==='knockout'||mood==='knockout')&&step%8===4)this.tone(38,this.nextBeat,.12,.035,'music',true);
   if(mode==='double'&&mood==='lower'&&step%8===6)this.tone(root+12,this.nextBeat,.6,.035,'music',true);
   if(mode==='groups'&&stage!=='battle'&&step%16===14)this.tone(root+24,this.nextBeat,.35,.025,'music',true);
   this.step=(this.step+1)%160;this.nextBeat+=beat;
  }
 }
 cue(cue:Cue){const ctx=this.context;if(!ctx||!this.settings.effects||this.settings.paused)return;const at=ctx.currentTime+.02;if(at-this.lastCue<.09)return;this.lastCue=at;
  if(this.settings.music){this.musicBus!.gain.setTargetAtTime(this.level()*.707,at,.05);this.musicBus!.gain.setTargetAtTime(this.level(),at+.2,.13);}
  if(cue==='veto'||cue==='vetoBoth'){this.tone(62,at,.06,.085,'effects');this.tone(cue==='vetoBoth'?43:48,at+.04,.18,.08,'effects',true);return;}
  const root=this.settings.mode==='ranking'?60:62,notes=cue==='vote'?[7]:cue==='undo'?[0,4]:cue==='start'?[0,7,12]:cue==='settle'?[7,0]:[0,4,7,12];
  notes.forEach((n,i)=>this.tone(root+n,at+i*.12,cue==='win'?.8:.25,cue==='vote'?.09:.12,'effects'));
 }
 dispose(){clearInterval(this.timer);this.timer=undefined;for(const v of this.voices.keys())v.stop();this.voices.clear();for(const b of this.retired)b.disconnect();this.retired.clear();void this.context?.close().catch(()=>{});this.context=undefined;}
}
