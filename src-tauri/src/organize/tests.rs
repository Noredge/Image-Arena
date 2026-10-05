use super::*;
use std::os::windows::fs::OpenOptionsExt;

fn load(registry: &mut Registry, path: &Path, bytes: &[u8]) -> String {
    std::fs::write(path, bytes).unwrap();
    let id = registry.register(vec![path.into()]).images[0].id.clone(); registry.read(&id).unwrap(); id
}
fn request(ids: Vec<String>, destination_id: Option<String>) -> Request {
    Request { selected_ids: ids, rejected_ids: vec![], selected: Choice { action: Action::Move, destination_id }, rejected: Choice { action: Action::Keep, destination_id: None }, conflict: "rename".into() }
}
fn execute(o: &mut Organizer, r: &mut Registry, p: &Plan, log: &Path, retry: bool) -> Plan {
    o.execute(&p.id, retry, true, r, log, &AtomicBool::new(false), |_| {}).unwrap()
}
#[test]
fn move_preserves_bytes_names_and_idempotency_with_chinese_conflict() {
    let dir = tempfile::tempdir().unwrap(); let dest = tempfile::tempdir().unwrap(); let log = tempfile::tempdir().unwrap();
    let mut r = Registry::default(); let mut o = Organizer::default(); let a = dir.path().join("中文 图片.png");
    let id = load(&mut r, &a, b"PNG original workflow and pixels");
    std::fs::write(dest.path().join("中文 图片.png"), b"existing").unwrap();
    let d = o.grant(dest.path().into()).unwrap(); let p = o.prepare(&r, request(vec![id.clone()], Some(d.id))).unwrap();
    assert!(p.entries[0].target.as_ref().unwrap().ends_with("中文 图片 (1).png")); assert!(a.exists());
    let out = execute(&mut o, &mut r, &p, log.path(), false);
    assert_eq!(out.entries[0].status, "moved", "{}", out.entries[0].note); assert!(!a.exists());
    assert_eq!(std::fs::read(dest.path().join("中文 图片 (1).png")).unwrap(), b"PNG original workflow and pixels");
    assert_eq!(std::fs::read(dest.path().join("中文 图片.png")).unwrap(), b"existing");
    assert_eq!(r.read(&id).unwrap(), b"PNG original workflow and pixels");
    assert_eq!(execute(&mut o, &mut r, &p, log.path(), false).entries[0].status, "moved");
    assert!(o.prepare(&r, request(vec![id], None)).is_err());
}
#[test]
fn same_directory_skip_conflict_and_discard_never_mutate() {
    let dir = tempfile::tempdir().unwrap(); let mut r = Registry::default(); let mut o = Organizer::default();
    let path = dir.path().join("one.png"); let id = load(&mut r, &path, b"original");
    let d = o.grant(dir.path().into()).unwrap(); let p = o.prepare(&r, request(vec![id.clone()], Some(d.id))).unwrap();
    assert_eq!(p.entries[0].status,"noop"); o.discard(&p.id); assert!(o.current.is_none()); assert!(path.exists());
    let dest = tempfile::tempdir().unwrap(); std::fs::write(dest.path().join("one.png"), b"other").unwrap();
    let d = o.grant(dest.path().into()).unwrap(); let mut req = request(vec![id], Some(d.id)); req.conflict = "skip".into();
    let p = o.prepare(&r, req).unwrap(); assert_eq!(p.entries[0].status,"skipped"); assert!(path.exists());
}
#[test]
fn invalid_ids_and_conflicting_duplicate_sources_are_rejected() {
    let dir = tempfile::tempdir().unwrap(); let mut r = Registry::default(); let mut o = Organizer::default();
    assert!(o.prepare(&r,request(vec!["C:\\arbitrary.png".into()],None)).is_err());
    let path = dir.path().join("a.png"); let a = load(&mut r,&path,b"x");
    let b = r.register(vec![path]).images[0].id.clone(); r.read(&b).unwrap();
    let mut req = request(vec![a.clone()], None); req.selected.action = Action::Keep;
    req.rejected_ids = vec![b.clone()]; req.rejected.action = Action::Recycle;
    assert!(o.prepare(&r,req).err().unwrap().contains("重复参赛"));
    let mut req = request(vec![a,b],None); req.selected.action = Action::Keep;
    assert_eq!(o.prepare(&r,req).unwrap().entries.len(),1);
}
#[test]
fn source_changes_and_target_races_preserve_files_and_retry_only_failure() {
    let dir = tempfile::tempdir().unwrap(); let dest = tempfile::tempdir().unwrap(); let log = tempfile::tempdir().unwrap();
    let mut r = Registry::default(); let mut o = Organizer::default();
    let a=dir.path().join("a.png"); let b=dir.path().join("b.png");
    let ids=vec![load(&mut r,&a,b"a"),load(&mut r,&b,b"b")]; let d=o.grant(dest.path().into()).unwrap();
    let p=o.prepare(&r,request(ids,Some(d.id))).unwrap();
    std::fs::write(dest.path().join("b.png"),b"racing target").unwrap();
    let out=execute(&mut o,&mut r,&p,log.path(),false);
    assert_eq!(out.entries[0].status,"moved", "{}", out.entries[0].note); assert_eq!(out.entries[1].status,"failed"); assert!(b.exists());
    std::fs::remove_file(dest.path().join("b.png")).unwrap(); // Only this test's own collision fixture.
    let out=execute(&mut o,&mut r,&p,log.path(),true); assert_eq!(out.entries[1].status,"moved");
    assert_eq!(std::fs::read_dir(dest.path()).unwrap().count(),2);
    let c=dir.path().join("changed.png"); let id=load(&mut r,&c,b"before"); let d=o.grant(dest.path().into()).unwrap();
    let p=o.prepare(&r,request(vec![id],Some(d.id))).unwrap();
    let times=std::fs::metadata(&c).unwrap().modified().unwrap();
    std::fs::write(&c,b"after!").unwrap(); File::options().write(true).open(&c).unwrap().set_times(std::fs::FileTimes::new().set_modified(times)).unwrap();
    let out=execute(&mut o,&mut r,&p,log.path(),false); assert_eq!(out.entries[0].status,"failed"); assert_eq!(std::fs::read(c).unwrap(),b"after!");
}
#[test]
fn locks_cancellation_and_unavailable_journal_prevent_mutation() {
    let dir=tempfile::tempdir().unwrap(); let dest=tempfile::tempdir().unwrap(); let mut r=Registry::default(); let mut o=Organizer::default();
    let path=dir.path().join("locked.png"); let id=load(&mut r,&path,b"bytes"); let d=o.grant(dest.path().into()).unwrap();
    let p=o.prepare(&r,request(vec![id],Some(d.id))).unwrap();
    let locked=OpenOptions::new().read(true).share_mode(0).open(&path).unwrap();
    let out=execute(&mut o,&mut r,&p,&dir.path().join("logs"),false); assert_eq!(out.entries[0].status,"failed"); drop(locked);
    let out=o.execute(&p.id,true,true,&mut r,&dir.path().join("logs"),&AtomicBool::new(true), |_|{}).unwrap();
    assert_eq!(out.entries[0].status,"cancelled"); assert!(path.exists());
    assert!(o.execute(&p.id,true,true,&mut r,&path,&AtomicBool::new(false), |_|{}).is_err()); assert!(path.exists());
}
#[test]
fn recycle_needs_explicit_second_confirmation() {
    let dir=tempfile::tempdir().unwrap(); let mut r=Registry::default(); let mut o=Organizer::default();
    let path=dir.path().join("stay.png"); let id=load(&mut r,&path,b"safe");
    let mut req=request(vec![],None); req.rejected_ids=vec![id]; req.selected.action=Action::Keep; req.rejected.action=Action::Recycle;
    let p=o.prepare(&r,req).unwrap();
    assert!(o.execute(&p.id,false,false,&mut r,&dir.path().join("logs"),&AtomicBool::new(false), |_|{}).is_err()); assert!(path.exists());
}
#[test]
#[ignore = "explicit disposable real Windows Recycle Bin test"]
fn real_recycle_disposable_sample() {
    let dir=tempfile::tempdir().unwrap(); let mut r=Registry::default(); let mut o=Organizer::default();
    let path=dir.path().join(format!("ImageArena-Disposable-{}.png",Uuid::new_v4())); let id=load(&mut r,&path,b"synthetic recycle acceptance");
    let mut req=request(vec![],None); req.rejected_ids=vec![id]; req.selected.action=Action::Keep; req.rejected.action=Action::Recycle;
    let p=o.prepare(&r,req).unwrap(); let out=execute(&mut o,&mut r,&p,&dir.path().join("logs"),false);
    println!("{}",serde_json::to_string(&out).unwrap()); assert_eq!(out.entries[0].status,"recycled"); assert!(!path.exists());
}

#[test]
fn replacing_destination_directory_rejects_old_grant() {
    let root=tempfile::tempdir().unwrap(); let dest=root.path().join("target"); std::fs::create_dir(&dest).unwrap();
    let mut r=Registry::default(); let mut o=Organizer::default();
    let path=root.path().join("a.png"); let id=load(&mut r,&path,b"keep me"); let d=o.grant(dest.clone()).unwrap();
    let p=o.prepare(&r,request(vec![id],Some(d.id))).unwrap();
    std::fs::rename(&dest,root.path().join("old-target")).unwrap(); std::fs::create_dir(&dest).unwrap();
    let out=execute(&mut o,&mut r,&p,&root.path().join("logs"),false);
    assert_eq!(out.entries[0].status,"failed"); assert!(out.entries[0].note.contains("替换")); assert_eq!(std::fs::read(path).unwrap(),b"keep me");
}
#[test]
fn injected_copy_disk_full_and_source_delete_denied_keep_original() {
    for phase in [1,2] {
        let root=tempfile::tempdir().unwrap(); let dest=tempfile::tempdir().unwrap();
        let mut r=Registry::default(); let mut o=Organizer::default();
        let path=root.path().join("metadata.png"); let bytes=b"pixel bytes plus embedded PNG workflow";
        let id=load(&mut r,&path,bytes); let d=o.grant(dest.path().into()).unwrap();
        let p=o.prepare(&r,request(vec![id],Some(d.id))).unwrap(); let entry=&p.entries[0];
        let source=file_io::open_source(&entry.original,false).unwrap(); let directory=file_io::open_directory(dest.path()).unwrap();
        let mut log=File::create(root.path().join("log.jsonl")).unwrap();
        COPY_FAULT.with(|f|f.set(phase));
        let result=copy_across_volumes(entry,&mut log,source,directory);
        COPY_FAULT.with(|f|f.set(0));
        assert_eq!(std::fs::read(&path).unwrap(),bytes);
        if phase==1 { assert!(result.is_err()); assert_eq!(std::fs::read_dir(dest.path()).unwrap().count(),0); }
        else { assert_eq!(result.unwrap().0,"copied"); assert_eq!(std::fs::read(dest.path().join("metadata.png")).unwrap(),bytes); }
    }
}

#[test]
#[ignore = "explicit ACL test on a disposable directory only"]
fn real_destination_permission_denied_preserves_source() {
    use std::process::Command;
    struct Restore(PathBuf);
    impl Drop for Restore { fn drop(&mut self) { let _=Command::new("icacls").arg(&self.0).args(["/remove:d","*S-1-1-0"]).output(); } }
    let root=tempfile::tempdir().unwrap(); let dest=tempfile::tempdir().unwrap();
    let mut r=Registry::default(); let mut o=Organizer::default(); let path=root.path().join("safe.png");
    let id=load(&mut r,&path,b"permission test only"); let d=o.grant(dest.path().into()).unwrap();
    let p=o.prepare(&r,request(vec![id],Some(d.id))).unwrap();
    let restore=Restore(dest.path().into());
    assert!(Command::new("icacls").arg(dest.path()).args(["/deny","*S-1-1-0:(WD)"]).output().unwrap().status.success());
    let out=execute(&mut o,&mut r,&p,&root.path().join("logs"),false);
    drop(restore);
    assert_eq!(out.entries[0].status,"failed"); assert!(out.entries[0].note.contains("0x80070005"),"{}",out.entries[0].note);
    assert_eq!(std::fs::read(path).unwrap(),b"permission test only"); assert!(!dest.path().join("safe.png").exists());
}
#[test]
#[ignore = "explicit cross-volume destination provided by test runner"]
fn real_cross_volume_copy_verify_remove() {
    let base=PathBuf::from(std::env::var("IMAGE_ARENA_CROSS_TEST_DIR").expect("explicit test directory required"));
    assert!(base.file_name().unwrap().to_string_lossy().starts_with("ImageArena-Test-"));
    let dest=tempfile::tempdir_in(base).unwrap(); let source=tempfile::tempdir().unwrap(); let log=tempfile::tempdir().unwrap();
    let mut r=Registry::default(); let mut o=Organizer::default(); let path=source.path().join("元数据 跨盘.png");
    let bytes=vec![123u8;1024*1024]; let id=load(&mut r,&path,&bytes); let d=o.grant(dest.path().into()).unwrap();
    let p=o.prepare(&r,request(vec![id],Some(d.id))).unwrap(); let out=execute(&mut o,&mut r,&p,log.path(),false);
    println!("{}",serde_json::to_string(&out).unwrap()); assert_eq!(out.entries[0].status,"moved", "{}", out.entries[0].note); assert!(out.entries[0].note.contains("跨盘"));
    assert!(!path.exists()); assert_eq!(std::fs::read(dest.path().join("元数据 跨盘.png")).unwrap(),bytes);
}
