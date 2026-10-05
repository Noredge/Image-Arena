import type { Session } from '../core/tournament';
import { version as appVersion } from '../../package.json';

export type Picture = { id: string; file: File; url: string; width: number; height: number };
// React's previous render and Chromium's form history can retain old Picture
// objects after removal. Give the binary a separate, explicitly ended lifetime.
const pictureFiles = new WeakMap<Picture, { file?: File }>();
function ownPicture(file: File, url: string, width: number, height: number): Picture {
  const owner: { file?: File } = { file };
  const picture: Picture = {
    id: crypto.randomUUID(), url, width, height,
    get file() {
      if (!owner.file) throw new Error('Picture resources have been released');
      return owner.file;
    },
  };
  pictureFiles.set(picture, owner);
  return picture;
}
const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
export async function validateFormat(file: File): Promise<void> {
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const png = head.length >= 8 && head[0] === 137 && ascii(head, 1, 4) === 'PNG' && head[4] === 13 && head[5] === 10 && head[6] === 26 && head[7] === 10;
  const jpeg = head[0] === 255 && head[1] === 216 && head[2] === 255;
  const webp = ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP';
  if (!png && !jpeg && !webp) throw new Error('仅支持 PNG、JPEG、WebP 静态图片；此文件格式不受支持或文件头已损坏');
  if (png) {
    let offset = 8;
    while (offset + 8 <= file.size) {
      const chunk = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      const type = ascii(chunk, 4, 8);
      const chunkLength = new DataView(chunk.buffer).getUint32(0);
      // Reject malformed chunks before an unbounded sequence of Blob reads.
      if (!/^[A-Za-z]{4}$/.test(type) || chunkLength > file.size - offset - 12) {
        throw new Error('PNG 数据块损坏或不完整，请重新导出图片');
      }
      if (type === 'acTL') throw new Error('暂不支持动态 PNG，请选择静态图片');
      if (type === 'IDAT' || type === 'IEND') break;
      offset += chunkLength + 12;
    }
  }
  if (webp && ascii(head, 12, 16) === 'VP8X' && (head[20] & 2)) throw new Error('暂不支持动态 WebP，请选择静态图片');
}
export async function loadPicture(file: File): Promise<Picture> {
  await validateFormat(file);
  const url = URL.createObjectURL(file);
  const image = new Image();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    image.src = url;
    await Promise.race([image.decode(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('图片读取超时，请重试或使用较小图片')), 15000); })]);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片没有有效尺寸');
    return ownPicture(file, url, image.naturalWidth, image.naturalHeight);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error(error instanceof Error && error.message.includes('超时') ? error.message : '图片无法解码，文件可能已损坏');
  } finally { clearTimeout(timer); image.src = ''; }
}
export type ImportProgress = { completed: number; total: number };
export async function importPictures(files: File[], existing: Picture[] = [], onProgress?: (progress: ImportProgress) => void): Promise<{ pictures: Picture[]; errors: string[] }> {
  const total = files.length;
  const accepted: File[] = [], limits: string[] = []; let bytes = existing.reduce((sum,p)=>sum+p.file.size,0);
  for(const file of files) { const reason = existing.length+accepted.length>=256 ? '本次最多容纳 256 张图片' : file.size>256*1024*1024 ? '单张图片超过 256 MiB' : bytes+file.size>1024*1024*1024 ? '本次图片合计超过 1 GiB' : ''; if(reason) limits.push(file.name+'：'+reason); else {accepted.push(file);bytes+=file.size;} }
  files=accepted;
  let completed = limits.length;
  onProgress?.({ completed, total });
  const results: (Picture | null)[] = Array(files.length).fill(null);
  const failures: (string | null)[] = Array(files.length).fill(null);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(2, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor++;
      try { results[index] = await loadPicture(files[index]); }
      catch (e) { failures[index] = `${files[index].name}：${e instanceof Error ? e.message : '读取失败'}`; }
      finally { onProgress?.({ completed: ++completed, total }); }
    }
  }));
  return { pictures: results.filter((p): p is Picture => !!p), errors: [...limits, ...failures.filter((e): e is string => !!e)] };
}
export function releasePictures(pictures: Picture[]) {
  pictures.forEach(p => {
    URL.revokeObjectURL(p.url);
    const owner = pictureFiles.get(p);
    if (owner) { owner.file = undefined; pictureFiles.delete(p); }
  });
}
export function exportRecord(session: Session, pictures: Picture[]) {
  const ranks = new Map(session.ranked.map(r => [r.imageId, r.rank]));
  return {
    schemaVersion: 3, appVersion, algorithm: { ranking: 'winner-tree-v1', knockout: 'single-elimination-v1', gauntlet: 'gauntlet-v1', double: 'double-elimination-v1', groups: 'groups-knockout-v1' }[session.config.mode ?? 'ranking'],
    mode: session.config.mode ?? 'ranking',
    sessionSeed: session.config.seed, targetK: session.config.targetK,
    completed: session.completed, comparisons: session.history.length,
    leafLayout: session.layout, actualSelected: session.ranked.length, vetoedIds: session.vetoed, events: session.events,
    images: pictures.map(p => ({ imageId: p.id, originalName: p.file.name, size: p.file.size, lastModified: p.file.lastModified, rank: ranks.get(p.id) ?? null, category: session.vetoed.includes(p.id) ? 'vetoed' : ranks.has(p.id) ? 'selected' : 'unselected' })),
    decisions: session.history,
    note: session.config.mode !== 'ranking' ? '本届淘汰赛仅确定冠军；退场先后不代表偏好排名。此清单不是文件移动凭证。' : '本轮偏好排名。未入选图片无内部排名。此清单不是文件移动凭证。',
  };
}
export function downloadResults(session: Session, pictures: Picture[]) {
  const blob = new Blob([JSON.stringify(exportRecord(session, pictures), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `image-arena-${session.config.seed}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
