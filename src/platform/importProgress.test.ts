import { afterEach, expect, it, vi } from 'vitest';
import { importPictures, releasePictures, type Picture, type ImportProgress } from './browser';
const header = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,73,68,65,84,0,0,0,0]);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('reports all settled files including malformed and decode failures', async () => {
  const files = [new File([header], 'ok.png'), new File(['broken'], 'wrong.heic'), new File([header], 'decode.png')];
  const urls = new Map<string, File>(); let id = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { const url = `blob:${id++}`; urls.set(url, blob as File); return url; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => { urls.delete(url); });
  vi.stubGlobal('Image', class { src = ''; naturalWidth = 200; naturalHeight = 100; async decode() { if (urls.get(this.src)?.name === 'decode.png') throw Error('decode'); } });
  const progress: ImportProgress[] = [];
  const result = await importPictures(files, [], p => progress.push(p));
  expect(progress.map(p => p.completed)).toEqual([0,1,2,3]); expect(progress.every(p => p.total === 3)).toBe(true);
  expect(result.pictures).toHaveLength(1); expect(result.errors).toHaveLength(2);
  releasePictures(result.pictures); expect(urls.size).toBe(0);
});
it('counts limit rejections before decoding without changing the 256 image cap', async () => {
  const file = new File([header], 'same.png');
  const existing: Picture[] = Array.from({ length: 256 }, (_, i) => ({ id: String(i), file, url: 'blob:old', width: 200, height: 100 }));
  const allocate = vi.spyOn(URL, 'createObjectURL'); const progress: ImportProgress[] = [];
  const result = await importPictures([file,file], existing, p => progress.push(p));
  expect(result.pictures).toHaveLength(0); expect(result.errors).toHaveLength(2); expect(progress).toEqual([{ completed: 2, total: 2 }]); expect(allocate).not.toHaveBeenCalled();
});
it('treats an empty or cancelled file selection as no pictures and no failures', async () => {
  const allocate = vi.spyOn(URL, 'createObjectURL'); const progress: ImportProgress[] = [];
  expect(await importPictures([], [], p => progress.push(p))).toEqual({ pictures: [], errors: [] });
  expect(progress).toEqual([{ completed: 0, total: 0 }]); expect(allocate).not.toHaveBeenCalled();
});
