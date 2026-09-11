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

type IndianSong = {
  song_id?: string;
  song_name?: string;
  album_name?: string;
  song_duration?: string | number;
  song_artist?: string;
  song_image?: string;
  song_link?: string;
  song_language?: string;
};

const API_BASE = (env.PUBLIC_INDIAN_MUSIC_API_URL || 'https://saavn.me/search').replace(/\/$/, '');

export const indianMusicProvider: MusicProvider = {
  id: 'indianMusic',
  name: 'Indian Music',
  getStatus,
  searchTracks,
  searchArtists,
  searchAlbums
};

export function getStatus(): ProviderStatus {
  return {
    id: 'indianMusic',
    name: 'Indian Music',
    state: 'connected',
    message: 'Indian-language music discovery connected and ready',
    connectLabel: 'Connected',
    disconnectLabel: 'Disconnect'
  };
}

async function searchTracks(query: string, options: ProviderSearchOptions = {}): Promise<MusicTrack[]> {
  const params = new URLSearchParams({ song: query });
  const response = await fetch(`${API_BASE}?${params.toString()}`, { signal: options.signal });

  if (!response.ok) {
    throw new ProviderUnavailableError('Indian Music provider unavailable.', {
      ...getStatus(),
      state: 'unavailable',
      message: 'Indian Music provider unavailable'
    });
  }

  const payload = (await response.json()) as unknown;
  const songs = extractSongs(payload).slice(0, options.limit ?? 10);

  return songs.map(normalizeSong);
}

async function searchArtists(): Promise<MusicArtist[]> {
  return [];
}

async function searchAlbums(): Promise<MusicAlbum[]> {
  return [];
}

function extractSongs(payload: unknown): IndianSong[] {
  if (Array.isArray(payload)) return payload as IndianSong[];

  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const candidates = [record.results, record.data, record.songs, record.items];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as IndianSong[];
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as Record<string, unknown>;
      if (Array.isArray(nested.results)) return nested.results as IndianSong[];
      if (Array.isArray(nested.songs)) return nested.songs as IndianSong[];
    }
  }

  return [];
}

function normalizeSong(song: IndianSong): MusicTrack {
  const id = String(song.song_id ?? song.song_link ?? `${song.song_name ?? 'song'}-${song.song_artist ?? 'artist'}`);
  const duration = Number(song.song_duration ?? 0);

  return {
    id,
    provider: 'indianMusic',
    title: song.song_name ?? 'Unknown song',
    artist: song.song_artist ?? 'Unknown artist',
    album: song.album_name ?? 'Indian Music',
    artwork: song.song_image,
    duration: Number.isFinite(duration) ? duration : 0,
    externalUrl: song.song_link,
    playable: false,
    playbackMode: 'PREVIEW',
    providerBadge: 'Indian Music'
  };
}
