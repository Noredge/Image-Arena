import {afterEach,expect,it,vi} from 'vitest';
import {ArenaSoundtrack,initialSound,themes} from './soundtrack';
import {modes} from '../core/tournament';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('five scores loop within 48–72 seconds, retain one scheduler and keep veto effects atomic',async()=>{
 vi.useFakeTimers();const voices:{start:ReturnType<typeof vi.fn>}[]=[];let clock=0;const gains:{gain:{setTargetAtTime:ReturnType<typeof vi.fn>}}[]=[];
 class Audio {get currentTime(){return clock;}state='running';destination={};resume=vi.fn(async()=>{});close=vi.fn(async()=>{});
 createGain(){const g={gain:{value:0,setTargetAtTime:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};gains.push(g);return g;}
 createOscillator(){const v={frequency:{value:0},start:vi.fn(),stop:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),onended:()=>{}};voices.push(v);return v;}}
 vi.stubGlobal('AudioContext',Audio);const e=new ArenaSoundtrack(()=>{});await e.unlock();
 const motifs=new Set<string>();for(const mode of modes){const t=themes[mode];expect(160*30/t.bpm).toBeGreaterThanOrEqual(48);expect(160*30/t.bpm).toBeLessThanOrEqual(72);motifs.add(JSON.stringify(t.notes));e.update({...initialSound,mode,music:true,effects:true});await vi.advanceTimersByTimeAsync(100);expect(vi.getTimerCount()).toBe(1);clock+=1;}
 expect(motifs.size).toBe(5);const before=voices.length;e.cue('vetoBoth');expect(voices.length-before).toBe(2);e.cue('veto');expect(voices.length-before).toBe(2);clock+=.1;e.cue('undo');expect(voices.length-before).toBe(4);
 e.update({...initialSound,music:true,effects:true,volume:0});expect(gains.some(g=>g.gain.setTargetAtTime.mock.calls.some(c=>c[0]===0))).toBe(true);
 e.update({...initialSound,music:true,paused:true});expect(vi.getTimerCount()).toBe(0);clock+=3600;e.update({...initialSound,music:true});const resumed=voices.length;await vi.advanceTimersByTimeAsync(100);expect(voices.length-resumed).toBeLessThan(8);e.dispose();expect(vi.getTimerCount()).toBe(0);
});
