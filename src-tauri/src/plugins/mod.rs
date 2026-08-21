pub trait MusicPlayerPlugin {
  fn id(&self) -> &'static str;
  fn name(&self) -> &'static str;
}
