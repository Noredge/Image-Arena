use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct SavedDestination { pub path: PathBuf, pub identity: (u32, u64) }
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Group { Selected, Rejected }
#[derive(Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Destinations { pub selected: Option<SavedDestination>, pub rejected: Option<SavedDestination> }
impl Destinations {
    pub fn get(&self, group: Group) -> Option<&SavedDestination> {
        match group { Group::Selected => self.selected.as_ref(), Group::Rejected => self.rejected.as_ref() }
    }
    pub fn set(&mut self, group: Group, value: SavedDestination) {
        match group { Group::Selected => self.selected = Some(value), Group::Rejected => self.rejected = Some(value) }
    }
    pub fn load(file: &Path) -> Result<Self, String> {
        match fs::metadata(file) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(_) => return Err("无法读取上次目标目录，请重新选择。".into()),
            Ok(meta) if meta.len() > 65536 => return Err("目标目录记忆文件异常，请重新选择。".into()),
            _ => {}
        }
        let bytes = fs::read(file).map_err(|_| "无法读取上次目标目录，请重新选择。")?;
        serde_json::from_slice(&bytes).map_err(|_| "目标目录记忆文件损坏，请重新选择。".into())
    }
    pub fn save(&self, file: &Path) -> Result<(), String> {
        let parent = file.parent().ok_or("目标记忆位置无效")?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let temporary = parent.join(format!("destinations-{}.tmp", uuid::Uuid::new_v4()));
        let write = || -> Result<(), String> {
            let bytes = serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?;
            let mut output = OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e| e.to_string())?;
            output.write_all(&bytes).and_then(|_| output.sync_all()).map_err(|e| e.to_string())?;
            drop(output);
            fs::rename(&temporary, file).map_err(|e| e.to_string())
        };
        let result = write();
        if result.is_err() { let _ = fs::remove_file(&temporary); }
        result.map_err(|e| format!("未能保存目标目录：{e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organize::Organizer;
    #[test]
    fn remembers_two_groups_across_restart_and_replaces_settings() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("settings/destinations.json");
        let a = root.path().join("入选" ); let b = root.path().join("其他");
        fs::create_dir(&a).unwrap(); fs::create_dir(&b).unwrap();
        let mut organizer = Organizer::default();
        let mut prefs = Destinations::load(&file).unwrap();
        for (group, path) in [(Group::Selected, a.clone()), (Group::Rejected, b.clone())] {
            let granted = organizer.grant(path).unwrap();
            prefs.set(group, organizer.saved_destination(&granted.id).unwrap()); prefs.save(&file).unwrap();
        }
        let loaded = Destinations::load(&file).unwrap();
        let mut restarted = Organizer::default();
        for group in [Group::Selected, Group::Rejected] {
            let saved = loaded.get(group).unwrap();
            let restored = restarted.restore_destination(saved).unwrap();
            assert_eq!(restarted.saved_destination(&restored.id).unwrap(), *saved);
        }
        assert_eq!(fs::read_dir(file.parent().unwrap()).unwrap().count(), 1);
    }
    #[test]
    fn missing_replaced_and_corrupt_destinations_never_restore() {
        let root = tempfile::tempdir().unwrap(); let target = root.path().join("target");
        fs::create_dir(&target).unwrap();
        let mut organizer = Organizer::default(); let granted = organizer.grant(target.clone()).unwrap();
        let saved = organizer.saved_destination(&granted.id).unwrap();
        fs::rename(&target, root.path().join("old-target")).unwrap();
        assert!(organizer.restore_destination(&saved).is_err());
        fs::create_dir(&target).unwrap();
        assert!(organizer.restore_destination(&saved).is_err());
        let file = root.path().join("destinations.json"); fs::write(&file, "broken").unwrap();
        assert!(Destinations::load(&file).is_err());
    }
}

#[derive(Serialize)]
pub struct UiSettings { pub values: Option<serde_json::Value>, pub warning: String }
pub fn load_ui(file: &Path) -> UiSettings {
    if !file.exists() { return UiSettings { values: None, warning: String::new() }; }
    let parsed = fs::metadata(file).ok().filter(|m| m.len() <= 65536)
        .and_then(|_| fs::read(file).ok()).and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        .filter(|v| v.get("version").and_then(|n| n.as_u64()) == Some(1) && v.get("values").is_some_and(|n| n.is_object()));
    match parsed { Some(v) => UiSettings { values: Some(v["values"].clone()), warning: String::new() }, None => {
        let backup = file.with_file_name(format!("settings-broken-{}.json", uuid::Uuid::new_v4()));
        let backed = fs::copy(file, backup).is_ok();
        UiSettings { values: Some(serde_json::json!({})), warning: if backed { "设置记录损坏，已备份并恢复默认设置。" } else { "无法读取设置，原记录保留，暂用默认设置。" }.into() }
    } }
}
pub fn save_ui(file: &Path, values: serde_json::Value) -> Result<(), String> {
    let obj=values.as_object().ok_or("设置格式错误")?;
    let allowed=["music","effects","volume","theme","motionPaused","mode","preferredK","linked","selectedAction","rejectedAction","conflict","showPreview"];
    if obj.keys().any(|k|!allowed.contains(&k.as_str())) {return Err("未知设置字段".into());}
    let bytes=serde_json::to_vec_pretty(&serde_json::json!({"version":1,"values":values})).map_err(|e|e.to_string())?;
    if bytes.len()>4096 {return Err("设置内容过大".into());}
    let parent=file.parent().ok_or("设置位置无效")?;fs::create_dir_all(parent).map_err(|e|e.to_string())?;
    let temp=parent.join(format!("settings-{}.tmp",uuid::Uuid::new_v4()));
    let result=(||->Result<(),String>{let mut f=OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e|e.to_string())?;f.write_all(&bytes).and_then(|_|f.sync_all()).map_err(|e|e.to_string())?;drop(f);fs::rename(&temp,file).map_err(|e|e.to_string())})();
    if result.is_err(){let _=fs::remove_file(&temp);}result
}
#[cfg(test)]
mod ui_tests {
 use super::*;
 #[test] fn settings_survive_relocation_and_preserve_corruption(){let temp=tempfile::tempdir().unwrap();let file=temp.path().join("settings.json");assert!(load_ui(&file).values.is_none());save_ui(&file,serde_json::json!({"music":true,"volume":0,"theme":"dark","rejectedAction":"recycle"})).unwrap();assert_eq!(load_ui(&file).values.unwrap()["volume"],0);save_ui(&file,serde_json::json!({"volume":33})).unwrap();assert_eq!(load_ui(&file).values.unwrap()["volume"],33);fs::write(&file,"broken").unwrap();assert!(!load_ui(&file).warning.is_empty());assert_eq!(fs::read_dir(temp.path()).unwrap().count(),2);assert!(save_ui(&file,serde_json::json!({"recycleConfirmed":true})).is_err());}
}
