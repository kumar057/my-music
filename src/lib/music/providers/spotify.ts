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

type SpotifyImage = {
  url: string;
  width?: number;
  height?: number;
};

type SpotifyExternalUrls = {
  spotify?: string;
};

type SpotifyArtist = {
  id: string;
  name: string;
  images?: SpotifyImage[];
  external_urls?: SpotifyExternalUrls;
};

type SpotifyAlbum = {
  id: string;
  name: string;
  album_type?: string;
  total_tracks?: number;
  images?: SpotifyImage[];
  artists?: Pick<SpotifyArtist, 'name'>[];
  external_urls?: SpotifyExternalUrls;
};

type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms?: number;
  preview_url?: string | null;
  artists?: Pick<SpotifyArtist, 'name'>[];
  album?: SpotifyAlbum;
  external_urls?: SpotifyExternalUrls;
};

type SpotifySearchResponse = {
  tracks?: { items?: SpotifyTrack[] };
  artists?: { items?: SpotifyArtist[] };
  albums?: { items?: SpotifyAlbum[] };
};

type SpotifyToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

type StoredSpotifyToken = SpotifyToken & {
  expiresAt: number;
};

const CLIENT_ID = env.PUBLIC_SPOTIFY_CLIENT_ID || '';
const REDIRECT_URI = env.PUBLIC_SPOTIFY_REDIRECT_URI || '';
const TOKEN_KEY = 'myMusicSpotifyToken';
const VERIFIER_KEY = 'myMusicSpotifyVerifier';
const STATE_KEY = 'myMusicSpotifyState';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1/search';
const SCOPES = ['user-read-private', 'streaming'];

export const spotifyProvider: MusicProvider = {
  id: 'spotify',
  name: 'Spotify',
  getStatus,
  searchTracks: (query, options) => searchSpotify(query, ['track'], options).then((result) => result.tracks),
  searchArtists: (query, options) => searchSpotify(query, ['artist'], options).then((result) => result.artists),
  searchAlbums: (query, options) => searchSpotify(query, ['album'], options).then((result) => result.albums)
};

export function getSpotifyClientId() {
  return CLIENT_ID;
}

export function getStatus(): ProviderStatus {
  if (!CLIENT_ID) {
    return {
      id: 'spotify',
      name: 'Spotify',
      state: 'not_configured',
      message: 'Provider not configured',
      connectLabel: 'Add client ID'
    };
  }

  const token = getStoredToken();

  if (!token) {
    return {
      id: 'spotify',
      name: 'Spotify',
      state: 'not_connected',
      message: 'Connect with Spotify OAuth PKCE',
      connectLabel: 'Connect Spotify'
    };
  }

  return {
    id: 'spotify',
    name: 'Spotify',
    state: 'connected',
    message: 'Connected',
    disconnectLabel: 'Disconnect'
  };
}

export async function startSpotifyLogin() {
  if (!CLIENT_ID || typeof window === 'undefined') {
    throw new ProviderUnavailableError('Spotify provider is not configured.', getStatus());
  }

  const verifier = randomString(96);
  const state = randomString(32);
  const challenge = await createCodeChallenge(verifier);
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES.join(' ')
  });

  window.localStorage.setItem(VERIFIER_KEY, verifier);
  window.localStorage.setItem(STATE_KEY, state);
  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

export async function completeSpotifyLoginFromUrl(url: URL) {
  if (!CLIENT_ID || typeof window === 'undefined') return null;

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = window.localStorage.getItem(STATE_KEY);
  const verifier = window.localStorage.getItem(VERIFIER_KEY);

  if (!code) return null;

  if (!state || state !== expectedState || !verifier) {
    clearSpotifyAuthScratch();
    throw new Error('Spotify login could not be verified. Please try connecting again.');
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    clearSpotifyAuthScratch();
    throw new Error('Spotify authorization failed.');
  }

  const token = (await response.json()) as SpotifyToken;
  storeToken(token);
  clearSpotifyAuthScratch();
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  return getStatus();
}

export function disconnectSpotify() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  clearSpotifyAuthScratch();
}

async function searchSpotify(
  query: string,
  types: Array<'track' | 'artist' | 'album'>,
  options: ProviderSearchOptions = {}
) {
  const token = getStoredToken();

  if (!token) {
    throw new ProviderUnavailableError('Spotify is not connected.', getStatus());
  }

  const params = new URLSearchParams({
    q: query,
    type: types.join(','),
    limit: String(options.limit ?? 10),
    market: 'US'
  });

  const response = await fetch(`${API_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: options.signal
  });

  if (response.status === 401) {
    disconnectSpotify();
    throw new ProviderUnavailableError('Spotify session expired. Connect again.', getStatus());
  }

  if (response.status === 429) {
    throw new ProviderUnavailableError('Spotify rate limit reached. Try again soon.', {
      ...getStatus(),
      state: 'unavailable',
      message: 'Spotify rate limit reached'
    });
  }

  if (!response.ok) {
    throw new ProviderUnavailableError('Spotify unavailable.', {
      ...getStatus(),
      state: 'unavailable',
      message: 'Spotify unavailable'
    });
  }

  const data = (await response.json()) as SpotifySearchResponse;

  return {
    tracks: (data.tracks?.items ?? []).map(normalizeTrack),
    artists: (data.artists?.items ?? []).map(normalizeArtist),
    albums: (data.albums?.items ?? []).map(normalizeAlbum)
  };
}

function normalizeTrack(track: SpotifyTrack): MusicTrack {
  const previewUrl = track.preview_url ?? undefined;

  return {
    id: track.id,
    provider: 'spotify',
    title: track.name,
    artist: track.artists?.map((artist) => artist.name).join(', ') || 'Unknown Artist',
    album: track.album?.name || 'Spotify',
    artwork: bestImage(track.album?.images),
    duration: Math.round((track.duration_ms ?? 0) / 1000),
    previewUrl,
    externalUrl: track.external_urls?.spotify,
    playable: Boolean(previewUrl),
    playbackMode: previewUrl ? 'PREVIEW' : 'SPOTIFY',
    providerBadge: 'Spotify'
  };
}

function normalizeArtist(artist: SpotifyArtist): MusicArtist {
  return {
    id: artist.id,
    provider: 'spotify',
    name: artist.name,
    artwork: bestImage(artist.images),
    externalUrl: artist.external_urls?.spotify,
    providerBadge: 'Spotify'
  };
}

function normalizeAlbum(album: SpotifyAlbum): MusicAlbum {
  return {
    id: album.id,
    provider: 'spotify',
    title: album.name,
    artist: album.artists?.map((artist) => artist.name).join(', ') || 'Unknown Artist',
    artwork: bestImage(album.images),
    trackCount: album.total_tracks ?? 0,
    externalUrl: album.external_urls?.spotify,
    providerBadge: 'Spotify'
  };
}

function bestImage(images: SpotifyImage[] | undefined) {
  return images?.[0]?.url;
}

function getStoredToken() {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;

  try {
    const token = JSON.parse(raw) as StoredSpotifyToken;
    if (!token.access_token || token.expiresAt < Date.now() + 30_000) {
      window.localStorage.removeItem(TOKEN_KEY);
      return null;
    }

    return token;
  } catch {
    window.localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

function storeToken(token: SpotifyToken) {
  if (typeof window === 'undefined') return;

  const stored: StoredSpotifyToken = {
    ...token,
    expiresAt: Date.now() + token.expires_in * 1000
  };

  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
}

function getRedirectUri() {
  if (REDIRECT_URI) return REDIRECT_URI;
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

function clearSpotifyAuthScratch() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(VERIFIER_KEY);
  window.localStorage.removeItem(STATE_KEY);
}

function randomString(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('');
}

async function createCodeChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
