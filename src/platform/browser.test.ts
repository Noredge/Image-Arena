import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession, choose } from '../core/tournament';
import { downloadResults, exportRecord, importPictures, releasePictures, validateFormat } from './browser';

// Decoder doubles isolate adapter ownership/error tests; real decoding is separately checked in the browser.
const header = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,73,68,65,84,0,0,0,0]);
const file = (name: string) => new File([header], name, { type: 'image/png', lastModified: 12345 });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('browser adapter (isolated decoder tests)', () => {
  it('rejects unsupported and animated formats before creating resources', async () => {
    await expect(validateFormat(new File(['text'], 'wrong.png'))).rejects.toThrow('不受支持');
    const animated = header.slice(); animated.set([97,99,84,76], 12);
    await expect(validateFormat(new File([animated], 'anim.png'))).rejects.toThrow('动态 PNG');
    const webp = new Uint8Array(32); webp.set([82,73,70,70], 0); webp.set([87,69,66,80,86,80,56,88], 8); webp[20] = 2;
    await expect(validateFormat(new File([webp], 'anim.webp'))).rejects.toThrow('动态 WebP');
  });
  it('limits concurrency, preserves same-name files and cleans only failed or explicitly released URLs', async () => {
    const active = new Map<string, File>(); let serial = 0; let decoding = 0; let peak = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { const url = `blob:test-${serial++}`; active.set(url, blob as File); return url; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => { active.delete(url); });
    vi.stubGlobal('Image', class {
      src = ''; naturalWidth = 100; naturalHeight = 200;
      async decode() {
        decoding++; peak = Math.max(peak, decoding);
        const failed = active.get(this.src)?.name === 'broken.png';
        await new Promise(resolve => setTimeout(resolve, 1)); decoding--;
        if (failed) throw new Error('decode failed');
      }
    });
    const originals = [file('same.png'), file('same.png'), file('broken.png'), file('last.png')];
    const before = await Promise.all(originals.map(f => f.arrayBuffer()));
    const result = await importPictures(originals);
    expect(result.pictures).toHaveLength(3); expect(result.errors).toHaveLength(1); expect(peak).toBe(2);
    expect(result.pictures[0].id).not.toBe(result.pictures[1].id);
    expect(result.pictures[0].file).toBe(originals[0]); expect(active.size).toBe(3);
    releasePictures([result.pictures[0]]); expect(active.size).toBe(2);
    releasePictures(result.pictures.slice(1)); expect(active.size).toBe(0);
    expect(await Promise.all(originals.map(f => f.arrayBuffer()))).toEqual(before);
  });
  it('exports only determined ranks and file metadata, without binary, URLs or invented paths', () => {
    const pictures = ['a', 'b', 'c'].map(id => ({ id, file: file('same.png'), url: `blob:${id}`, width: 100, height: 100 }));
    let s = createSession({ imageIds: pictures.map(p => p.id), targetK: 2, seed: 17 });
    while (s.pending) s = choose(s, { matchId: s.pending.id, winnerId: [s.pending.leftId, s.pending.rightId].sort()[0] });
    const record = exportRecord(s, pictures);
    expect(record.images.map(p => p.rank)).toEqual([1, 2, null]);
    expect(record.images.map(p => p.imageId)).toEqual(['a', 'b', 'c']);
    expect(record.images.every(p => p.originalName === 'same.png' && p.lastModified === 12345 && p.size === header.length)).toBe(true);
    expect(record.sessionSeed).toBe(17); expect(record.leafLayout).toEqual(s.layout);
    const serialized = JSON.stringify(record); expect(serialized).not.toMatch(/blob:|base64|fakepath|"file"|"url"/);
  });
  it('creates a decodable JSON download and releases its temporary URL after dispatch', async () => {
    vi.useFakeTimers();
    try {
      const s = createSession({ imageIds: ['one'], targetK: 1, seed: 42 });
      const picture = { id: 'one', file: file('原图.png'), url: 'blob:original', width: 100, height: 100 };
      let blob: Blob | undefined;
      vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blob = value as Blob; return 'blob:result'; });
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
      vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } });
      downloadResults(s, [picture]);
      expect(anchor.download).toBe('image-arena-42.json'); expect(anchor.click).toHaveBeenCalledOnce();
      expect(JSON.parse(await blob!.text())).toEqual(exportRecord(s, [picture]));
      expect(revoke).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1000);
      expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:result');
    } finally { vi.useRealTimers(); }
  });
});
