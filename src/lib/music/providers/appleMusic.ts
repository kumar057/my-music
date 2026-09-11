import { env } from '$env/dynamic/public';
import { ProviderUnavailableError, type MusicAlbum, type MusicArtist, type MusicProvider, type MusicTrack, type ProviderSearchOptions, type ProviderStatus } from '../types';

type AppleArtwork = { url?: string };
type AppleSongAttributes = { name?: string; artistName?: string; albumName?: string; durationInMillis?: number; artwork?: AppleArtwork; previews?: Array<{ url?: string }>; url?: string };
type AppleArtistAttributes = { name?: string; artwork?: AppleArtwork; url?: string };
type AppleAlbumAttributes = { name?: string; artistName?: string; trackCount?: number; artwork?: AppleArtwork; url?: string };
type AppleSearchResponse = { results?: { songs?: { data?: Array<{ id: string; attributes?: AppleSongAttributes }> }; artists?: { data?: Array<{ id: string; attributes?: AppleArtistAttributes }> }; albums?: { data?: Array<{ id: string; attributes?: AppleAlbumAttributes }> } } };
type AppleTokenResponse = { developerToken?: string; token?: string };
type MusicKitInstance = { authorize: () => Promise<string>; unauthorize: () => Promise<void> };
type MusicKitGlobal = { configure: (config: { developerToken: string; storefrontId: string; app: { name: string; build: string } }) => Promise<MusicKitInstance> | MusicKitInstance };
declare global { interface Window { MusicKit?: MusicKitGlobal } }

const TOKEN_ENDPOINT = env.PUBLIC_APPLE_MUSIC_TOKEN_ENDPOINT || '';
const STOREFRONT = env.PUBLIC_APPLE_MUSIC_STOREFRONT || 'us';
const USER_TOKEN_KEY = 'myMusicAppleMusicUserToken';
const MUSIC_KIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';

export const appleMusicProvider: MusicProvider = { id: 'appleMusic', name: 'Apple Music', getStatus, searchTracks: (query, options) => searchApple(query, ['songs'], options).then((result) => result.tracks), searchArtists: (query, options) => searchApple(query, ['artists'], options).then((result) => result.artists), searchAlbums: (query, options) => searchApple(query, ['albums'], options).then((result) => result.albums) };

export function getStatus(): ProviderStatus {
  if (!TOKEN_ENDPOINT) return { id: 'appleMusic', name: 'Apple Music', state: 'not_configured', message: 'Developer token endpoint not configured', connectLabel: 'Configure Apple Music' };
  if (getStoredUserToken()) return { id: 'appleMusic', name: 'Apple Music', state: 'connected', message: 'Connected with MusicKit', disconnectLabel: 'Disconnect' };
  return { id: 'appleMusic', name: 'Apple Music', state: 'not_connected', message: 'Connect with Apple Music / MusicKit', connectLabel: 'Connect Apple Music' };
}

export async function connectAppleMusic() {
  if (!TOKEN_ENDPOINT || typeof window === 'undefined') throw new ProviderUnavailableError('Apple Music is not configured. Add PUBLIC_APPLE_MUSIC_TOKEN_ENDPOINT first.', getStatus());
  const developerToken = await getDeveloperToken();
  await loadMusicKitScript();
  if (!window.MusicKit) throw new Error('Apple Music MusicKit could not be loaded.');
  const instance = await window.MusicKit.configure({ developerToken, storefrontId: STOREFRONT, app: { name: 'My Music', build: '1.0.0' } });
  const userToken = await instance.authorize();
  if (!userToken) throw new Error('Apple Music authorization did not return a user token.');
  window.localStorage.setItem(USER_TOKEN_KEY, userToken);
  return getStatus();
}

export async function disconnectAppleMusic() {
  if (typeof window === 'undefined') return;
  try {
    if (window.MusicKit) {
      const developerToken = await getDeveloperToken();
      const instance = await window.MusicKit.configure({ developerToken, storefrontId: STOREFRONT, app: { name: 'My Music', build: '1.0.0' } });
      await instance.unauthorize();
    }
  } catch { /* local sign-out still succeeds */ }
  window.localStorage.removeItem(USER_TOKEN_KEY);
}

async function searchApple(query: string, types: Array<'songs' | 'artists' | 'albums'>, options: ProviderSearchOptions = {}) {
  const status = getStatus();
  if (status.state === 'not_configured' || status.state === 'not_connected') throw new ProviderUnavailableError('Apple Music is not connected.', status);
  const developerToken = await getDeveloperToken(options.signal);
  const params = new URLSearchParams({ term: query, types: types.join(','), limit: String(options.limit ?? 10) });
  const response = await fetch(`https://api.music.apple.com/v1/catalog/${STOREFRONT}/search?${params.toString()}`, { headers: { Authorization: `Bearer ${developerToken}` }, signal: options.signal });
  if (!response.ok) throw new ProviderUnavailableError('Apple Music unavailable.', { ...status, state: 'unavailable', message: 'Apple Music unavailable' });
  const data = (await response.json()) as AppleSearchResponse;
  return { tracks: (data.results?.songs?.data ?? []).map((song) => normalizeSong(song.id, song.attributes)), artists: (data.results?.artists?.data ?? []).map((artist) => normalizeArtist(artist.id, artist.attributes)), albums: (data.results?.albums?.data ?? []).map((album) => normalizeAlbum(album.id, album.attributes)) };
}

async function getDeveloperToken(signal?: AbortSignal) {
  const response = await fetch(TOKEN_ENDPOINT, { signal });
  if (!response.ok) throw new ProviderUnavailableError('Apple Music token endpoint unavailable.', { ...getStatus(), state: 'unavailable', message: 'Apple Music token endpoint unavailable' });
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) { const data = (await response.json()) as AppleTokenResponse; const token = data.developerToken ?? data.token; if (token) return token; }
  const text = await response.text();
  if (text.trim()) return text.trim();
  throw new ProviderUnavailableError('Apple Music token endpoint returned no token.', { ...getStatus(), state: 'unavailable', message: 'Apple Music token endpoint returned no token' });
}

function getStoredUserToken() { if (typeof window === 'undefined') return ''; return window.localStorage.getItem(USER_TOKEN_KEY) || ''; }
function loadMusicKitScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Apple Music requires a browser environment.'));
  if (window.MusicKit) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${MUSIC_KIT_SRC}"]`);
  if (existing) return new Promise<void>((resolve, reject) => { existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', () => reject(new Error('Apple Music MusicKit script failed to load.')), { once: true }); });
  return new Promise<void>((resolve, reject) => { const script = document.createElement('script'); script.src = MUSIC_KIT_SRC; script.async = true; script.onload = () => resolve(); script.onerror = () => reject(new Error('Apple Music MusicKit script failed to load.')); document.head.appendChild(script); });
}
function normalizeSong(id: string, attributes: AppleSongAttributes = {}): MusicTrack { const previewUrl = attributes.previews?.find((preview) => preview.url)?.url; return { id, provider: 'appleMusic', title: attributes.name ?? 'Untitled', artist: attributes.artistName ?? 'Unknown Artist', album: attributes.albumName ?? 'Apple Music', artwork: artworkUrl(attributes.artwork), duration: Math.round((attributes.durationInMillis ?? 0) / 1000), previewUrl, externalUrl: attributes.url, playable: Boolean(previewUrl), playbackMode: previewUrl ? 'PREVIEW' : 'APPLE_MUSIC', providerBadge: 'Apple Music' }; }
function normalizeArtist(id: string, attributes: AppleArtistAttributes = {}): MusicArtist { return { id, provider: 'appleMusic', name: attributes.name ?? 'Unknown Artist', artwork: artworkUrl(attributes.artwork), externalUrl: attributes.url, providerBadge: 'Apple Music' }; }
function normalizeAlbum(id: string, attributes: AppleAlbumAttributes = {}): MusicAlbum { return { id, provider: 'appleMusic', title: attributes.name ?? 'Untitled Album', artist: attributes.artistName ?? 'Unknown Artist', artwork: artworkUrl(attributes.artwork), trackCount: attributes.trackCount ?? 0, externalUrl: attributes.url, providerBadge: 'Apple Music' }; }
function artworkUrl(artwork: AppleArtwork | undefined) { return artwork?.url?.replace('{w}', '600').replace('{h}', '600'); }
