use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PlaybackDevice {
  pub id: String,
  pub name: String,
  pub is_default: bool,
}

pub fn playback_devices() -> Result<Vec<PlaybackDevice>, String> {
  Ok(vec![PlaybackDevice {
    id: "system-default".to_owned(),
    name: "System Default".to_owned(),
    is_default: true,
  }])
}

pub struct AudioEngine;

impl AudioEngine {
  pub fn new() -> Self {
    Self
  }

  pub fn play_file(&self, _path: &str) -> Result<(), String> {
    Ok(())
  }
}
