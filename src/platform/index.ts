import { isTauri } from '@tauri-apps/api/core';
import { downloadResults as downloadBrowserResults, exportRecord, releasePictures as releaseBrowserPictures, type Picture } from './browser';
import type { Session } from '../core/tournament';
export { importPictures, type Picture } from './browser';
export const isDesktop = isTauri();
export const desktop = () => import('./desktop');
export function releasePictures(pictures: Picture[]) {
  releaseBrowserPictures(pictures);
  if (isDesktop) void desktop().then(d => d.releaseNativeIds(pictures.map(p => p.id))).catch(() => {});
}
export async function copyNames(text: string) {
  if (isDesktop) await (await desktop()).copyNativeText(text); else await navigator.clipboard.writeText(text);
}
export async function downloadResults(session: Session, pictures: Picture[]) {
  if (isDesktop) return (await desktop()).saveNativeRecord(JSON.stringify(exportRecord(session, pictures), null, 2), `image-arena-${session.config.seed}.json`);
  downloadBrowserResults(session, pictures); return true;
}
