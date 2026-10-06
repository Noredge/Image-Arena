#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod registry;
mod file_io;
mod recycle;
mod organize;
mod preferences;
use registry::{ImportBatch, Registry};
use std::{fs::OpenOptions, io::Write, sync::{Mutex, atomic::{AtomicBool, Ordering}}};
use tauri::{Emitter, Manager, State};

struct DesktopState {
    registry: Mutex<Registry>,
    dropped: Mutex<Vec<ImportBatch>>,
    import_enabled: AtomicBool,
    dialog_busy: AtomicBool,
    organizer: Mutex<organize::Organizer>,
    operation_busy: AtomicBool,
    cancel_operation: AtomicBool,
}
impl Default for DesktopState {
    fn default() -> Self { Self {
        registry: Mutex::default(), dropped: Mutex::default(),
        import_enabled: AtomicBool::new(true), dialog_busy: AtomicBool::new(false),
        organizer: Mutex::default(), operation_busy: AtomicBool::new(false), cancel_operation: AtomicBool::new(false),
    } }
}
struct DialogGuard<'a>(&'a AtomicBool);
fn dialog_text<'a>(language: &Option<String>, chinese: &'a str, english: &'a str) -> &'a str {
    if language.as_deref() == Some("en") { english } else { chinese }
}
impl Drop for DialogGuard<'_> { fn drop(&mut self) { self.0.store(false, Ordering::SeqCst); } }
fn dialog_lock(state: &DesktopState) -> Result<DialogGuard<'_>, String> {
    state.dialog_busy.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).map_err(|_| "请先完成当前文件对话框")?;
    Ok(DialogGuard(&state.dialog_busy))
}

#[tauri::command]
async fn pick_images(window: tauri::WebviewWindow, state: State<'_, DesktopState>, language: Option<String>) -> Result<ImportBatch, String> {
    if !state.import_enabled.load(Ordering::SeqCst) { return Err("请返回准备区后导入图片".into()); }
    let _guard = dialog_lock(&state)?;
    let chosen = rfd::AsyncFileDialog::new().set_parent(&window).set_title(dialog_text(&language, "请选手入场", "Choose your images"))
        .add_filter(dialog_text(&language, "静态图片", "Static images"), &["png", "jpg", "jpeg", "webp"]).pick_files().await;
    if !state.import_enabled.load(Ordering::SeqCst) { return Ok(ImportBatch::default()); }
    Ok(state.registry.lock().map_err(|_| "图片登记失败")?.register(
        chosen.unwrap_or_default().into_iter().map(|f| f.path().to_owned()).collect(),
    ))
}
#[tauri::command]
fn take_dropped_images(state: State<'_, DesktopState>) -> Result<Vec<ImportBatch>, String> {
    Ok(std::mem::take(&mut *state.dropped.lock().map_err(|_| "无法读取拖入图片")?))
}
#[tauri::command]
async fn read_image_chunk(id: String, offset: u64, app: tauri::AppHandle) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DesktopState>();
        let bytes = state.registry.lock().map_err(|_| "Image registry unavailable")?.read_chunk(&id, offset)?;
        Ok(tauri::ipc::Response::new(bytes))
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn read_image(id: String, state: State<'_, DesktopState>) -> Result<tauri::ipc::Response, String> {
    Ok(tauri::ipc::Response::new(state.registry.lock().map_err(|_| "图片读取失败")?.read(&id)?))
}
#[tauri::command]
fn release_images(ids: Vec<String>, state: State<'_, DesktopState>) -> Result<(), String> {
    state.registry.lock().map_err(|_| "无法释放图片登记")?.release(&ids); Ok(())
}
#[tauri::command]
fn set_import_enabled(enabled: bool, state: State<'_, DesktopState>) { state.import_enabled.store(enabled, Ordering::SeqCst); }
#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    if text.len() > 1024 * 1024 { return Err("名单过长，无法复制".into()); }
    arboard::Clipboard::new().and_then(|mut c| c.set_text(text)).map_err(|_| "剪贴板暂时不可用，请重试".into())
}
#[tauri::command]
async fn save_record(content: String, filename: String, window: tauri::WebviewWindow, state: State<'_, DesktopState>, language: Option<String>) -> Result<bool, String> {
    if content.len() > 8 * 1024 * 1024 { return Err("记录过大，无法保存".into()); }
    serde_json::from_str::<serde_json::Value>(&content).map_err(|_| "记录格式无效")?;
    let _guard = dialog_lock(&state)?;
    let safe_name: String = filename.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '.').take(100).collect();
    let chosen = rfd::AsyncFileDialog::new().set_parent(&window).set_title(dialog_text(&language, "保存本轮对局记录", "Save this round's record"))
        .set_file_name(if safe_name.ends_with(".json") { &safe_name } else { "image-arena.json" })
        .add_filter(dialog_text(&language, "JSON 记录", "JSON record"), &["json"]).save_file().await;
    let Some(file) = chosen else { return Ok(false) };
    // Never overwrite any existing file, including a selected source image.
    let mut out = OpenOptions::new().write(true).create_new(true).open(file.path())
        .map_err(|e| if e.kind() == std::io::ErrorKind::AlreadyExists { "文件已存在，请换一个名称保存" } else { "无法创建结果文件，请检查目录权限" })?;
    out.write_all(content.as_bytes()).and_then(|_| out.sync_all()).map_err(|_| "结果未完整写入，请检查可用空间后另存")?;
    Ok(true)
}
#[tauri::command]
fn close_app(window: tauri::WebviewWindow, state: State<'_, DesktopState>) -> Result<(), String> {
    if state.operation_busy.load(Ordering::SeqCst) { return Err("正在处理文件，请先停止并等待当前文件完成".into()); }
    window.destroy().map_err(|_| "无法关闭窗口".into())
}

#[tauri::command]
async fn pick_destination(group: preferences::Group, window: tauri::WebviewWindow, app: tauri::AppHandle, state: State<'_, DesktopState>, language: Option<String>) -> Result<Option<organize::Destination>, String> {
    if state.operation_busy.load(Ordering::SeqCst) { return Err("请等待当前文件处理完成".into()); }
    let _guard = dialog_lock(&state)?;
    let file = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("destinations.json");
    let mut saved = preferences::Destinations::load(&file).unwrap_or_default();
    let mut picker = rfd::AsyncFileDialog::new().set_parent(&window).set_title(dialog_text(&language, "选择图片整理目标目录", "Choose a destination folder"));
    if let Some(previous) = saved.get(group).filter(|d| d.path.is_dir()) { picker = picker.set_directory(&previous.path); }
    let Some(chosen) = picker.pick_folder().await else { return Ok(None) };
    let mut organizer = state.organizer.lock().map_err(|_| "整理状态不可用".to_string())?;
    let destination = organizer.grant(chosen.path().into())?;
    saved.set(group, organizer.saved_destination(&destination.id)?);
    saved.save(&file)?;
    Ok(Some(destination))
}
#[derive(serde::Serialize)]
struct RememberedDestinations { selected: Option<organize::Destination>, rejected: Option<organize::Destination>, warnings: Vec<String> }
#[tauri::command]
fn remembered_destinations(app: tauri::AppHandle, state: State<'_, DesktopState>) -> Result<RememberedDestinations, String> {
    if state.operation_busy.load(Ordering::SeqCst) { return Err("请等待当前文件处理完成".into()); }
    let file = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("destinations.json");
    let mut result = RememberedDestinations { selected: None, rejected: None, warnings: vec![] };
    let saved = match preferences::Destinations::load(&file) {
        Ok(saved) => saved, Err(error) => { result.warnings.push(error); return Ok(result); }
    };
    let mut organizer = state.organizer.lock().map_err(|_| "整理状态不可用")?;
    for (previous, slot, label) in [(saved.selected, &mut result.selected, "入选"), (saved.rejected, &mut result.rejected, "未入选")] {
        if let Some(previous) = previous {
            match organizer.restore_destination(&previous) {
                Ok(dir) => *slot = Some(dir),
                Err(_) => result.warnings.push(format!("上次{label}目标目录 {} 不存在、不可访问或已被替换，请重新选择。", previous.path.display())),
            }
        }
    }
    Ok(result)
}
#[tauri::command]
async fn prepare_organization(request: organize::Request, app: tauri::AppHandle) -> Result<organize::Plan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DesktopState>();
        if state.operation_busy.load(Ordering::SeqCst) { return Err("正在执行，请等待完成".into()); }
        let registry = state.registry.lock().map_err(|_| "图片登记不可用")?;
        let result = state.organizer.lock().map_err(|_| "整理状态不可用")?.prepare(&registry, request);
        result
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn discard_organization(id: String, state: State<'_, DesktopState>) -> Result<(), String> {
    if state.operation_busy.load(Ordering::SeqCst) { return Err("正在执行，请先停止".into()); }
    state.organizer.lock().map_err(|_| "整理状态不可用")?.discard(&id); Ok(())
}
#[tauri::command]
fn cancel_organization(state: State<'_, DesktopState>) { state.cancel_operation.store(true, Ordering::SeqCst); }
#[tauri::command]
async fn open_operation_records(app: tauri::AppHandle) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{core::PCWSTR, Win32::{System::Com::*, UI::{Shell::*, WindowsAndMessaging::SW_SHOWNORMAL}}};
    let directory = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("operation-records");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    // Packaged launchers can virtualize AppData. Explorer needs the physical
    // directory, not the caller's redirected alias. Shell wants a DOS path.
    let physical = directory.canonicalize().map_err(|e| e.to_string())?;
    let directory = std::path::PathBuf::from(physical.to_string_lossy().trim_start_matches(r"\\?\"));
    tauri::async_runtime::spawn_blocking(move || std::thread::spawn(move || {
        // Shell extensions require an initialized STA; wait for the Shell handoff
        // before releasing the thread and path buffer.
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) }.ok().map_err(|e| e.to_string())?;
        struct ComGuard; impl Drop for ComGuard { fn drop(&mut self) { unsafe { CoUninitialize() } } }
        let _guard = ComGuard;
        let path: Vec<u16> = directory.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
            lpVerb: windows::core::w!("open"), lpFile: PCWSTR(path.as_ptr()), nShow: SW_SHOWNORMAL.0,
            ..Default::default()
        };
        unsafe { ShellExecuteExW(&mut info) }.map_err(|e| format!("无法打开记录目录，可按上方路径手动打开：{e}"))
    }).join().map_err(|_| "打开记录目录的线程异常".to_string())?).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn execute_organization(id: String, retry: bool, recycle_confirmed: bool, app: tauri::AppHandle) -> Result<organize::Plan, String> {
    let state = app.state::<DesktopState>();
    if state.dialog_busy.load(Ordering::SeqCst) { return Err("请先完成当前文件对话框".into()); }
    state.operation_busy.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).map_err(|_| "正在执行，请勿重复点击")?;
    state.cancel_operation.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DesktopState>(); let _guard = DialogGuard(&state.operation_busy);
        let log_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("operation-records");
        let mut registry = state.registry.lock().map_err(|_| "图片登记不可用")?;
        let result = state.organizer.lock().map_err(|_| "整理状态不可用")?.execute(&id, retry, recycle_confirmed, &mut registry, &log_dir, &state.cancel_operation,
            |plan| { let _ = app.emit_to("main", "arena-organization-progress", plan); });
        result
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<preferences::UiSettings, String> {
    let file=app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("settings.json");
    Ok(preferences::load_ui(&file))
}
#[tauri::command]
fn save_settings(app: tauri::AppHandle, values: serde_json::Value) -> Result<(), String> {
    let file=app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("settings.json");
    preferences::save_ui(&file,values)
}
#[tauri::command]
fn set_ui_language(window: tauri::WebviewWindow, language: String) -> Result<(), String> {
    window.set_title(if language == "en" { "Image Arena" } else { "选图擂台 · Image Arena" }).map_err(|e| e.to_string())
}
#[cfg(test)]
mod localization_tests {
    use super::dialog_text;
    #[test]
    fn native_dialog_labels_use_explicit_language_and_default_to_chinese() {
        assert_eq!(dialog_text(&None, "静态图片", "Static images"), "静态图片");
        assert_eq!(dialog_text(&Some("zh".into()), "保存本轮对局记录", "Save this round's record"), "保存本轮对局记录");
        assert_eq!(dialog_text(&Some("en".into()), "选择图片整理目标目录", "Choose a destination folder"), "Choose a destination folder");
    }
}
fn main() {
    tauri::Builder::default().manage(DesktopState::default())
        .invoke_handler(tauri::generate_handler![set_ui_language, read_image_chunk, load_settings, save_settings, pick_images, take_dropped_images, read_image, release_images, set_import_enabled, copy_text, save_record, close_app, pick_destination, remembered_destinations, prepare_organization, execute_organization, discard_organization, cancel_organization, open_operation_records])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let app = window.app_handle().clone();
                let paths = paths.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    let state = app.state::<DesktopState>();
                    if !state.import_enabled.load(Ordering::SeqCst) || state.dialog_busy.load(Ordering::SeqCst) { return; }
                    let Ok(mut registry) = state.registry.lock() else { return };
                    let batch = registry.register(paths);
                    if let Ok(mut dropped) = state.dropped.lock() { dropped.push(batch); }
                    let _ = app.emit_to("main", "arena-images-dropped", ());
                });
            }
        })
        .run(tauri::generate_context!()).expect("无法启动选图擂台");
}
