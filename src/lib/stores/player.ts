import { derived, writable } from 'svelte/store';
import { demoPlaylists, demoTracks } from '$lib/data/demoLibrary';
import { toPlayerTrack } from '$lib/music/normalizer';
import { searchMusic } from '$lib/music/search';
import { saveProviderTracks } from '$lib/local/localLibrary';
import type { LibraryView, PlayerState, Playlist, RepeatMode, Track } from '$lib/types/music';
import { clamp } from '$lib/utils/format';

const initialState: PlayerState = {
  tracks: [], playlists: [], queue: [], currentTrackId: '', isPlaying: false, position: 0,
  volume: 72, muted: false, repeat: 'all', shuffle: false, activeView: 'home', search: '',
  selectedGenre: 'All', recentlyPlayed: []
};

let autoCatalogStarted = false;

function uniqueIds(trackIds: string[]) { return Array.from(new Set(trackIds.filter(Boolean))); }

function normalizePlaylist(playlist: Playlist): Playlist {
  const trackIds = uniqueIds(playlist.trackIds ?? []);
  return { ...playlist, trackIds, count: trackIds.length };
}

function normalizeTracks(tracks: Track[]) {
  return tracks.map((track) => ({ ...track, artist: track.artist || 'Unknown Artist', album: track.album || 'Unknown Album', title: track.title || track.fileName || 'Untitled', favorite: Boolean(track.favorite) }));
}

function findNextQueueTrack(state: PlayerState, direction: 1 | -1) {
  if (state.queue.length === 0) return '';
  const currentIndex = state.queue.indexOf(state.currentTrackId);
  const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = fallbackIndex + direction;
  if (nextIndex < 0) return state.queue[state.queue.length - 1] ?? '';
  if (nextIndex >= state.queue.length) return state.repeat === 'off' ? '' : (state.queue[0] ?? '');
  return state.queue[nextIndex] ?? '';
}

async function autoDiscoverMusic(appendTracks: (tracks: Track[]) => void) {
  if (typeof window === 'undefined') return;
  const queries = ['Telugu latest songs', 'Hindi latest songs', 'English latest songs', 'global hits'];
  const settled = await Promise.allSettled(queries.map((query) => searchMusic(query, { limit: 8 })));
  const discovered = settled.flatMap((result) => result.status === 'fulfilled' ? result.value.tracks.slice(0, 8) : []);
  const tracks = discovered.map(toPlayerTrack);
  if (tracks.length > 0) appendTracks(tracks);
}

function createPlayerStore() {
  const { subscribe, update } = writable<PlayerState>(initialState);

  const move = (direction: 1 | -1) => update((state) => {
    const nextTrackId = findNextQueueTrack(state, direction);
    if (!nextTrackId) return { ...state, isPlaying: false };
    return { ...state, currentTrackId: nextTrackId, position: 0, isPlaying: true };
  });

  const appendDiscoveredTracks = (tracks: Track[]) => update((state) => {
    const existingIds = new Set(state.tracks.map((track) => track.id));
    const incomingTracks = normalizeTracks(tracks).filter((track) => !existingIds.has(track.id));
    const nextTracks = [...state.tracks, ...incomingTracks];
    const nextIds = nextTracks.map((track) => track.id);
    if (incomingTracks.length > 0) void saveProviderTracks(nextTracks);
    return {
      ...state,
      tracks: nextTracks,
      queue: state.queue.length > 0 ? uniqueIds([...state.queue, ...incomingTracks.map((track) => track.id)]) : nextIds,
      currentTrackId: state.currentTrackId || nextIds[0] || '',
      activeView: nextTracks.length > 0 ? 'songs' : 'home'
    };
  });

  const seek = (position: number) => update((state) => {
    const track = state.tracks.find((item) => item.id === state.currentTrackId);
    return { ...state, position: clamp(position, 0, track?.duration || Number.MAX_SAFE_INTEGER) };
  });

  return {
    subscribe,
    setView: (activeView: LibraryView) => update((state) => ({ ...state, activeView })),
    setSearch: (search: string) => update((state) => ({ ...state, search })),
    setGenre: (selectedGenre: string) => update((state) => ({ ...state, selectedGenre })),
    setVolume: (volume: number) => update((state) => ({ ...state, volume: clamp(volume, 0, 100) })),
    setMuted: (muted: boolean) => update((state) => ({ ...state, muted })),
    toggleMuted: () => update((state) => ({ ...state, muted: !state.muted })),
    setPlaying: (isPlaying: boolean) => update((state) => ({ ...state, isPlaying })),
    setPosition: seek,
    seek,
    setTrackDuration: (trackId: string, duration: number) => update((state) => ({ ...state, tracks: state.tracks.map((track) => track.id === trackId ? { ...track, duration: Math.max(0, Math.round(duration)) } : track) })),
    setLibrary: (tracks: Track[], playlists: Playlist[] = [], recentlyPlayed: string[] = []) => update((state) => {
      const normalizedTracks = normalizeTracks(tracks);
      const trackIds = normalizedTracks.map((track) => track.id);
      const currentTrackId = trackIds.includes(state.currentTrackId) ? state.currentTrackId : (trackIds[0] ?? '');
      if (!autoCatalogStarted && typeof window !== 'undefined') {
        autoCatalogStarted = true;
        queueMicrotask(() => void autoDiscoverMusic(appendDiscoveredTracks));
      }
      return { ...state, tracks: normalizedTracks, playlists: playlists.map(normalizePlaylist), queue: state.queue.filter((trackId) => trackIds.includes(trackId)), currentTrackId, isPlaying: false, position: 0, activeView: normalizedTracks.length > 0 ? 'songs' : 'home', selectedGenre: 'All', recentlyPlayed: recentlyPlayed.filter((trackId) => trackIds.includes(trackId)) };
    }),
    loadTracks: (tracks: Track[]) => update((state) => {
      const normalizedTracks = normalizeTracks(tracks);
      const trackIds = normalizedTracks.map((track) => track.id);
      return { ...state, tracks: normalizedTracks, queue: trackIds, currentTrackId: trackIds[0] ?? '', isPlaying: false, position: 0, activeView: normalizedTracks.length > 0 ? 'songs' : 'home', selectedGenre: 'All', recentlyPlayed: state.recentlyPlayed.filter((trackId) => trackIds.includes(trackId)) };
    }),
    appendTracks: appendDiscoveredTracks,
    clearLibrary: () => update((state) => ({ ...state, tracks: [], playlists: [], queue: [], currentTrackId: '', isPlaying: false, position: 0, activeView: 'home', selectedGenre: 'All', recentlyPlayed: [] })),
    clearLocalTracks: () => update((state) => {
      const tracks = state.tracks.filter((track) => track.source !== 'local');
      const trackIds = new Set(tracks.map((track) => track.id));
      return { ...state, tracks, playlists: state.playlists.map((playlist) => normalizePlaylist({ ...playlist, trackIds: playlist.trackIds.filter((trackId) => trackIds.has(trackId)) })), queue: state.queue.filter((trackId) => trackIds.has(trackId)), currentTrackId: trackIds.has(state.currentTrackId) ? state.currentTrackId : (tracks[0]?.id ?? ''), isPlaying: trackIds.has(state.currentTrackId) ? state.isPlaying : false, position: trackIds.has(state.currentTrackId) ? state.position : 0, activeView: tracks.length > 0 ? state.activeView : 'home', recentlyPlayed: state.recentlyPlayed.filter((trackId) => trackIds.has(trackId)) };
    }),
    resetToDemo: () => update((state) => ({ ...state, tracks: demoTracks, playlists: demoPlaylists.map(normalizePlaylist), queue: demoTracks.map((track) => track.id), currentTrackId: demoTracks[0]?.id ?? '', isPlaying: false, position: 76, activeView: 'songs', selectedGenre: 'All', recentlyPlayed: [] })),
    selectTrack: (currentTrackId: string) => update((state) => ({ ...state, currentTrackId, position: state.currentTrackId === currentTrackId ? state.position : 0, isPlaying: false })),
    playTrack: (currentTrackId: string) => update((state) => ({ ...state, currentTrackId, isPlaying: true, position: state.currentTrackId === currentTrackId ? state.position : 0, queue: state.queue.includes(currentTrackId) ? state.queue : [currentTrackId, ...state.queue] })),
    playQueue: (trackIds: string[], startTrackId?: string) => update((state) => {
      const validTrackIds = trackIds.filter((trackId) => state.tracks.some((track) => track.id === trackId));
      const currentTrackId = startTrackId && validTrackIds.includes(startTrackId) ? startTrackId : (validTrackIds[0] ?? state.currentTrackId);
      return { ...state, queue: validTrackIds, currentTrackId, position: 0, isPlaying: Boolean(currentTrackId) };
    }),
    togglePlayback: () => update((state) => ({ ...state, isPlaying: !state.isPlaying })),
    previous: () => move(-1),
    next: () => move(1),
    playNext: (trackId: string) => update((state) => {
      const queue = state.queue.filter((id) => id !== trackId);
      const currentIndex = queue.indexOf(state.currentTrackId);
      const insertAt = currentIndex >= 0 ? currentIndex + 1 : 0;
      queue.splice(insertAt, 0, trackId);
      return { ...state, queue };
    }),
    addToQueue: (trackId: string) => update((state) => ({ ...state, queue: uniqueIds([...state.queue, trackId]) })),
    removeFromQueue: (trackId: string) => update((state) => ({ ...state, queue: state.queue.filter((id) => id !== trackId) })),
    toggleShuffle: () => update((state) => ({ ...state, shuffle: !state.shuffle })),
    cycleRepeat: () => update((state) => { const order: RepeatMode[] = ['off', 'all', 'one']; const next = order[(order.indexOf(state.repeat) + 1) % order.length]; return { ...state, repeat: next }; }),
    toggleFavorite: (trackId: string) => update((state) => ({ ...state, tracks: state.tracks.map((track) => track.id === trackId ? { ...track, favorite: !track.favorite } : track) })),
    setFavorites: (favoriteIds: string[]) => { const favorites = new Set(favoriteIds); update((state) => ({ ...state, tracks: state.tracks.map((track) => ({ ...track, favorite: favorites.has(track.id) })) })); },
    clearFavorites: () => update((state) => ({ ...state, tracks: state.tracks.map((track) => ({ ...track, favorite: false })) })),
    addToPlaylist: (playlistId: string, trackId: string) => update((state) => ({ ...state, playlists: state.playlists.map((playlist) => { if (playlist.id !== playlistId || playlist.trackIds.includes(trackId)) return playlist; const trackIds = [...playlist.trackIds, trackId]; return { ...playlist, trackIds, count: trackIds.length, updatedAt: Date.now() }; }) })),
    createPlaylist: (name: string) => update((state) => { const trimmedName = name.trim(); if (!trimmedName) return state; const playlist: Playlist = { id: `playlist-${Date.now()}`, name: trimmedName, trackIds: [], count: 0, updatedAt: Date.now() }; return { ...state, playlists: [...state.playlists, playlist] }; }),
    renamePlaylist: (playlistId: string, name: string) => update((state) => { const trimmedName = name.trim(); if (!trimmedName) return state; return { ...state, playlists: state.playlists.map((playlist) => playlist.id === playlistId ? { ...playlist, name: trimmedName, updatedAt: Date.now() } : playlist) }; }),
    deletePlaylist: (playlistId: string) => update((state) => ({ ...state, playlists: state.playlists.filter((playlist) => playlist.id !== playlistId) })),
    recordRecentlyPlayed: (trackId: string) => update((state) => ({ ...state, recentlyPlayed: [trackId, ...state.recentlyPlayed.filter((id) => id !== trackId)].slice(0, 30) })),
    clearRecentlyPlayed: () => update((state) => ({ ...state, recentlyPlayed: [] })),
    movePlaylistTrack: (playlistId: string, trackId: string, direction: -1 | 1) => update((state) => ({
      ...state,
      playlists: state.playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        const index = playlist.trackIds.indexOf(trackId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= playlist.trackIds.length) return playlist;
        const trackIds = [...playlist.trackIds];
        [trackIds[index], trackIds[target]] = [trackIds[target], trackIds[index]];
        return { ...playlist, trackIds, count: trackIds.length, updatedAt: Date.now() };
      })
    })),
    removeFromPlaylist: (playlistId: string, trackId: string) => update((state) => ({
      ...state,
      playlists: state.playlists.map((playlist) => playlist.id === playlistId ? normalizePlaylist({ ...playlist, trackIds: playlist.trackIds.filter((id) => id !== trackId), updatedAt: Date.now() }) : playlist)
    })),
    tick: () => update((state) => {
      if (!state.isPlaying) return state;
      const track = state.tracks.find((item) => item.id === state.currentTrackId);
      if (!track || track.duration <= 0) return state;
      if (state.position + 1 < track.duration) return { ...state, position: state.position + 1 };
      if (state.repeat === 'one') return { ...state, position: 0 };
      const nextTrackId = findNextQueueTrack(state, 1);
      if (!nextTrackId) return { ...state, isPlaying: false, position: 0 };
      return { ...state, currentTrackId: nextTrackId, position: 0, isPlaying: true };
    })
  };
}

export const player = createPlayerStore();

export const currentTrack = derived(player, ($player) => $player.tracks.find((track) => track.id === $player.currentTrackId));

export const filteredTracks = derived(player, ($player) => {
  const search = $player.search.trim().toLowerCase();
  return $player.tracks.filter((track) => {
    const matchesSearch = !search || [track.title, track.artist, track.album, track.genre, track.providerBadge].join(' ').toLowerCase().includes(search);
    const matchesGenre = $player.selectedGenre === 'All' || track.genre === $player.selectedGenre;
    return matchesSearch && matchesGenre;
  });
});

export const genres = derived(player, ($player) => ['All', ...Array.from(new Set($player.tracks.map((track) => track.genre).filter(Boolean)))]);

export const libraryStats = derived(player, ($player) => ({
  songs: $player.tracks.length,
  tracks: $player.tracks.length,
  albums: new Set($player.tracks.map((track) => `${track.artist}::${track.album}`)).size,
  artists: new Set($player.tracks.map((track) => track.artist)).size,
  favorites: $player.tracks.filter((track) => track.favorite).length,
  playlists: $player.playlists.length,
  local: $player.tracks.filter((track) => track.source === 'local').length,
  online: $player.tracks.filter((track) => track.source !== 'local').length
}));
