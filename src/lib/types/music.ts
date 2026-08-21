export type LibraryView =
  | 'home'
  | 'songs'
  | 'artists'
  | 'albums'
  | 'playlists'
  | 'favorites'
  | 'recent';

export type RepeatMode = 'off' | 'all' | 'one';

export type TrackSource = 'demo' | 'local';

export type CoverArt = {
  from: string;
  via: string;
  to: string;
  imageDataUrl?: string;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  genre: string;
  year: number;
  fileType: string;
  bitrate: string;
  favorite: boolean;
  source: TrackSource;
  storageKey?: string;
  fingerprint?: string;
  path?: string;
  fileName?: string;
  size?: number;
  lastModified?: number;
  playbackSupported?: boolean;
  importWarning?: string;
  addedAt?: number;
  playedAt?: number;
  cover: CoverArt;
};

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
  count?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type PlayerState = {
  tracks: Track[];
  playlists: Playlist[];
  queue: string[];
  currentTrackId: string;
  isPlaying: boolean;
  position: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  activeView: LibraryView;
  search: string;
  selectedGenre: string;
  recentlyPlayed: string[];
};
