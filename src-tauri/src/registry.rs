use serde::Serialize;
use std::{collections::HashMap, fs::{File, Metadata}, io::Read, path::{Path, PathBuf}, time::SystemTime};
use uuid::Uuid;
use sha2::{Digest, Sha256};
use std::os::windows::fs::OpenOptionsExt;

const MAX_FILE: u64 = 256 * 1024 * 1024;
const MAX_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_FILES: usize = 256;
const READ_CHUNK: u64 = 4 * 1024 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo { pub id: String, pub name: String, pub size: u64, pub last_modified: u64 }
#[derive(Default, Serialize)]
pub struct ImportBatch { pub images: Vec<ImageInfo>, pub errors: Vec<String> }
#[derive(Clone)]
pub struct Registered { pub path: PathBuf, pub size: u64, pub modified: SystemTime, pub digest: Option<[u8; 32]> }
#[derive(Default)]
pub struct Registry { files: HashMap<String, Registered>, reads: HashMap<String, ChunkRead> }
struct ChunkRead { file: File, offset: u64, digest: Sha256 }

fn snapshot(meta: &Metadata) -> Result<(u64, SystemTime), String> {
    if !meta.is_file() { return Err("请选择图片文件，不读取文件夹".into()); }
    if meta.len() > MAX_FILE { return Err("单张图片超过 256 MiB，请缩小批次或选择较小图片".into()); }
    Ok((meta.len(), meta.modified().map_err(|_| "无法读取文件修改时间")?))
}

impl Registry {
    pub fn read_chunk(&mut self, id: &str, offset: u64) -> Result<Vec<u8>, String> {
        let result = self.read_chunk_inner(id, offset);
        if result.is_err() { self.reads.remove(id); }
        result
    }
    fn read_chunk_inner(&mut self, id: &str, offset: u64) -> Result<Vec<u8>, String> {
        let entry = self.files.get_mut(id).ok_or("Image registration expired")?;
        if offset == 0 {
            // Hold the same Windows handle across the transfer, denying writes and
            // deletion until its final digest has been committed or it is released.
            let file = std::fs::OpenOptions::new().read(true).share_mode(1).open(&entry.path)
                .map_err(|e| format!("Cannot lock source image: {e}"))?;
            self.reads.insert(id.into(), ChunkRead { file, offset: 0, digest: Sha256::new() });
        }
        let reader = self.reads.get_mut(id).ok_or("Image read must begin at offset zero")?;
        if reader.offset != offset || offset > entry.size { return Err("Unexpected image chunk offset".into()); }
        if snapshot(&reader.file.metadata().map_err(|e| e.to_string())?)? != (entry.size, entry.modified) {
            return Err("Source image changed; import it again".into());
        }
        let count = (entry.size - offset).min(READ_CHUNK) as usize;
        let mut bytes = vec![0; count];
        reader.file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
        reader.digest.update(&bytes); reader.offset += count as u64;
        if reader.offset == entry.size {
            if snapshot(&reader.file.metadata().map_err(|e| e.to_string())?)? != (entry.size, entry.modified) {
                return Err("Source image changed; import it again".into());
            }
            let completed = self.reads.remove(id).unwrap();
            let digest: [u8; 32] = completed.digest.finalize().into();
            if entry.digest.is_some_and(|previous| previous != digest) { return Err("Source image contents changed".into()); }
            entry.digest = Some(digest);
        }
        Ok(bytes)
    }
    // This entry point is called only with paths from the OS picker or native drop event.
    // No IPC command accepts source paths supplied by JavaScript.
    pub fn register(&mut self, paths: Vec<PathBuf>) -> ImportBatch {
        let mut batch = ImportBatch::default();
        let mut total: u64 = self.files.values().map(|r| r.size).sum();
        for source in paths {
            let name = source.file_name().unwrap_or_default().to_string_lossy().into_owned();
            let result: Result<ImageInfo, String> = (|| {
                if self.files.len() >= MAX_FILES { return Err("本次最多容纳 256 张图片".into()); }
                let path = source.canonicalize().map_err(|_| "文件不存在或无法访问")?;
                let file = File::open(&path).map_err(|_| "文件无法读取，可能被占用或没有权限")?;
                let (size, modified) = snapshot(&file.metadata().map_err(|_| "无法读取文件信息")?)?;
                if total + size > MAX_BYTES { return Err("本次图片合计超过 1 GiB，请分批选择".into()); }
                let id = Uuid::new_v4().to_string();
                let last_modified = modified.duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
                self.files.insert(id.clone(), Registered { path, size, modified, digest: None });
                total += size;
                Ok(ImageInfo { id, name: name.clone(), size, last_modified })
            })();
            match result { Ok(info) => batch.images.push(info), Err(e) => batch.errors.push(format!("{name}：{e}")) }
        }
        batch
    }
    pub fn read(&mut self, id: &str) -> Result<Vec<u8>, String> {
        let entry = self.files.get_mut(id).ok_or("图片未登记或已从本轮移除，请重新导入")?;
        let bytes = read_unchanged(&entry.path, entry.size, entry.modified)?;
        let digest: [u8; 32] = Sha256::digest(&bytes).into();
        if entry.digest.is_some_and(|previous| previous != digest) { return Err("原图片内容已变化，请重新导入".into()); }
        entry.digest = Some(digest);
        Ok(bytes)
    }
    pub fn source(&self, id: &str) -> Result<Registered, String> {
        let entry = self.files.get(id).ok_or("图片已移除或未登记")?;
        if entry.digest.is_none() { return Err("图片还未完成预览读取".into()); }
        Ok(entry.clone())
    }
    pub fn relocated(&mut self, old: &Path, new: Option<&Path>) {
        self.files.retain(|_, entry| {
            if entry.path == old { if let Some(path) = new { entry.path = path.to_owned(); } else { return false; } }
            true
        });
    }
    pub fn release(&mut self, ids: &[String]) { for id in ids { self.reads.remove(id); self.files.remove(id); } }
}

fn read_unchanged(path: &Path, size: u64, modified: SystemTime) -> Result<Vec<u8>, String> {
    let mut file = File::open(path).map_err(|_| "原文件已不可访问，请重新导入")?;
    let check = |file: &File| -> Result<(), String> {
        let now = snapshot(&file.metadata().map_err(|_| "无法读取文件信息")?)?;
        if now != (size, modified) { return Err("原文件在导入期间发生变化，请重新导入".into()); }
        Ok(())
    };
    check(&file)?;
    let mut bytes = Vec::with_capacity(size as usize);
    (&mut file).take(MAX_FILE + 1).read_to_end(&mut bytes).map_err(|_| "图片读取失败")?;
    check(&file)?;
    if bytes.len() as u64 != size { return Err("原文件在读取期间发生变化，请重新导入".into()); }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chunked_read_is_bounded_locked_and_commits_digest_only_on_completion() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("chunks.png");
        let data = vec![17; READ_CHUNK as usize + 7]; std::fs::write(&path, &data).unwrap();
        let mut registry = Registry::default(); let id = registry.register(vec![path.clone()]).images[0].id.clone();
        let first = registry.read_chunk(&id, 0).unwrap(); assert_eq!(first.len(), READ_CHUNK as usize);
        assert!(registry.source(&id).is_err()); assert!(std::fs::write(&path, b"changed").is_err());
        let last = registry.read_chunk(&id, READ_CHUNK).unwrap(); assert_eq!(last, vec![17; 7]);
        assert_eq!(registry.source(&id).unwrap().digest, Some(Sha256::digest(&data).into()));
        assert!(registry.reads.is_empty());
        registry.read_chunk(&id, 0).unwrap(); registry.release(&[id.clone()]);
        assert!(registry.read_chunk(&id, READ_CHUNK).is_err()); assert!(registry.reads.is_empty());
        assert_eq!(std::fs::read(&path).unwrap(), data);
        std::fs::write(&path, b"released").unwrap();
    }
    #[test]
    fn invalid_chunk_offsets_drop_the_locked_handle() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("offset.png");
        File::create(&path).unwrap().set_len(READ_CHUNK + 1).unwrap();
        let mut registry = Registry::default(); let id = registry.register(vec![path.clone()]).images[0].id.clone();
        assert!(registry.read_chunk(&id, 1).is_err());
        registry.read_chunk(&id, 0).unwrap(); assert!(registry.read_chunk(&id, 3).is_err());
        assert!(registry.reads.is_empty()); assert!(registry.source(&id).is_err());
        std::fs::write(path, b"unlocked").unwrap();
    }
    #[test]
    fn count_limit_includes_previous_batches_and_release_reopens_slots() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("small.png"); std::fs::write(&path, b"small").unwrap();
        let mut registry = Registry::default();
        let batch = registry.register(vec![path.clone(); MAX_FILES + 1]);
        assert_eq!(batch.images.len(), MAX_FILES); assert_eq!(batch.errors.len(), 1);
        assert!(registry.register(vec![path.clone()]).images.is_empty());
        registry.release(&[batch.images[0].id.clone()]);
        assert_eq!(registry.register(vec![path]).images.len(), 1);
    }
    #[test]
    fn exact_single_and_total_byte_limits_are_inclusive() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("padded.png"); File::create(&path).unwrap().set_len(MAX_FILE).unwrap();
        let small = dir.path().join("one.png"); std::fs::write(&small, b"x").unwrap();
        let large = dir.path().join("too-large.png"); File::create(&large).unwrap().set_len(MAX_FILE + 1).unwrap();
        let mut registry = Registry::default();
        let batch = registry.register(vec![path.clone(); 4]);
        assert_eq!(batch.images.len(), 4); assert!(batch.errors.is_empty());
        assert_eq!(registry.register(vec![small.clone(), large]).errors.len(), 2);
        registry.release(&[batch.images[0].id.clone()]);
        assert_eq!(registry.register(vec![small]).images.len(), 1);
    }
    #[test]
    fn only_registered_ids_read_and_release_revokes_access() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("中文 空格.png"); std::fs::write(&path, b"original bytes and metadata").unwrap();
        let mut registry = Registry::default();
        assert!(registry.read(path.to_str().unwrap()).is_err());
        let batch = registry.register(vec![path.clone()]); let id = &batch.images[0].id;
        assert_eq!(registry.read(id).unwrap(), b"original bytes and metadata");
        registry.release(&[id.clone()]); assert!(registry.read(id).is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"original bytes and metadata");
    }
    #[test]
    fn same_names_and_repeat_imports_have_independent_ids() {
        let dir = tempfile::tempdir().unwrap(); let other = tempfile::tempdir().unwrap();
        let a = dir.path().join("same.png"); let b = other.path().join("same.png");
        std::fs::write(&a, b"a").unwrap(); std::fs::write(&b, b"b").unwrap();
        let mut registry = Registry::default(); let batch = registry.register(vec![a.clone(), b, a]);
        assert_eq!(batch.images.len(), 3);
        assert_ne!(batch.images[0].id, batch.images[1].id); assert_ne!(batch.images[0].id, batch.images[2].id);
        assert_eq!(registry.read(&batch.images[1].id).unwrap(), b"b");
    }
    #[test]
    fn directories_missing_changed_and_oversized_files_fail_without_mutation() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("changed.png");
        std::fs::write(&path, b"first").unwrap();
        let mut registry = Registry::default(); let batch = registry.register(vec![path.clone(), dir.path().into(), dir.path().join("missing.png")]);
        assert_eq!(batch.errors.len(), 2); assert_eq!(batch.images.len(), 1);
        std::fs::write(&path, b"changed contents").unwrap(); assert!(registry.read(&batch.images[0].id).unwrap_err().contains("变化"));
        let huge = dir.path().join("huge.png"); File::create(&huge).unwrap().set_len(MAX_FILE + 1).unwrap();
        assert_eq!(registry.register(vec![huge]).errors.len(), 1);
        assert_eq!(std::fs::read(path).unwrap(), b"changed contents");
    }
}
