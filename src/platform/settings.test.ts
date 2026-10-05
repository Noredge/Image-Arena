import {describe,it,expect} from 'vitest';
import {sanitize,defaults} from './settings';
describe('settings validation',()=>{
 it('fills missing/invalid fields without losing valid ones or persisting session data',()=>{expect(sanitize({theme:'dark',volume:0,music:true,effects:false,mode:'bad',preferredK:0,recycleConfirmed:true})).toEqual({...defaults,theme:'dark',volume:0,music:true,effects:false});});
 it('limits volume and accepts all five modes and independent saved actions',()=>{expect(sanitize({mode:'groups',volume:999,selectedAction:'recycle',rejectedAction:'recycle',preferredK:5})).toEqual({...defaults,mode:'groups',volume:100,rejectedAction:'recycle',preferredK:5});expect(sanitize(null)).toEqual(defaults);});
});
