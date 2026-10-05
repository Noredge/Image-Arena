use std::{collections::{HashMap, HashSet}, fs::{File, OpenOptions}, io::Write, path::{Path, PathBuf}, sync::atomic::{AtomicBool, Ordering}};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::{file_io, recycle, registry::{Registered, Registry}};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Action { Keep, Move, Recycle }
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Choice { pub action: Action, pub destination_id: Option<String> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request { pub selected_ids: Vec<String>, pub rejected_ids: Vec<String>, pub selected: Choice, pub rejected: Choice, pub conflict: String }
#[derive(Clone, Serialize)]
pub struct Destination { pub id: String, pub path: String }
#[derive(Clone)]
struct Grant { path: PathBuf, identity: (u32, u64) }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub operation_id: String, pub image_ids: Vec<String>, pub name: String, pub group: String,
    pub action: Action, pub source: String, pub target: Option<String>, pub status: String, pub note: String,
    #[serde(skip)] original: Registered, #[serde(skip)] destination: Option<Grant>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan { pub id: String, pub entries: Vec<Entry>, pub started: bool, pub finished: bool, pub journal_path: Option<String>, pub notice: String }
#[derive(Default)]
pub struct Organizer { destinations: HashMap<String, Grant>, current: Option<Plan>, retired_ids: HashSet<String> }

fn shown(path: &Path) -> String { path.to_string_lossy().trim_start_matches(r"\\?\").to_owned() }
fn path_key(path: &Path) -> String { path.to_string_lossy().to_lowercase() }
impl Organizer {
    // Paths come from the native picker or identity-checked native preferences, never IPC text.
    pub fn grant(&mut self, path: PathBuf) -> Result<Destination, String> {
        self.grant_checked(path, None)
    }
    pub fn saved_destination(&self, id: &str) -> Result<crate::preferences::SavedDestination, String> {
        let grant = self.destinations.get(id).ok_or("目标目录登记失效")?;
        Ok(crate::preferences::SavedDestination { path: grant.path.clone(), identity: grant.identity })
    }
    pub fn restore_destination(&mut self, saved: &crate::preferences::SavedDestination) -> Result<Destination, String> {
        self.grant_checked(saved.path.clone(), Some(saved.identity))
    }
    fn grant_checked(&mut self, path: PathBuf, expected: Option<(u32, u64)>) -> Result<Destination, String> {
        let path = path.canonicalize().map_err(|e| e.to_string())?;
        let dir = file_io::open_directory(&path)?;
        let grant = Grant { path: path.clone(), identity: file_io::identity(&dir)? };
        if expected.is_some_and(|id| id != grant.identity) { return Err("目录身份已改变，请重新选择".into()); }
        if let Some((id, _)) = self.destinations.iter().find(|(_, old)| old.path == grant.path && old.identity == grant.identity) {
            return Ok(Destination { id: id.clone(), path: shown(&path) });
        }
        if self.destinations.len() >= 32 { self.destinations.clear(); }
        let id = Uuid::new_v4().to_string(); self.destinations.insert(id.clone(), grant);
        Ok(Destination { id, path: shown(&path) })
    }
    pub fn prepare(&mut self, registry: &Registry, request: Request) -> Result<Plan, String> {
        if request.selected.action == Action::Recycle { return Err("入选图片不能送入回收站".into()); }
        if !["rename", "skip"].contains(&request.conflict.as_str()) { return Err("未知的同名处理方式".into()); }
        let all: Vec<_> = request.selected_ids.iter().chain(request.rejected_ids.iter()).collect();
        if all.is_empty() || all.len() > 256 || all.iter().copied().collect::<HashSet<_>>().len() != all.len() { return Err("本轮图片名单无效".into()); }
        if all.iter().any(|id| self.retired_ids.contains(*id)) { return Err("本轮已有文件执行记录，请查看记录或只重试失败项".into()); }
        let mut entries: Vec<Entry> = Vec::new(); let mut sources = HashMap::<String, usize>::new(); let mut targets = HashSet::new();
        for (ids, choice, group) in [(&request.selected_ids, &request.selected, "入选"), (&request.rejected_ids, &request.rejected, "未入选")] {
            let destination = if choice.action == Action::Move {
                Some(self.destinations.get(choice.destination_id.as_deref().unwrap_or("")).ok_or("请先用系统窗口选择目标目录")?.clone())
            } else { None };
            for id in ids {
                let original = registry.source(id)?; let key = path_key(&original.path);
                if let Some(index) = sources.get(&key) {
                    let previous = &mut entries[*index];
                    let same_destination = previous.destination.as_ref().map(|d| &d.path) == destination.as_ref().map(|d| &d.path);
                    if previous.action != choice.action || !same_destination { return Err(format!("同一原文件重复参赛，但处理方式不同：{}。请取消整理并使用一致的处理方式。", previous.name)); }
                    previous.image_ids.push(id.clone()); previous.note = "同一原文件重复参赛，合并执行一次".into(); continue;
                }
                let name = original.path.file_name().ok_or("原文件名无效")?.to_string_lossy().into_owned();
                let mut entry = Entry { operation_id: Uuid::new_v4().to_string(), image_ids: vec![id.clone()], name, group: group.into(), action: choice.action.clone(), source: shown(&original.path), target: None, status: "ready".into(), note: String::new(), original, destination: destination.clone() };
                if entry.action == Action::Keep { entry.status = "kept".into(); entry.note = "保持原位".into(); }
                else if let Err(error) = file_io::open_source(&entry.original, entry.action == Action::Recycle) { entry.status = "failed".into(); entry.note = error; }
                if let Some(dest) = &entry.destination {
                    let desired = dest.path.join(&entry.name);
                    if path_key(&desired) == key { entry.status = "noop".into(); entry.note = "来源与目标相同，无需移动".into(); entry.target = Some(shown(&desired)); }
                    else {
                        let mut target = desired.clone(); let mut suffix = 1u32;
                        while target.try_exists().map_err(|e| e.to_string())? || targets.contains(&path_key(&target)) {
                            if request.conflict == "skip" { entry.status = "skipped".into(); entry.note = "目标同名，按设置跳过".into(); break; }
                            let stem = desired.file_stem().unwrap_or_default().to_string_lossy();
                            let ext = desired.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
                            target = dest.path.join(format!("{stem} ({suffix}){ext}")); suffix += 1;
                            if suffix > 10000 { return Err("目标同名文件过多，请更换目录".into()); }
                        }
                        if target != desired {
                            if !entry.note.is_empty() { entry.note.push_str("；"); }
                            entry.note.push_str("目标同名，将使用括号序号；不覆盖");
                        }
                        targets.insert(path_key(&target)); entry.target = Some(shown(&target));
                    }
                }
                sources.insert(key, entries.len()); entries.push(entry);
            }
        }
        let plan = Plan { id: Uuid::new_v4().to_string(), entries, started: false, finished: false, journal_path: None, notice: "这只是预览，原文件尚未改变。".into() };
        self.current = Some(plan.clone()); Ok(plan)
    }
    pub fn discard(&mut self, id: &str) { if self.current.as_ref().is_some_and(|p| p.id == id && !p.started) { self.current = None; } }
    pub fn execute(&mut self, id: &str, retry: bool, recycle_confirmed: bool, registry: &mut Registry, log_dir: &Path, cancel: &AtomicBool, mut progress: impl FnMut(&Plan)) -> Result<Plan, String> {
        let plan = self.current.as_mut().filter(|p| p.id == id).ok_or("整理预览已过期，请重新生成")?;
        if plan.started && !retry { return Ok(plan.clone()); } // A repeated call never re-executes.
        if !plan.started && retry { return Err("尚未执行，不能重试".into()); }
        let eligible = |entry: &Entry| if retry { ["failed", "cancelled"].contains(&entry.status.as_str()) } else { entry.status == "ready" };
        if plan.entries.iter().any(|e| eligible(e) && e.action == Action::Recycle) && !recycle_confirmed { return Err("请额外确认：未入选文件将送入 Windows 回收站".into()); }
        std::fs::create_dir_all(log_dir).map_err(|e| format!("无法保存执行日志，未操作文件：{e}"))?;
        // Record the actual path when a packaged parent redirects AppData.
        let log_dir = log_dir.canonicalize().map_err(|e| format!("无法定位执行日志，未操作文件：{e}"))?;
        let log_path = log_dir.join(format!("arena-{}.jsonl", plan.id));
        let mut journal = OpenOptions::new().append(true).create(true).open(&log_path).map_err(|e| format!("无法打开执行日志，未操作文件：{e}"))?;
        append(&mut journal, &serde_json::json!({"event":"plan", "retry":retry, "plan":plan}))?;
        plan.started = true; plan.finished = false; plan.journal_path = Some(shown(&log_path));
        for entry in &plan.entries { self.retired_ids.extend(entry.image_ids.clone()); }
        progress(plan);
        for index in 0..plan.entries.len() {
            if !eligible(&plan.entries[index]) { continue; }
            if cancel.load(Ordering::SeqCst) { plan.entries[index].status = "cancelled".into(); plan.entries[index].note = "已停止，尚未操作此文件".into(); continue; }
            // Write-ahead record is flushed before the first mutation of each file.
            if let Err(error) = append(&mut journal, &serde_json::json!({"event":"begin", "entry":plan.entries[index]})) {
                plan.notice = error; cancel.store(true, Ordering::SeqCst); plan.entries[index].status = "cancelled".into(); continue;
            }
            let entry = &mut plan.entries[index];
            let outcome = perform(entry, &mut journal);
            match outcome {
                Ok((status, note)) => {
                    entry.status = status.into(); entry.note = note;
                    if status == "moved" { registry.relocated(&entry.original.path, entry.target.as_deref().map(Path::new)); }
                    if status == "recycled" { registry.relocated(&entry.original.path, None); }
                }
                Err(error) => { entry.status = "failed".into(); entry.note = error; }
            }
            if let Err(error) = append(&mut journal, &serde_json::json!({"event":"end", "entry":entry})) { plan.notice = error; cancel.store(true, Ordering::SeqCst); }
            progress(plan);
        }
        plan.finished = true;
        if plan.notice == "这只是预览，原文件尚未改变。" { plan.notice = "已逐项记录。比赛撤销不会撤销磁盘操作；失败或停止项可单独重试。".into(); }
        if let Err(error) = append(&mut journal, &serde_json::json!({"event":"finished", "plan":plan})) { plan.notice = error; }
        progress(plan); Ok(plan.clone())
    }
}
fn append(file: &mut File, event: &serde_json::Value) -> Result<(), String> {
    let mut event = event.clone();
    event["timeUnixMs"] = serde_json::json!(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let mut data = serde_json::to_vec(&event).map_err(|e| e.to_string())?; data.push(b'\n');
    file.write_all(&data).and_then(|_| file.sync_all()).map_err(|e| format!("执行日志无法完整保存，已停止后续操作；请保留当前记录：{e}"))
}
fn perform(entry: &Entry, journal: &mut File) -> Result<(&'static str, String), String> {
    let source = file_io::open_source(&entry.original, entry.action == Action::Recycle)?;
    if entry.action == Action::Recycle {
        let outcome = recycle::recycle(&entry.original.path, &source); drop(source);
        // Uncertain Shell outcomes are never automatically retried.
        return match outcome {
            Ok(()) => Ok(("recycled", "已送入 Windows 回收站；可在系统回收站恢复".into())),
            Err(e) if !entry.original.path.exists() => Ok(("review", format!("{e}。源位置已不可见，请检查回收站；不自动重试。"))),
            Err(e) => Err(e),
        };
    }
    let dest = entry.destination.as_ref().ok_or("没有目标目录授权")?;
    let directory = file_io::open_directory(&dest.path)?;
    if file_io::identity(&directory)? != dest.identity { return Err("目标目录已被替换，请重新选择".into()); }
    let target = PathBuf::from(entry.target.as_ref().ok_or("没有目标文件名")?);
    let name = target.file_name().ok_or("目标文件名无效")?;
    match file_io::rename_no_replace(&source, &directory, name) {
        Ok(()) => return Ok(("moved", "已移动，原始字节保留".into())),
        Err(error) if error.code().0 as u32 != 0x80070011 => return Err(format!("未移动（目标已存在、被占用或无权限）：{error}")),
        Err(_) => {}, // ERROR_NOT_SAME_DEVICE: verified copy, commit, then delete original handle.
    }
    copy_across_volumes(entry, journal, source, directory)
}
#[cfg(test)]
thread_local! { static COPY_FAULT: std::cell::Cell<u8> = const { std::cell::Cell::new(0) }; }
fn copy_checkpoint(phase: u8) -> Result<(), String> {
    #[cfg(test)]
    if COPY_FAULT.with(|f| f.get()) == phase {
        return Err(std::io::Error::from_raw_os_error(if phase == 1 { 112 } else { 5 }).to_string());
    }
    let _ = phase; Ok(())
}
fn copy_across_volumes(entry: &Entry, journal: &mut File, mut source: File, directory: File) -> Result<(&'static str, String), String> {
    let dest = entry.destination.as_ref().ok_or("没有目标目录授权")?;
    let target = PathBuf::from(entry.target.as_ref().ok_or("没有目标文件名")?);
    let name = target.file_name().ok_or("目标文件名无效")?;
    let temp_path = dest.path.join(format!(".image-arena-{}.part", entry.operation_id));
    append(journal, &serde_json::json!({"event":"copy-start", "operationId":entry.operation_id, "temporaryPath":shown(&temp_path)}))?;
    let mut temporary = file_io::create_temp(&temp_path)?;
    let copied = (|| -> Result<(), String> {
        std::io::copy(&mut source, &mut temporary).map_err(|e| format!("复制失败，原文件保留：{e}"))?;
        copy_checkpoint(1).map_err(|e| format!("写入失败，原文件保留：{e}"))?;
        temporary.sync_all().map_err(|e| format!("写入未完成，原文件保留：{e}"))?;
        if Some(file_io::digest(&mut temporary)?) != entry.original.digest || Some(file_io::digest(&mut source)?) != entry.original.digest { return Err("复制校验失败，原文件保留".into()); }
        // Preserve file timestamps in addition to all embedded image bytes.
        let meta = source.metadata().map_err(|e| e.to_string())?;
        let mut times = std::fs::FileTimes::new().set_modified(entry.original.modified);
        if let Ok(created) = meta.created() { use std::os::windows::fs::FileTimesExt; times = times.set_created(created); }
        temporary.set_times(times).map_err(|e| e.to_string())?;
        file_io::rename_no_replace(&temporary, &directory, name).map_err(|e| format!("目标提交失败，原文件保留：{e}"))?;
        Ok(())
    })();
    if let Err(error) = copied {
        let cleanup = file_io::dispose_handle(&temporary);
        return Err(if let Err(e) = cleanup { format!("{error}；临时副本保留于 {}：{e}", shown(&temp_path)) } else { error });
    }
    if let Err(error) = append(journal, &serde_json::json!({"event":"copy-committed", "operationId":entry.operation_id, "target":entry.target})) {
        return Ok(("copied", format!("目标已复制并校验，原文件仍保留。{error}；请人工核对，不自动重试。")));
    }
    if let Err(error) = copy_checkpoint(2).and_then(|_| file_io::dispose_handle(&source)) {
        return Ok(("copied", format!("目标已复制并校验，原文件未移除：{error}。不自动重试。")));
    }
    drop(source); drop(temporary);
    Ok(("moved", "跨盘复制、落盘与 SHA-256 校验完成后移除原文件".into()))
}

#[cfg(test)]
mod tests;
