//! Windows operations use locked handles. No path-based overwrite/delete fallback.
use std::{fs::{File, OpenOptions}, io::{Read, Seek, SeekFrom}, os::windows::{fs::{MetadataExt, OpenOptionsExt}, io::AsRawHandle, ffi::OsStrExt}, path::Path};
use sha2::{Digest, Sha256};
use windows::Win32::{Foundation::HANDLE, Storage::FileSystem::*};
use crate::registry::Registered;

pub fn handle(file: &File) -> HANDLE { HANDLE(file.as_raw_handle()) }
pub fn digest(file: &mut File) -> Result<[u8; 32], String> {
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new(); let mut buffer = [0u8; 65536];
    loop { let n = file.read(&mut buffer).map_err(|e| e.to_string())?; if n == 0 { break; } hash.update(&buffer[..n]); }
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    Ok(hash.finalize().into())
}
pub fn identity(file: &File) -> Result<(u32, u64), String> {
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    unsafe { GetFileInformationByHandle(handle(file), &mut info) }.map_err(|e| e.to_string())?;
    Ok((info.dwVolumeSerialNumber, ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64))
}
pub fn open_source(source: &Registered, for_recycle: bool) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.read(true).custom_flags(FILE_FLAG_OPEN_REPARSE_POINT.0);
    // Recycling must let the Shell open DELETE access; writes remain denied.
    if for_recycle { options.share_mode(FILE_SHARE_READ.0 | FILE_SHARE_DELETE.0); }
    else { options.access_mode(0x80000000 | DELETE.0).share_mode(FILE_SHARE_READ.0); }
    let mut file = options.open(&source.path).map_err(|e| format!("无法锁定原文件（被占用或无权限）：{e}"))?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0 { return Err("不整理目录或链接文件".into()); }
    if meta.len() != source.size || meta.modified().ok() != Some(source.modified) || Some(digest(&mut file)?) != source.digest {
        return Err("原文件自预览后已变化，未执行；请重新导入".into());
    }
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    unsafe { GetFileInformationByHandle(handle(&file), &mut info) }.map_err(|e| e.to_string())?;
    if info.nNumberOfLinks > 1 { return Err("为避免影响其他硬链接，暂不整理此文件".into()); }
    Ok(file)
}
pub fn open_directory(path: &Path) -> Result<File, String> {
    let file = OpenOptions::new().access_mode(FILE_READ_ATTRIBUTES.0)
        .share_mode(FILE_SHARE_READ.0 | FILE_SHARE_WRITE.0)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS.0 | FILE_FLAG_OPEN_REPARSE_POINT.0).open(path)
        .map_err(|e| format!("目标目录不可用：{e}"))?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_dir() || meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0 { return Err("目标必须是已选择的普通目录".into()); }
    Ok(file)
}
pub fn rename_no_replace(file: &File, directory: &File, name: &std::ffi::OsStr) -> windows::core::Result<()> {
    let mut parent = vec![0u16; 32768];
    let count = unsafe { GetFinalPathNameByHandleW(handle(directory), &mut parent, FILE_NAME_NORMALIZED) };
    if count == 0 || count as usize >= parent.len() { return Err(windows::core::Error::from_win32()); }
    parent.truncate(count as usize);
    if parent.last() != Some(&(b'\\' as u16)) { parent.push(b'\\' as u16); }
    parent.extend(name.encode_wide());
    let chars = parent;
    let offset = std::mem::offset_of!(FILE_RENAME_INFO, FileName);
    let size = offset + (chars.len() + 1) * 2;
    // u64 allocation keeps the variable-size Windows struct aligned on x64.
    let mut storage = vec![0u64; size.div_ceil(8)];
    unsafe {
        let info = storage.as_mut_ptr().cast::<FILE_RENAME_INFO>();
        (*info).Anonymous.ReplaceIfExists = false;
        (*info).RootDirectory = HANDLE::default();
        (*info).FileNameLength = (chars.len() * 2) as u32;
        std::ptr::copy_nonoverlapping(chars.as_ptr(), (info.cast::<u8>()).add(offset).cast::<u16>(), chars.len());
        SetFileInformationByHandle(handle(file), FileRenameInfo, info.cast(), size as u32)
    }
}
// Only used after a verified destination commit, or to remove our own incomplete temporary copy.
pub fn dispose_handle(file: &File) -> Result<(), String> {
    let info = FILE_DISPOSITION_INFO { DeleteFile: true };
    unsafe { SetFileInformationByHandle(handle(file), FileDispositionInfo, (&info as *const FILE_DISPOSITION_INFO).cast(), std::mem::size_of_val(&info) as u32) }.map_err(|e| e.to_string())
}
pub fn create_temp(path: &Path) -> Result<File, String> {
    OpenOptions::new().read(true).write(true).create_new(true).access_mode(0x80000000 | 0x40000000 | DELETE.0)
        .share_mode(0).open(path).map_err(|e| format!("无法创建临时目标（检查权限与空间）：{e}"))
}
