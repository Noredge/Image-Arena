import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { loadPicture, type Picture } from './browser';
import { getLanguage, message, t } from '../i18n';

export type NativeImage = { id: string; name: string; size: number; lastModified: number };
export type NativeBatch = { images: NativeImage[]; errors: string[] };
const nativeChunkSize = 4 * 1024 * 1024;
async function readNativeFile(source: NativeImage): Promise<File> {
  if (source.size <= nativeChunkSize) {
    const bytes = await invoke<ArrayBuffer>('read_image', { id: source.id });
    return new File([bytes], source.name, { lastModified: source.lastModified });
  }
  const chunks: Blob[] = [];
  for (let offset = 0; offset < source.size;) {
    const bytes = await invoke<ArrayBuffer>('read_image_chunk', { id: source.id, offset });
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== Math.min(nativeChunkSize, source.size - offset)) {
      throw new Error('图片分块读取不完整，请重新导入');
    }
    // Store immutable Blob parts so File assembly does not retain the complete
    // set of ArrayBuffers alongside another complete binary copy.
    chunks.push(new Blob([bytes])); offset += bytes.byteLength;
  }
  const file = new File(chunks, source.name, { lastModified: source.lastModified });
  chunks.length = 0;
  return file;
}
export async function loadNativeBatch(batch: NativeBatch): Promise<{ pictures: Picture[]; errors: string[] }> {
  const pictures: (Picture | null)[] = batch.images.map(() => null);
  const failures: (string | null)[] = batch.images.map(() => null);
  let cursor = 0;
  const concurrency = batch.images.some(image => image.size > 4 * nativeChunkSize) ? 1 : 2;
  await Promise.all(Array.from({ length: Math.min(concurrency, batch.images.length) }, async () => {
    while (cursor < batch.images.length) {
      const index = cursor++; const source = batch.images[index];
      try {
        const file = await readNativeFile(source);
        const picture = await loadPicture(file);
        // Preserve the managed binary getter; spreading it would copy the File
        // into a permanently retained plain property.
        picture.id = source.id;
        pictures[index] = picture;
      } catch (error) {
        failures[index] = `${source.name}：${error instanceof Error ? error.message : String(error)}`;
        await invoke('release_images', { ids: [source.id] }).catch(() => {});
      }
    }
  }));
  return { pictures: pictures.filter((p): p is Picture => !!p), errors: [...batch.errors, ...failures.filter((e): e is string => !!e)] };
}
export const pickNativeImages = () => invoke<NativeBatch>('pick_images', { language: getLanguage() });
export const setNativeLanguage = (language: string) => invoke('set_ui_language', { language });
export const releaseNativeIds = (ids: string[]) => invoke('release_images', { ids });
export const setImportEnabled = (enabled: boolean) => invoke('set_import_enabled', { enabled });
export async function watchNativeDrops(onBatch: (batch: NativeBatch) => void, onError: (error: unknown) => void) {
  let disposed = false;
  const take = async () => {
    try {
      for (const batch of await invoke<NativeBatch[]>('take_dropped_images')) {
        if (disposed) await releaseNativeIds(batch.images.map(i => i.id)); else onBatch(batch);
      }
    } catch (error) { if (!disposed) onError(error); }
  };
  const unlisten = await listen('arena-images-dropped', () => void take());
  void take();
  return () => { disposed = true; unlisten(); };
}
export const watchClose = (onClose: () => void) => getCurrentWindow().onCloseRequested(event => { event.preventDefault(); onClose(); });
export const closeNativeWindow = () => invoke('close_app');
export const copyNativeText = (text: string) => invoke('copy_text', { text });
export const saveNativeRecord = (content: string, filename: string) => invoke<boolean>('save_record', { content, filename, language: getLanguage() });

export type FileAction = 'keep' | 'move' | 'recycle';
export type Destination = { id: string; path: string };
export type OrganizationEntry = { operationId: string; imageIds: string[]; name: string; group: string; action: FileAction; source: string; target: string | null; status: string; note: string };
export type OrganizationPlan = { id: string; entries: OrganizationEntry[]; started: boolean; finished: boolean; journalPath: string | null; notice: string };
export type OrganizationRequest = { selectedIds: string[]; rejectedIds: string[]; selected: { action: FileAction; destinationId: string | null }; rejected: { action: FileAction; destinationId: string | null }; conflict: 'rename' | 'skip' };
export type DestinationGroup = 'selected' | 'rejected';
export const pickDestination = (group: DestinationGroup) => invoke<Destination | null>('pick_destination', { group, language: getLanguage() });
export const rememberedDestinations = () => invoke<{ selected: Destination | null; rejected: Destination | null; warnings: string[] }>('remembered_destinations');
export const prepareOrganization = (request: OrganizationRequest) => invoke<OrganizationPlan>('prepare_organization', { request });
export const discardOrganization = (id: string) => invoke('discard_organization', { id });
export const executeOrganization = (id: string, retry: boolean, recycleConfirmed: boolean) => invoke<OrganizationPlan>('execute_organization', { id, retry, recycleConfirmed });
export const cancelOrganization = () => invoke('cancel_organization');
export const openOperationRecords = () => invoke('open_operation_records');
export const watchOrganization = (update: (plan: OrganizationPlan) => void) => listen<OrganizationPlan>('arena-organization-progress', event => update(event.payload));

/** Localize readable fields only. Filenames, paths, IDs and status keys stay untouched. */
export function organizationRecord(plan: OrganizationPlan) {
  return { ...plan, notice: message(plan.notice), entries: plan.entries.map(entry => ({ ...entry,
    group: t(entry.group), note: message(entry.note),
  })) };
}
