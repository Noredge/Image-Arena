import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { invoke } from '@tauri-apps/api/core';
import { loadNativeBatch, type NativeBatch } from './desktop';
import { releasePictures } from './browser';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));
const header = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,73,68,65,84,0,0,0,0]);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.mocked(invoke).mockReset(); });

describe('desktop adapter with isolated IPC and decoder doubles', () => {
  it('finishes decoding each large image before starting the next transfer', async () => {
    const size = 16 * 1024 * 1024 + 1;
    let decoded = 0;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      expect(command).toBe('read_image_chunk');
      const { id, offset } = args as { id: string; offset: number };
      if (id === 'second' && offset === 0) expect(decoded).toBe(1);
      const bytes = new Uint8Array(Math.min(4 * 1024 * 1024, size - offset));
      if (!offset) bytes.set(header);
      return bytes.buffer;
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:large-sequence');
    vi.stubGlobal('Image', class { src = ''; naturalWidth = 20; naturalHeight = 30; async decode() { await new Promise(r => setTimeout(r, 1)); decoded++; } });
    const result = await loadNativeBatch({ images: ['first','second'].map(id => ({ id, name: id + '.png', size, lastModified: 3 })), errors: [] });
    expect(result.errors).toEqual([]); expect(result.pictures.map(p => p.id)).toEqual(['first','second']);
    expect(result.pictures.map(p => p.file.size)).toEqual([size,size]); expect(decoded).toBe(2);
  });
  it('assembles large files from bounded chunks while preserving bytes and metadata', async () => {
    const chunkSize = 4 * 1024 * 1024;
    const data = new Uint8Array(chunkSize + 7); data.set(header);
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      expect(command).toBe('read_image_chunk');
      const offset = (args as { offset: number }).offset;
      return data.slice(offset, Math.min(offset + chunkSize, data.length)).buffer;
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chunk-test');
    vi.stubGlobal('Image', class { src = ''; naturalWidth = 20; naturalHeight = 30; async decode() {} });
    const result = await loadNativeBatch({ images: [{ id: 'large', name: 'large.png', size: data.length, lastModified: 77 }], errors: [] });
    expect(result.errors).toEqual([]); expect(result.pictures[0].id).toBe('large');
    expect(result.pictures[0].file.lastModified).toBe(77);
    const checksum = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    expect(checksum(new Uint8Array(await result.pictures[0].file.arrayBuffer()))).toBe(checksum(data));
    expect(invoke).toHaveBeenCalledWith('read_image_chunk', { id: 'large', offset: 0 });
    expect(invoke).toHaveBeenCalledWith('read_image_chunk', { id: 'large', offset: chunkSize });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    releasePictures(result.pictures);
    expect(() => result.pictures[0].file).toThrow('released');
  });
  it('releases a large registration when a chunk is incomplete', async () => {
    vi.mocked(invoke).mockResolvedValue(new ArrayBuffer(0));
    const result = await loadNativeBatch({ images: [{ id: 'partial', name: 'partial.png', size: 4 * 1024 * 1024 + 1, lastModified: 0 }], errors: [] });
    expect(result.pictures).toEqual([]); expect(result.errors).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith('release_images', { ids: ['partial'] });
  });
  it('uses native IDs and preserves original bytes and metadata without requesting paths', async () => {
    let active = 0; let peak = 0;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      expect(command).toBe('read_image'); expect(Object.keys(args!)).toEqual(['id']);
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1)); active--;
      return header.slice().buffer;
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.stubGlobal('Image', class { src = ''; naturalWidth = 20; naturalHeight = 30; async decode() {} });
    const batch: NativeBatch = { images: Array.from({ length: 4 }, (_, i) => ({ id: `registered-${i}`, name: '同名 图片.png', size: header.length, lastModified: 1234 })), errors: [] };
    const result = await loadNativeBatch(batch);
    expect(result.errors).toEqual([]); expect(peak).toBe(2);
    expect(result.pictures.map(p => p.id)).toEqual(batch.images.map(p => p.id));
    expect(result.pictures.map(p => p.file.lastModified)).toEqual([1234,1234,1234,1234]);
    expect(new Uint8Array(await result.pictures[0].file.arrayBuffer())).toEqual(header);
  });
  it('reports native and decode failures and revokes rejected registrations', async () => {
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === 'release_images') return;
      if ((args as { id: string }).id === 'gone') throw '原文件已不可访问';
      return new TextEncoder().encode('not an image').buffer;
    });
    const result = await loadNativeBatch({ images: ['gone','bad'].map(id => ({ id, name: `${id}.png`, size: 3, lastModified: 0 })), errors: ['文件夹未读取'] });
    expect(result.pictures).toEqual([]); expect(result.errors).toHaveLength(3);
    expect(result.errors[1]).toContain('原文件已不可访问');
    expect(invoke).toHaveBeenCalledWith('release_images', { ids: ['gone'] });
    expect(invoke).toHaveBeenCalledWith('release_images', { ids: ['bad'] });
  });
  it('treats a cancelled picker as an empty batch', async () => {
    expect(await loadNativeBatch({ images: [], errors: [] })).toEqual({ pictures: [], errors: [] });
    expect(invoke).not.toHaveBeenCalled();
  });
});
