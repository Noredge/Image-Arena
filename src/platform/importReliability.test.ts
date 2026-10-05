import {afterEach, expect, it, vi} from 'vitest';
import {validateFormat, loadPicture, releasePictures} from './browser';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()});
it('ends binary ownership even when a stale Picture reference remains alive', async()=>{
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,73,68,65,84,0,0,0,0]);
  const original=new File([bytes],'retained.png',{lastModified:123});
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:owned');
  const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  vi.stubGlobal('Image',class{src='';naturalWidth=20;naturalHeight=30;async decode(){}});
  const picture=await loadPicture(original);
  expect(picture.file).toBe(original);
  releasePictures([picture]);
  expect(()=>picture.file).toThrow('released');
  expect(revoke).toHaveBeenCalledWith('blob:owned');
  expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes);
  expect(()=>releasePictures([picture])).not.toThrow();
});
it('rejects malformed PNG chunk types with bounded header reads', async()=>{
  const bytes=new Uint8Array(1024*1024);bytes.set([137,80,78,71,13,10,26,10]);
  const file=new File([bytes],'malformed.png');
  const original=file.slice.bind(file);let reads=0;
  vi.spyOn(file,'slice').mockImplementation((start,end,type)=>{
    if(++reads>4)throw new Error('header scanning exceeded bounded reads');
    return original(start,end,type);
  });
  await expect(validateFormat(file)).rejects.toThrow('PNG');
  expect(reads).toBeLessThanOrEqual(2);
});
it('rejects a PNG chunk whose declared payload exceeds the file', async()=>{
  const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);
  new DataView(bytes.buffer).setUint32(8,0xffffffff);bytes.set([116,69,88,116],12);
  await expect(validateFormat(new File([bytes],'overrun.png'))).rejects.toThrow('PNG');
});
