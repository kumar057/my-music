import { derived, writable } from 'svelte/store';
import { demoPlaylists, demoTracks } from '$lib/data/demoLibrary';
import type { LibraryView, PlayerState, Playlist, RepeatMode, Track } from '$lib/types/music';
import { clamp } from '$lib/utils/format';

const initialState: PlayerState = {
  tracks: [],
  playlists: [],
  queue: [],
  currentTrackId: '',
  isPlaying: false,
  position: 0,
  volume: 72,
  muted: false,
  repeat: 'all',
  shuffle: false,
  activeView: 'home',
  search: '',
  selectedGenre: 'All',
  recentlyPlayed: []
};

function uniqueIds(trackIds: string[]) {
  return Array.from(new Set(trackIds.filter(Boolean)));
}

function normalizePlaylist(playlist: Playlist): Playlist {
  const trackIds = uniqueIds(playlist.trackIds ?? []);

  return {
    ...playlist,
    trackIds,
    count: trackIds.length
  };
}

function normalizeTracks(tracks: Track[]) {
  return tracks.map((track) => ({
    ...track,
    artist: track.artist || 'Unknown Artist',
    album: track.album || 'Unknown Album',
    title: track.title || track.fileName || 'Untitled',
    favorite: Boolean(track.favorite)
  }));
}

function findNextQueueTrack(state: PlayerState, direction: 1 | -1) {
  if (state.queue.length === 0) return '';

  const currentIndex = state.queue.indexOf(state.currentTrackId);
  const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = fallbackIndex + direction;

  if (nextIndex < 0) {
    return state.queue[state.queue.length - 1] ?? '';
  }

  if (nextIndex >= state.queue.length) {
    return state.repeat === 'off' ? '' : (state.queue[0] ?? '');
  }

  return state.queue[nextIndex] ?? '';
}

function createPlayerStore() {
  const { subscribe, update } = writable<PlayerState>(initialState);

  const move = (direction: 1 | -1) =>
    update((state) => {
      const nextTrackId = findNextQueueTrack(state, direction);

      if (!nextTrackId) {
        return { ...state, isPlaying: false };
      }

      return {
        ...state,
        currentTrackId: nextTrackId,
        position: 0,
        isPlaying: true
      };
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
    setPosition: (position: number) =>
      update((state) => {
        const track = state.tracks.find((item) => item.id === state.currentTrackId);
        return { ...state, position: clamp(position, 0, track?.duration || Number.MAX_SAFE_INTEGER) };
      }),
    setTrackDuration: (trackId: string, duration: number) =>
      update((state) => ({
        ...state,
        tracks: state.tracks.map((track) =>
          track.id === trackId ? { ...track, duration: Math.max(0, Math.round(duration)) } : track
        )
      })),
    setLibrary: (tracks: Track[], playlists: Playlist[] = [], recentlyPlayed: string[] = []) =>
      update((state) => {
        const normalizedTracks = normalizeTracks(tracks);
        const trackIds = normalizedTracks.map((track) => track.id);
        const currentTrackId = trackIds.includes(state.currentTrackId)
          ? state.currentTrackId
          : (trackIds[0] ?? '');

        return {
          ...state,
          tracks: normalizedTracks,
          playlists: playlists.map(normalizePlaylist),
          queue: state.queue.filter((trackId) => trackIds.includes(trackId)),
          currentTrackId,
          isPlaying: false,
          position: 0,
          activeView: normalizedTracks.length > 0 ? 'songs' : 'home',
          selectedGenre: 'All',
          recentlyPlayed: recentlyPlayed.filter((trackId) => trackIds.includes(trackId))
        };
      }),
    loadTracks: (tracks: Track[]) =>
      update((state) => {
        const normalizedTracks = normalizeTracks(tracks);
        const trackIds = normalizedTracks.map((track) => track.id);

        return {
          ...state,
          tracks: normalizedTracks,
          queue: trackIds,
          currentTrackId: trackIds[0] ?? '',
          isPlaying: false,
          position: 0,
          activeView: normalizedTracks.length > 0 ? 'songs' : 'home',
          selectedGenre: 'All',
          recentlyPlayed: state.recentlyPlayed.filter((trackId) => trackIds.includes(trackId))
        };
      }),
    appendTracks: (tracks: Track[]) =>
      update((state) => {
        const existingIds = new Set(state.tracks.map((track) => track.id));
        const incomingTracks = normalizeTracks(tracks).filter((track) => !existingIds.has(track.id));
        const nextTracks = [...state.tracks, ...incomingTracks];
        const nextIds = nextTracks.map((track) => track.id);

        return {
          ...state,
          tracks: nextTracks,
          queue: state.queue.length > 0
            ? uniqueIds([...state.queue, ...incomingTracks.map((track) => track.id)])
            : nextIds,
          currentTrackId: state.currentTrackId || nextIds[0] || '',
          activeView: nextTracks.length > 0 ? 'songs' : 'home'
        };
      }),
    clearLibrary: () =>
      update((state) => ({
        ...state,
        tracks: [],
        playlists: [],
        queue: [],
        currentTrackId: '',
        isPlaying: false,
        position: 0,
        activeView: 'home',
        selectedGenre: 'All',
        recentlyPlayed: []
      })),
    clearLocalTracks: () =>
      update((state) => {
        const tracks = state.tracks.filter((track) => track.source !== 'local');
        const trackIds = new Set(tracks.map((track) => track.id));

        return {
          ...state,
          tracks,
          playlists: state.playlists.map((playlist) =>
            normalizePlaylist({
              ...playlist,
              trackIds: playlist.trackIds.filter((trackId) => trackIds.has(trackId))
            })
          ),
          queue: state.queue.filter((trackId) => trackIds.has(trackId)),
          currentTrackId: trackIds.has(state.currentTrackId) ? state.currentTrackId : (tracks[0]?.id ?? ''),
          isPlaying: trackIds.has(state.currentTrackId) ? state.isPlaying : false,
          position: trackIds.has(state.currentTrackId) ? state.position : 0,
          activeView: tracks.length > 0 ? state.activeView : 'home',
          recentlyPlayed: state.recentlyPlayed.filter((trackId) => trackIds.has(trackId))
        };
      }),
    resetToDemo: () =>
      update((state) => ({
        ...state,
        tracks: demoTracks,
        playlists: demoPlaylists.map(normalizePlaylist),
        queue: demoTracks.map((track) => track.id),
        currentTrackId: demoTracks[0]?.id ?? '',
        isPlaying: false,
        position: 76,
        activeView: 'songs',
        selectedGenre: 'All',
        recentlyPlayed: []
      })),
    selectTrack: (currentTrackId: string) =>
      update((state) => ({
        ...state,
        currentTrackId,
        position: state.currentTrackId === currentTrackId ? state.position : 0,
        isPlaying: false
      })),
    seek: (position: number) =>
      update((state) => {
        const track = state.tracks.find((item) => item.id === state.currentTrackId);
        return { ...state, position: clamp(position, 0, track?.duration ?? 0) };
      }),
    playTrack: (currentTrackId: string) =>
      update((state) => ({
        ...state,
        currentTrackId,
        isPlaying: true,
        position: state.currentTrackId === currentTrackId ? state.position : 0,
        queue: state.queue.includes(currentTrackId) ? state.queue : [currentTrackId, ...state.queue]
      })),
    playQueue: (trackIds: string[], startTrackId?: string) =>
      update((state) => {
        const validTrackIds = trackIds.filter((trackId) => state.tracks.some((track) => track.id === trackId));
        const currentTrackId =
          startTrackId && validTrackIds.includes(startTrackId)
            ? startTrackId
            : (validTrackIds[0] ?? state.currentTrackId);

        return {
          ...state,
          queue: validTrackIds,
          currentTrackId,
          position: 0,
          isPlaying: Boolean(currentTrackId)
        };
      }),
    togglePlayback: () => update((state) => ({ ...state, isPlaying: !state.isPlaying })),
    previous: () => move(-1),
    next: () => move(1),
    toggleShuffle: () => update((state) => ({ ...state, shuffle: !state.shuffle })),
    cycleRepeat: () =>
      update((state) => {
        const order: RepeatMode[] = ['off', 'all', 'one'];
        const next = order[(order.indexOf(state.repeat) + 1) % order.length];
        return { ...state, repeat: next };
      }),
    toggleFavorite: (trackId: string) =>
      update((state) => ({
        ...state,
        tracks: state.tracks.map((track) =>
          track.id === trackId ? { ...track, favorite: !track.favorite } : track
        )
      })),
    setFavorites: (favoriteIds: string[]) =>
      update((state) => {
        const favorites = new Set(favoriteIds);
        return {
          ...state,
          tracks: state.tracks.map((track) => ({ ...track, favorite: favorites.has(track.id) }))
        };
      }),
    clearFavorites: () =>
      update((state) => ({
        ...state,
        tracks: state.tracks.map((track) => ({ ...track, favorite: false }))
      })),
    addToQueue: (trackId: string) =>
      update((state) => ({
        ...state,
        queue: state.queue.includes(trackId) ? state.queue : [...state.queue, trackId]
      })),
    playNext: (trackId: string) =>
      update((state) => {
        const currentIndex = state.queue.indexOf(state.currentTrackId);
        const nextQueue = state.queue.filter((queuedId) => queuedId !== trackId);
        const insertAt = currentIndex === -1 ? 1 : currentIndex + 1;
        nextQueue.splice(insertAt, 0, trackId);

        return { ...state, queue: nextQueue };
      }),
    removeFromQueue: (trackId: string) =>
      update((state) => {
        const nextQueue = state.queue.filter((queuedId) => queuedId !== trackId);
        const currentTrackId = state.currentTrackId === trackId ? (nextQueue[0] ?? '') : state.currentTrackId;

        return {
          ...state,
          queue: nextQueue,
          currentTrackId,
          isPlaying: state.currentTrackId === trackId ? false : state.isPlaying,
          position: state.currentTrackId === trackId ? 0 : state.position
        };
      }),
    recordRecentlyPlayed: (trackId: string) =>
      update((state) => ({
        ...state,
        recentlyPlayed: [trackId, ...state.recentlyPlayed.filter((recentId) => recentId !== trackId)].slice(0, 100),
        tracks: state.tracks.map((track) =>
          track.id === trackId ? { ...track, playedAt: Date.now() } : track
        )
      })),
    clearRecentlyPlayed: () =>
      update((state) => ({
        ...state,
        recentlyPlayed: [],
        tracks: state.tracks.map((track) => ({ ...track, playedAt: undefined }))
      })),
    createPlaylist: (name: string) =>
      update((state) => {
        const now = Date.now();
        const playlist: Playlist = {
          id: `playlist-${now.toString(36)}`,
          name: name.trim() || 'New Playlist',
          trackIds: [],
          createdAt: now,
          updatedAt: now,
          count: 0
        };

        return { ...state, playlists: [...state.playlists, playlist] };
      }),
    renamePlaylist: (playlistId: string, name: string) =>
      update((state) => ({
        ...state,
        playlists: state.playlists.map((playlist) =>
          playlist.id === playlistId
            ? { ...playlist, name: name.trim() || playlist.name, updatedAt: Date.now() }
            : playlist
        )
      })),
    deletePlaylist: (playlistId: string) =>
      update((state) => ({
        ...state,
        playlists: state.playlists.filter((playlist) => playlist.id !== playlistId)
      })),
    addToPlaylist: (playlistId: string, trackId: string) =>
      update((state) => ({
        ...state,
        playlists: state.playlists.map((playlist) =>
          playlist.id === playlistId
            ? normalizePlaylist({
                ...playlist,
                trackIds: uniqueIds([...playlist.trackIds, trackId]),
                updatedAt: Date.now()
              })
            : playlist
        )
      })),
    removeFromPlaylist: (playlistId: string, trackId: string) =>
      update((state) => ({
        ...state,
        playlists: state.playlists.map((playlist) =>
          playlist.id === playlistId
            ? normalizePlaylist({
                ...playlist,
                trackIds: playlist.trackIds.filter((playlistTrackId) => playlistTrackId !== trackId),
                updatedAt: Date.now()
              })
            : playlist
        )
      })),
    movePlaylistTrack: (playlistId: string, trackId: string, direction: 1 | -1) =>
      update((state) => ({
        ...state,
        playlists: state.playlists.map((playlist) => {
          if (playlist.id !== playlistId) return playlist;

          const trackIds = [...playlist.trackIds];
          const index = trackIds.indexOf(trackId);
          const nextIndex = index + direction;

          if (index === -1 || nextIndex < 0 || nextIndex >= trackIds.length) {
            return playlist;
          }

          const [item] = trackIds.splice(index, 1);
          trackIds.splice(nextIndex, 0, item);

          return normalizePlaylist({ ...playlist, trackIds, updatedAt: Date.now() });
        })
      })),
    tick: () =>
      update((state) => {
        if (!state.isPlaying) return state;

        const track = state.tracks.find((item) => item.id === state.currentTrackId);
        if (!track) return state;
        if (track.source === 'local' || track.previewUrl) return state;

        if (state.position + 1 >= track.duration) {
          if (state.repeat === 'one') {
            return { ...state, position: 0 };
          }

          const nextTrackId = findNextQueueTrack(state, 1);

          if (!nextTrackId) {
            return { ...state, position: track.duration, isPlaying: false };
          }

          return {
            ...state,
            currentTrackId: nextTrackId,
            position: 0
          };
        }

        return { ...state, position: state.position + 1 };
      })
  };
}

export const player = createPlayerStore();

export const currentTrack = derived(player, ($player) =>
  $player.tracks.find((track) => track.id === $player.currentTrackId)
);

export const genres = derived(player, ($player) => [
  'All',
  ...Array.from(new Set($player.tracks.map((track) => track.genre).filter(Boolean))).sort()
]);

function fuzzyMatch(value: string, query: string) {
  if (!query) return true;

  const source = value.toLowerCase();

  if (source.includes(query)) {
    return true;
  }

  let queryIndex = 0;

  for (const character of source) {
    if (character === query[queryIndex]) {
      queryIndex += 1;
    }

    if (queryIndex === query.length) {
      return true;
    }
  }

  return false;
}

export const filteredTracks = derived(player, ($player) => {
  const query = $player.search.trim().toLowerCase();

  return $player.tracks.filter((track) => {
    const matchesGenre = $player.selectedGenre === 'All' || track.genre === $player.selectedGenre;
    const searchable = [
      track.title,
      track.artist,
      track.album,
      track.genre,
      track.fileType,
      track.fileName,
      track.providerBadge
    ].join(' ');

    return matchesGenre && fuzzyMatch(searchable, query);
  });
});

export const libraryStats = derived(player, ($player) => {
  const albums = new Set($player.tracks.map((track) => track.album)).size;
  const artists = new Set($player.tracks.map((track) => track.artist)).size;
  const favorites = $player.tracks.filter((track) => track.favorite).length;
  const local = $player.tracks.filter((track) => track.source === 'local').length;
  const online = $player.tracks.length - local;

  return {
    tracks: $player.tracks.length,
    local,
    online,
    albums,
    artists,
    favorites,
    playlists: $player.playlists.length,
    recent: $player.recentlyPlayed.length
  };
});

export const recentlyPlayedTracks = derived(player, ($player) =>
  $player.recentlyPlayed
    .map((trackId) => $player.tracks.find((track) => track.id === trackId))
    .filter(Boolean) as Track[]
);
