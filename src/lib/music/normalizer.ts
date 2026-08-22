import type { Track } from '$lib/types/music';
import type { MusicAlbum, MusicArtist, MusicProviderId, MusicTrack } from './types';

const PROVIDER_PALETTES: Record<MusicProviderId, [string, string, string]> = {
  local: ['#d7ff73', '#4ab5a4', '#1e4b5f'],
  spotify: ['#1db954', '#157347', '#082f21'],
  appleMusic: ['#ff375f', '#a855f7', '#1f1538'],
  youtube: ['#ff4d4d', '#c1121f', '#250902']
};

export function toPlayerTrack(result: MusicTrack): Track {
  const palette = PROVIDER_PALETTES[result.provider] ?? PROVIDER_PALETTES.local;

  return {
    id: `${result.provider}:${result.id}`,
    title: result.title,
    artist: result.artist || 'Unknown Artist',
    album: result.album || 'Unknown Album',
    duration: result.duration || 0,
    genre: result.providerBadge,
    year: 0,
    fileType: result.playbackMode,
    bitrate: result.previewUrl ? 'Official preview' : 'Provider playback',
    favorite: false,
    source: result.provider,
    provider: result.provider,
    providerTrackId: result.id,
    providerBadge: result.providerBadge,
    previewUrl: result.previewUrl,
    externalUrl: result.externalUrl,
    embedUrl: result.embedUrl,
    playbackMode: result.playbackMode,
    playable: result.playable,
    playbackSupported: result.playable,
    artworkUrl: result.artwork,
    cover: {
      from: palette[0],
      via: palette[1],
      to: palette[2],
      imageDataUrl: result.artwork
    }
  };
}

export function providerResultKey(result: MusicTrack | MusicArtist | MusicAlbum) {
  return `${result.provider}:${result.id}`;
}

export function dedupeTracks(tracks: MusicTrack[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    const key = providerResultKey(track);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
