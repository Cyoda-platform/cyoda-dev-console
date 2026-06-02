pub mod atomic_write;
pub mod commands;
pub mod paths;
pub mod save_origin;
pub mod scan_registry;

use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let scan_registry: scan_registry::ScanRegistryState = Arc::new(Default::default());
    let save_origin: save_origin::SaveOriginState = Arc::new(Default::default());
    let watch_registry: commands::watcher::WatchRegistryState = Arc::new(Default::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(scan_registry)
        .manage(save_origin)
        .manage(watch_registry)
        .invoke_handler(tauri::generate_handler![
            commands::project::select_project_root,
            commands::project::scan_project,
            commands::fs_io::read_text_file,
            commands::fs_io::write_text_file_with_confirmed_overwrite,
            commands::fs_io::save_file_as,
            commands::watcher::watch_project,
            commands::watcher::unwatch_project,
            commands::shell_ext::reveal_in_finder,
            commands::shell_ext::open_in_ide,
            commands::config::load_app_config,
            commands::config::save_app_config,
            commands::agent::read_cyoda_profile_config,
            commands::agent::detect_agents,
            commands::agent::write_project_text_file,
            commands::llm::llm_complete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
