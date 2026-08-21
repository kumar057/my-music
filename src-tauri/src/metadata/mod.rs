use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct TrackMetadata {
  pub path: String,
  pub title: Option<String>,
  pub artist: Option<String>,
  pub album: Option<String>,
  pub duration_seconds: Option<u64>,
  pub format: Option<String>,
}

pub fn read_track_metadata(path: String) -> Result<TrackMetadata, String> {
  if path.trim().is_empty() {
    return Err("Track path is required.".to_owned());
  }

  Ok(TrackMetadata {
    path,
    title: None,
    artist: None,
    album: None,
    duration_seconds: None,
    format: None,
  })
}
