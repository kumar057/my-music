export type LibraryView =
  | 'home'
  | 'search'
  | 'discover'
  | 'songs'
  | 'artists'
  | 'albums'
  | 'playlists'
  | 'favorites'
  | 'recent'
  | 'local'
  | 'settings';

export type RepeatMode = 'off' | 'all' | 'one';

export type TrackSource = 'demo' | 'local' | 'spotify' | 'appleMusic' | 'youtube';

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
  provider?: TrackSource;
  providerTrackId?: string;
  providerBadge?: string;
  storageKey?: string;
  fingerprint?: string;
  path?: string;
  fileName?: string;
  size?: number;
  lastModified?: number;
  previewUrl?: string;
  externalUrl?: string;
  embedUrl?: string;
  playbackMode?: 'LOCAL' | 'PREVIEW' | 'APPLE_MUSIC' | 'SPOTIFY' | 'YOUTUBE';
  playable?: boolean;
  artworkUrl?: string;
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
