export type MusicProviderId = 'local' | 'spotify' | 'appleMusic' | 'youtube' | 'indianMusic';

export type MusicResultKind = 'track' | 'artist' | 'album';

export type ProviderConnectionState =
  | 'configured'
  | 'not_configured'
  | 'connected'
  | 'not_connected'
  | 'unavailable'
  | 'offline';

export type PlaybackMode = 'LOCAL' | 'PREVIEW' | 'APPLE_MUSIC' | 'SPOTIFY' | 'YOUTUBE';

export type ProviderStatus = {
  id: MusicProviderId;
  name: string;
  state: ProviderConnectionState;
  message: string;
  connectLabel?: string;
  disconnectLabel?: string;
};

export type MusicTrack = {
  id: string;
  provider: MusicProviderId;
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  duration: number;
  previewUrl?: string;
  externalUrl?: string;
  embedUrl?: string;
  playable: boolean;
  playbackMode: PlaybackMode;
  providerBadge: string;
};

export type MusicArtist = {
  id: string;
  provider: MusicProviderId;
  name: string;
  artwork?: string;
  externalUrl?: string;
  providerBadge: string;
};

export type MusicAlbum = {
  id: string;
  provider: MusicProviderId;
  title: string;
  artist: string;
  artwork?: string;
  trackCount: number;
  externalUrl?: string;
  providerBadge: string;
};

export type ProviderSearchOptions = {
  signal?: AbortSignal;
  limit?: number;
};

export type ProviderSearchResult = {
  provider: MusicProviderId;
  status: ProviderStatus;
  tracks: MusicTrack[];
  artists: MusicArtist[];
  albums: MusicAlbum[];
};

export type UnifiedSearchResult = {
  query: string;
  tracks: MusicTrack[];
  artists: MusicArtist[];
  albums: MusicAlbum[];
  providerResults: ProviderSearchResult[];
  generatedAt: number;
};

export interface MusicProvider {
  id: MusicProviderId;
  name: string;
  getStatus(): ProviderStatus;
  searchTracks(query: string, options?: ProviderSearchOptions): Promise<MusicTrack[]>;
  searchArtists(query: string, options?: ProviderSearchOptions): Promise<MusicArtist[]>;
  searchAlbums(query: string, options?: ProviderSearchOptions): Promise<MusicAlbum[]>;
}

export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: ProviderStatus
  ) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}
