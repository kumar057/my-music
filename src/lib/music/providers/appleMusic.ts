import { env } from '$env/dynamic/public';
import {
  ProviderUnavailableError,
  type MusicAlbum,
  type MusicArtist,
  type MusicProvider,
  type MusicTrack,
  type ProviderSearchOptions,
  type ProviderStatus
} from '../types';

type AppleArtwork = {
  url?: string;
};

type AppleSongAttributes = {
  name?: string;
  artistName?: string;
  albumName?: string;
  durationInMillis?: number;
  artwork?: AppleArtwork;
  previews?: Array<{ url?: string }>;
  url?: string;
};

type AppleArtistAttributes = {
  name?: string;
  artwork?: AppleArtwork;
  url?: string;
};

type AppleAlbumAttributes = {
  name?: string;
  artistName?: string;
  trackCount?: number;
  artwork?: AppleArtwork;
  url?: string;
};

type AppleSearchResponse = {
  results?: {
    songs?: { data?: Array<{ id: string; attributes?: AppleSongAttributes }> };
    artists?: { data?: Array<{ id: string; attributes?: AppleArtistAttributes }> };
    albums?: { data?: Array<{ id: string; attributes?: AppleAlbumAttributes }> };
  };
};

type AppleTokenResponse = {
  developerToken?: string;
  token?: string;
};

const TOKEN_ENDPOINT = env.PUBLIC_APPLE_MUSIC_TOKEN_ENDPOINT || '';
const STOREFRONT = env.PUBLIC_APPLE_MUSIC_STOREFRONT || 'us';

export const appleMusicProvider: MusicProvider = {
  id: 'appleMusic',
  name: 'Apple Music',
  getStatus,
  searchTracks: (query, options) => searchApple(query, ['songs'], options).then((result) => result.tracks),
  searchArtists: (query, options) => searchApple(query, ['artists'], options).then((result) => result.artists),
  searchAlbums: (query, options) => searchApple(query, ['albums'], options).then((result) => result.albums)
};

export function getStatus(): ProviderStatus {
  if (!TOKEN_ENDPOINT) {
    return {
      id: 'appleMusic',
      name: 'Apple Music',
      state: 'not_configured',
      message: 'Provider not configured',
      connectLabel: 'Add token endpoint'
    };
  }

  return {
    id: 'appleMusic',
    name: 'Apple Music',
    state: 'configured',
    message: 'Catalog search enabled through a server-side developer token endpoint'
  };
}

async function searchApple(
  query: string,
  types: Array<'songs' | 'artists' | 'albums'>,
  options: ProviderSearchOptions = {}
) {
  const status = getStatus();

  if (status.state === 'not_configured') {
    throw new ProviderUnavailableError('Apple Music provider is not configured.', status);
  }

  const developerToken = await getDeveloperToken(options.signal);
  const params = new URLSearchParams({
    term: query,
    types: types.join(','),
    limit: String(options.limit ?? 10)
  });

  const response = await fetch(
    `https://api.music.apple.com/v1/catalog/${STOREFRONT}/search?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${developerToken}` },
      signal: options.signal
    }
  );

  if (!response.ok) {
    throw new ProviderUnavailableError('Apple Music unavailable.', {
      ...status,
      state: 'unavailable',
      message: 'Apple Music unavailable'
    });
  }

  const data = (await response.json()) as AppleSearchResponse;

  return {
    tracks: (data.results?.songs?.data ?? []).map((song) => normalizeSong(song.id, song.attributes)),
    artists: (data.results?.artists?.data ?? []).map((artist) =>
      normalizeArtist(artist.id, artist.attributes)
    ),
    albums: (data.results?.albums?.data ?? []).map((album) => normalizeAlbum(album.id, album.attributes))
  };
}

async function getDeveloperToken(signal?: AbortSignal) {
  const response = await fetch(TOKEN_ENDPOINT, { signal });

  if (!response.ok) {
    throw new ProviderUnavailableError('Apple Music token endpoint unavailable.', {
      ...getStatus(),
      state: 'unavailable',
      message: 'Apple Music token endpoint unavailable'
    });
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const data = (await response.json()) as AppleTokenResponse;
    const token = data.developerToken ?? data.token;
    if (token) return token;
  }

  const text = await response.text();
  if (text.trim()) return text.trim();

  throw new ProviderUnavailableError('Apple Music token endpoint returned no token.', {
    ...getStatus(),
    state: 'unavailable',
    message: 'Apple Music token endpoint returned no token'
  });
}

function normalizeSong(id: string, attributes: AppleSongAttributes = {}): MusicTrack {
  const previewUrl = attributes.previews?.find((preview) => preview.url)?.url;

  return {
    id,
    provider: 'appleMusic',
    title: attributes.name ?? 'Untitled',
    artist: attributes.artistName ?? 'Unknown Artist',
    album: attributes.albumName ?? 'Apple Music',
    artwork: artworkUrl(attributes.artwork),
    duration: Math.round((attributes.durationInMillis ?? 0) / 1000),
    previewUrl,
    externalUrl: attributes.url,
    playable: Boolean(previewUrl),
    playbackMode: previewUrl ? 'PREVIEW' : 'APPLE_MUSIC',
    providerBadge: 'Apple Music'
  };
}

function normalizeArtist(id: string, attributes: AppleArtistAttributes = {}): MusicArtist {
  return {
    id,
    provider: 'appleMusic',
    name: attributes.name ?? 'Unknown Artist',
    artwork: artworkUrl(attributes.artwork),
    externalUrl: attributes.url,
    providerBadge: 'Apple Music'
  };
}

function normalizeAlbum(id: string, attributes: AppleAlbumAttributes = {}): MusicAlbum {
  return {
    id,
    provider: 'appleMusic',
    title: attributes.name ?? 'Untitled Album',
    artist: attributes.artistName ?? 'Unknown Artist',
    artwork: artworkUrl(attributes.artwork),
    trackCount: attributes.trackCount ?? 0,
    externalUrl: attributes.url,
    providerBadge: 'Apple Music'
  };
}

function artworkUrl(artwork: AppleArtwork | undefined) {
  return artwork?.url?.replace('{w}', '600').replace('{h}', '600');
}
