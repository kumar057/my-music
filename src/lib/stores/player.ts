import { derived, writable } from 'svelte/store';
import { demoPlaylists, demoTracks } from '$lib/data/demoLibrary';
import type { LibraryView, PlayerState, RepeatMode, Track } from '$lib/types/music';
import { clamp } from '$lib/utils/format';

const initialState: PlayerState = {
  tracks: demoTracks,
  playlists: demoPlaylists,
  queue: demoTracks.map((track) => track.id),
  currentTrackId: demoTracks[0]?.id ?? '',
  isPlaying: false,
  position: 76,
  volume: 72,
  repeat: 'all',
  shuffle: false,
  activeView: 'songs',
  search: '',
  selectedGenre: 'All'
};

function createPlayerStore() {
  const { subscribe, update } = writable<PlayerState>(initialState);

  const move = (direction: 1 | -1) =>
    update((state) => {
      const currentIndex = state.queue.indexOf(state.currentTrackId);
      const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (fallbackIndex + direction + state.queue.length) % state.queue.length;
      const nextTrackId = state.queue[nextIndex] ?? state.currentTrackId;

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
    loadTracks: (tracks: Track[]) =>
      update((state) => ({
        ...state,
        tracks,
        queue: tracks.map((track) => track.id),
        currentTrackId: tracks[0]?.id ?? '',
        isPlaying: false,
        position: 0,
        activeView: 'songs',
        selectedGenre: 'All'
      })),
    resetToDemo: () =>
      update((state) => ({
        ...state,
        tracks: demoTracks,
        queue: demoTracks.map((track) => track.id),
        currentTrackId: demoTracks[0]?.id ?? '',
        isPlaying: false,
        position: 76,
        activeView: 'songs',
        selectedGenre: 'All'
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
        position: state.currentTrackId === currentTrackId ? state.position : 0
      })),
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
    tick: () =>
      update((state) => {
        if (!state.isPlaying) return state;

        const track = state.tracks.find((item) => item.id === state.currentTrackId);
        if (!track) return state;
        if (track.source === 'local') return state;

        if (state.position + 1 >= track.duration) {
          if (state.repeat === 'one') {
            return { ...state, position: 0 };
          }

          const currentIndex = state.queue.indexOf(state.currentTrackId);
          const nextIndex = currentIndex + 1;

          if (nextIndex >= state.queue.length && state.repeat === 'off') {
            return { ...state, position: track.duration, isPlaying: false };
          }

          return {
            ...state,
            currentTrackId: state.queue[nextIndex % state.queue.length] ?? state.currentTrackId,
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
  ...Array.from(new Set($player.tracks.map((track) => track.genre))).sort()
]);

export const filteredTracks = derived(player, ($player) => {
  const query = $player.search.trim().toLowerCase();

  return $player.tracks.filter((track) => {
    const matchesGenre = $player.selectedGenre === 'All' || track.genre === $player.selectedGenre;
    const matchesQuery =
      query.length === 0 ||
      [track.title, track.artist, track.album, track.genre, track.fileType]
        .join(' ')
        .toLowerCase()
        .includes(query);

    return matchesGenre && matchesQuery;
  });
});

export const libraryStats = derived(player, ($player) => {
  const albums = new Set($player.tracks.map((track) => track.album)).size;
  const artists = new Set($player.tracks.map((track) => track.artist)).size;
  const favorites = $player.tracks.filter((track) => track.favorite).length;

  return {
    tracks: $player.tracks.length,
    albums,
    artists,
    favorites
  };
});
