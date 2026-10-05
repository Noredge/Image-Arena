use std::{fs::File, path::{Path, PathBuf}, sync::{Arc, Mutex}, os::windows::ffi::OsStrExt};
use windows::{core::{implement, Error, Ref, PCWSTR, HRESULT}, Win32::{Foundation::E_ABORT, System::Com::*, UI::Shell::*}};
use crate::file_io;

#[implement(IFileOperationProgressSink)]
struct RecycleSink { source: PathBuf, expected: (u32, u64), completed: Arc<Mutex<bool>> }
#[allow(non_snake_case)]
impl IFileOperationProgressSink_Impl for RecycleSink_Impl {
    fn PreDeleteItem(&self, flags: u32, _: Ref<'_, IShellItem>) -> windows::core::Result<()> {
        // Refuse any Shell attempt to fall back to permanent deletion.
        if flags & TSF_DELETE_RECYCLE_IF_POSSIBLE.0 as u32 == 0 { return Err(Error::from_hresult(E_ABORT)); }
        let same = File::open(&self.source).ok().and_then(|f| file_io::identity(&f).ok()) == Some(self.expected);
        if !same { return Err(Error::from_hresult(E_ABORT)); } Ok(())
    }
    fn PostDeleteItem(&self, _: u32, _: Ref<'_, IShellItem>, hr: HRESULT, _: Ref<'_, IShellItem>) -> windows::core::Result<()> {
        hr.ok()?; *self.completed.lock().unwrap() = true; Ok(())
    }
    fn StartOperations(&self) -> windows::core::Result<()> { Ok(()) }
    fn FinishOperations(&self, hr: HRESULT) -> windows::core::Result<()> { hr.ok() }
    fn PreRenameItem(&self, _: u32, _: Ref<'_, IShellItem>, _: &PCWSTR) -> windows::core::Result<()> { Err(Error::from_hresult(E_ABORT)) }
    fn PostRenameItem(&self, _: u32, _: Ref<'_, IShellItem>, _: &PCWSTR, _: HRESULT, _: Ref<'_, IShellItem>) -> windows::core::Result<()> { Ok(()) }
    fn PreMoveItem(&self, _: u32, _: Ref<'_, IShellItem>, _: Ref<'_, IShellItem>, _: &PCWSTR) -> windows::core::Result<()> { Err(Error::from_hresult(E_ABORT)) }
    fn PostMoveItem(&self, _: u32, _: Ref<'_, IShellItem>, _: Ref<'_, IShellItem>, _: &PCWSTR, _: HRESULT, _: Ref<'_, IShellItem>) -> windows::core::Result<()> { Ok(()) }
    fn PreCopyItem(&self, _: u32, _: Ref<'_, IShellItem>, _: Ref<'_, IShellItem>, _: &PCWSTR) -> windows::core::Result<()> { Err(Error::from_hresult(E_ABORT)) }
    fn PostCopyItem(&self, _: u32, _: Ref<'_, IShellItem>, _: Ref<'_, IShellItem>, _: &PCWSTR, _: HRESULT, _: Ref<'_, IShellItem>) -> windows::core::Result<()> { Ok(()) }
    fn PreNewItem(&self, _: u32, _: Ref<'_, IShellItem>, _: &PCWSTR) -> windows::core::Result<()> { Err(Error::from_hresult(E_ABORT)) }
    fn PostNewItem(&self, _: u32, _: Ref<'_, IShellItem>, _: &PCWSTR, _: &PCWSTR, _: u32, _: HRESULT, _: Ref<'_, IShellItem>) -> windows::core::Result<()> { Ok(()) }
    fn UpdateProgress(&self, _: u32, _: u32) -> windows::core::Result<()> { Ok(()) }
    fn ResetTimer(&self) -> windows::core::Result<()> { Ok(()) }
    fn PauseTimer(&self) -> windows::core::Result<()> { Ok(()) }
    fn ResumeTimer(&self) -> windows::core::Result<()> { Ok(()) }
}
pub fn recycle(path: &Path, locked: &File) -> Result<(), String> {
    let source = path.to_path_buf(); let expected = file_io::identity(locked)?;
    // COM objects never leave their dedicated STA thread.
    std::thread::spawn(move || -> Result<(), String> {
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.ok().map_err(|e| e.to_string())?;
        struct ComGuard; impl Drop for ComGuard { fn drop(&mut self) { unsafe { CoUninitialize() } } }
        let _guard = ComGuard;
        let run = || -> windows::core::Result<()> {
            // Shell namespace parsing expects a DOS path, not canonicalize's extended prefix.
            let shell_path = source.to_string_lossy();
            let shell_path = shell_path.strip_prefix(r"\\?\").unwrap_or(&shell_path);
            let text: Vec<u16> = std::ffi::OsStr::new(shell_path).encode_wide().chain(Some(0)).collect();
            let mut root = [0u16; 32768];
            unsafe { windows::Win32::Storage::FileSystem::GetVolumePathNameW(PCWSTR(text.as_ptr()), &mut root)?; }
            // Only local fixed disks with a usable Recycle Bin are supported.
            if unsafe { windows::Win32::Storage::FileSystem::GetDriveTypeW(PCWSTR(root.as_ptr())) } != 3 { return Err(Error::from_hresult(E_ABORT)); }
            let mut info = SHQUERYRBINFO { cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32, ..Default::default() };
            unsafe { SHQueryRecycleBinW(PCWSTR(root.as_ptr()), &mut info)?; }
            let completed = Arc::new(Mutex::new(false));
            let sink: IFileOperationProgressSink = RecycleSink { source: source.clone(), expected, completed: completed.clone() }.into();
            unsafe {
                let op: IFileOperation = CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER)?;
                op.SetOperationFlags(FOFX_RECYCLEONDELETE | FOFX_EARLYFAILURE | FOF_NOERRORUI | FOF_SILENT | FOF_NOCONFIRMATION | FOF_NO_CONNECTED_ELEMENTS)?;
                let item: IShellItem = SHCreateItemFromParsingName(PCWSTR(text.as_ptr()), None)?;
                op.DeleteItem(&item, &sink)?; op.PerformOperations()?;
                if op.GetAnyOperationsAborted()?.as_bool() || !*completed.lock().unwrap() { return Err(Error::from_hresult(E_ABORT)); }
            }
            Ok(())
        };
        run().map_err(|e| format!("未能确认送入回收站，未使用永久删除；请检查原文件与回收站：{e}"))
    }).join().map_err(|_| "回收站操作线程异常，请检查执行记录".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_permanent_delete_callback() {
        let sink = RecycleSink { source: PathBuf::from("missing"), expected: (0,0), completed: Arc::new(Mutex::new(false)) };
        let com: IFileOperationProgressSink = sink.into();
        assert!(unsafe { com.PreDeleteItem(0, None) }.is_err());
    }
}
