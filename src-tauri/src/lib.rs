mod audio;
mod commands;
mod library;
mod metadata;
mod plugins;

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
      commands::get_library_overview,
      commands::scan_library,
      commands::get_playback_devices,
      commands::read_track_metadata
    ])
    .run(tauri::generate_context!())
    .expect("failed to run Local Music Player");
}
