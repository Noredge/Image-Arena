fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "set_ui_language", "read_image_chunk",
            "load_settings", "save_settings", "pick_images", "take_dropped_images", "read_image", "release_images",
            "set_import_enabled", "copy_text", "save_record", "close_app",
            "pick_destination", "remembered_destinations", "prepare_organization", "execute_organization", "discard_organization", "cancel_organization", "open_operation_records",
        ]),
    )).expect("failed to build desktop application");
}
