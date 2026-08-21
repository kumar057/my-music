use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct LibraryOverview {
  pub tracks: usize,
  pub albums: usize,
  pub artists: usize,
  pub watched_folders: Vec<String>,
}

pub fn overview() -> LibraryOverview {
  LibraryOverview {
    tracks: 0,
    albums: 0,
    artists: 0,
    watched_folders: Vec::new(),
  }
}

pub fn scan(paths: Vec<String>) -> Result<LibraryOverview, String> {
  if paths.is_empty() {
    return Err("Choose at least one folder to scan.".to_owned());
  }

  Ok(LibraryOverview {
    tracks: 0,
    albums: 0,
    artists: 0,
    watched_folders: paths,
  })
}
