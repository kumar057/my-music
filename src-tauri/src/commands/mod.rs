use serde::Serialize;

use crate::audio;
use crate::library::{self, LibraryOverview};
use crate::metadata::{self, TrackMetadata};

#[derive(Debug, Serialize)]
pub struct CommandError {
  message: String,
}

impl From<String> for CommandError {
  fn from(message: String) -> Self {
    Self { message }
  }
}

impl From<&str> for CommandError {
  fn from(message: &str) -> Self {
    Self {
      message: message.to_owned(),
    }
  }
}

#[tauri::command]
pub async fn get_library_overview() -> Result<LibraryOverview, CommandError> {
  Ok(library::overview())
}

#[tauri::command]
pub async fn scan_library(paths: Vec<String>) -> Result<LibraryOverview, CommandError> {
  library::scan(paths).map_err(CommandError::from)
}

#[tauri::command]
pub async fn get_playback_devices() -> Result<Vec<audio::PlaybackDevice>, CommandError> {
  audio::playback_devices().map_err(CommandError::from)
}

#[tauri::command]
pub async fn read_track_metadata(path: String) -> Result<TrackMetadata, CommandError> {
  metadata::read_track_metadata(path).map_err(CommandError::from)
}
