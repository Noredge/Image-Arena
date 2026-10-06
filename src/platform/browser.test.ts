import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession, choose } from '../core/tournament';
import { downloadResults, exportRecord, importPictures, loadPicture, releasePictures, validateFormat } from './browser';

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
  it('checks dense PNG ancillary chunks with bounded reads and still finds late animation', async () => {
    const ancillary = new Uint8Array(12); ancillary.set([114,117,83,116], 4);
    const dense = new Uint8Array(87381 * 12);
    for (let offset = 0; offset < dense.length; offset += 12) dense.set(ancillary, offset);
    const png = new File([header.slice(0, 8), dense, header.slice(8)], 'dense.png');
    const reads = vi.spyOn(png, 'slice');
    await expect(validateFormat(png)).resolves.toBeUndefined();
    expect(reads.mock.calls.length).toBeLessThan(32);
    expect(reads.mock.calls.every(([start = 0, end = png.size]) => end - start <= 64 * 1024)).toBe(true);
    const animated = header.slice(8); animated.set([97,99,84,76], 4);
    await expect(validateFormat(new File([header.slice(0, 8), dense, animated], 'late-animation.png'))).rejects.toThrow('动态 PNG');
  });
  it('rejects a damaged header after the PNG scan window and skips large payloads', async () => {
    const ancillary = new Uint8Array(12); ancillary.set([114,117,83,116], 4);
    const dense = new Uint8Array(5500 * 12);
    for (let offset = 0; offset < dense.length; offset += 12) dense.set(ancillary, offset);
    const damaged = header.slice(8); new DataView(damaged.buffer).setUint32(0, 1024);
    await expect(validateFormat(new File([header.slice(0, 8), dense, damaged], 'damaged.png'))).rejects.toThrow('数据块损坏');
    const payload = new Uint8Array(128 * 1024);
    const bigHeader = ancillary.slice(0, 8); new DataView(bigHeader.buffer).setUint32(0, payload.length);
    const png = new File([header.slice(0, 8), bigHeader, payload, new Uint8Array(4), header.slice(8)], 'large-chunk.png');
    const reads = vi.spyOn(png, 'slice');
    await expect(validateFormat(png)).resolves.toBeUndefined();
    expect(reads.mock.calls.length).toBeLessThan(5);
  });
  it.each(Array.from({ length: 9 }, (_, index) => index))('handles headers %i bytes before the window end', async distance => {
    const padding = new Uint8Array(64 * 1024 - distance);
    new DataView(padding.buffer).setUint32(0, padding.length - 12);
    padding.set([114,117,83,116], 4);
    const tail = header.slice(8);
    const parts = [header.slice(0, 8), padding];
    await expect(validateFormat(new File([...parts, tail], 'boundary.png'))).resolves.toBeUndefined();
    tail.set([97,99,84,76], 4);
    await expect(validateFormat(new File([...parts, tail], 'boundary-animation.png'))).rejects.toThrow('动态 PNG');
    tail.set([114,117,48,116], 4);
    await expect(validateFormat(new File([...parts, tail], 'boundary-invalid.png'))).rejects.toThrow('数据块损坏');
    tail.set([114,117,83,116], 4);
    new DataView(tail.buffer).setUint32(0, 0xffffffff);
    await expect(validateFormat(new File([...parts, tail], 'boundary-overflow.png'))).rejects.toThrow('数据块损坏');
  });
  it.each([8, 9, 10, 11])('rejects a scanned chunk with only %i bytes including its header', async length => {
    await expect(validateFormat(new File([header.slice(0, 8), header.slice(8, 8 + length)], 'missing-crc.png'))).rejects.toThrow('数据块损坏');
  });
  it('creates no URL on scan failure or a rejected window read', async () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const damaged = header.slice(); new DataView(damaged.buffer).setUint32(8, 0xffffffff);
    await expect(loadPicture(new File([damaged], 'damaged.png'))).rejects.toThrow('数据块损坏');
    const png = file('unreadable.png');
    const readError = new Error('isolated read failure');
    vi.spyOn(png, 'slice').mockImplementationOnce(() => new Blob([header])).mockImplementationOnce(() => {
      const blob = new Blob(); vi.spyOn(blob, 'arrayBuffer').mockRejectedValue(readError); return blob;
    });
    await expect(loadPicture(png)).rejects.toBe(readError);
    expect(create).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
  });
  it('releases decoder resources for PNG truncation left to the decoder', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:truncated');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const images: { src: string }[] = [];
    vi.stubGlobal('Image', class {
      src = ''; naturalWidth = 0; naturalHeight = 0;
      constructor() { images.push(this); }
      async decode() { throw new Error('truncated PNG'); }
    });
    // This format preflight delegates missing chunks/CRC validation to decode().
    for (let length = 8; length < 16; length++) {
      await expect(loadPicture(new File([header.slice(0, length)], 'truncated.png'))).rejects.toThrow('图片无法解码');
    }
    expect(create).toHaveBeenCalledTimes(8); expect(revoke).toHaveBeenCalledTimes(8);
    expect(images.every(image => image.src === '')).toBe(true);
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
    expect(() => result.pictures[0].file).toThrow('resources have been released');
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
