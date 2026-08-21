export type LibraryView = 'albums' | 'songs' | 'artists' | 'playlists';

export type RepeatMode = 'off' | 'all' | 'one';

export type TrackSource = 'demo' | 'local';

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
  path?: string;
  fileName?: string;
  size?: number;
  lastModified?: number;
  cover: {
    from: string;
    via: string;
    to: string;
  };
};

export type Playlist = {
  id: string;
  name: string;
  count: number;
};

export type PlayerState = {
  tracks: Track[];
  playlists: Playlist[];
  queue: string[];
  currentTrackId: string;
  isPlaying: boolean;
  position: number;
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  activeView: LibraryView;
  search: string;
  selectedGenre: string;
};
