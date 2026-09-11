<script lang="ts">
  import {
    Album,
    AlertCircle,
    BadgeCheck,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock3,
    Compass,
    Disc3,
    ExternalLink,
    FileMusic,
    FolderOpen,
    Globe2,
    HardDrive,
    Heart,
    Home,
    Library,
    ListMusic,
    ListPlus,
    LoaderCircle,
    Maximize2,
    MicVocal,
    Minus,
    Pause,
    Pencil,
    Play,
    Plus,
    Radio,
    Repeat,
    Repeat1,
    Search,
    Settings,
    Shuffle,
    SkipBack,
    SkipForward,
    Sparkles,
    Star,
    Trash2,
    UploadCloud,
    Volume2,
    VolumeX,
    WifiOff,
    X
  } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import {
    SUPPORTED_AUDIO_EXTENSIONS,
    canScanFolders,
    canUseDirectoryInput,
    clearStoredTracks,
    createPlayableUrl,
    hasIndexedDb,
    restoreLibrarySnapshot,
    revokePlayableUrls,
    saveFavoriteIds,
    saveProviderTracks,
    saveRecentlyPlayed,
    saveStoredPlaylists,
    scanDroppedItems,
    scanFiles,
    scanFolder,
    updateStoredTrack
  } from '$lib/local/localLibrary';
  import { toPlayerTrack } from '$lib/music/normalizer';
  import { getProviderStatuses, searchMusic } from '$lib/music/search';
  import {
    completeSpotifyLoginFromUrl,
    disconnectSpotify,
    startSpotifyLogin
  } from '$lib/music/providers/spotify';
  import { connectAppleMusic, disconnectAppleMusic } from '$lib/music/providers/appleMusic';
  import type {
    MusicAlbum,
    MusicArtist,
    MusicTrack,
    ProviderStatus,
    UnifiedSearchResult
  } from '$lib/music/types';
  import { currentTrack, filteredTracks, genres, libraryStats, player } from '$lib/stores/player';
  import type { LibraryView, PlayerState, Playlist, Track } from '$lib/types/music';
  import { formatDuration, formatFileSize } from '$lib/utils/format';

  type Toast = {
    id: number;
    message: string;
    tone: 'success' | 'error' | 'info';
  };

  type AlbumGroup = {
    id: string;
    name: string;
    artist: string;
    tracks: Track[];
    duration: number;
    coverTrack: Track;
  };

  type SearchTab = 'all' | 'songs' | 'artists' | 'albums';
  type ThemeMode = 'dark' | 'light' | 'system';

  type Ripple = {
    id: number;
    x: number;
    y: number;
  };

  type DiscoveryShelf = {
    id: 'trending' | 'recommended' | 'new';
    title: string;
    query: string;
    tracks: MusicTrack[];
    loading: boolean;
  };

  const emptySearchResult: UnifiedSearchResult = {
    query: '',
    tracks: [],
    artists: [],
    albums: [],
    providerResults: [],
    generatedAt: 0
  };

  const searchTabs: { id: SearchTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'songs', label: 'Songs' },
    { id: 'artists', label: 'Artists' },
    { id: 'albums', label: 'Albums' }
  ];

  const themeModes: { id: ThemeMode; label: string }[] = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'system', label: 'System' }
  ];

  const navItems: { id: LibraryView; label: string; icon: typeof Library }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'discover', label: 'Discover', icon: Compass },
    { id: 'songs', label: 'Songs', icon: ListMusic },
    { id: 'artists', label: 'Artists', icon: MicVocal },
    { id: 'albums', label: 'Albums', icon: Album },
    { id: 'playlists', label: 'Playlists', icon: Library },
    { id: 'favorites', label: 'Favorites', icon: Heart },
    { id: 'recent', label: 'Recently Played', icon: Clock3 },
    { id: 'local', label: 'Local Music', icon: HardDrive },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const audioAccept = `audio/*,${SUPPORTED_AUDIO_EXTENSIONS.map((extension) => `.${extension}`).join(',')}`;

  let audioElement: HTMLAudioElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  let audioTrackId = '';
  let fileInputMode: 'songs' | 'folder' = 'songs';
  let isImportOpen = false;
  let isImporting = false;
  let isDragOver = false;
  let importCurrent = 0;
  let importTotal = 0;
  let importFileName = '';
  let scanStatus = '';
  let scanError = '';
  let toasts: Toast[] = [];
  let toastId = 0;
  let rippleId = 0;
  let hydrated = false;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchAbortController: AbortController | undefined;
  let visualFrame = 0;
  let selectedPlaylistId = '';
  let newPlaylistName = '';
  let renamePlaylistId = '';
  let renamePlaylistName = '';
  let onlineSearchQuery = '';
  let searchTab: SearchTab = 'all';
  let searchResult = emptySearchResult;
  let isSearching = false;
  let providerStatuses: ProviderStatus[] = [];
  let discoveryShelves: DiscoveryShelf[] = [
    { id: 'trending', title: 'Trending Music', query: 'global hits', tracks: [], loading: false },
    { id: 'recommended', title: 'Recommended Music', query: 'indie electronic', tracks: [], loading: false },
    { id: 'new', title: 'New Releases', query: 'new music releases', tracks: [], loading: false }
  ];
  let showIntro = false;
  let isImmersive = false;
  let glassBreak = false;
  let ripples: Ripple[] = [];
  let visualLevel = 0.12;
  let motionX = 0;
  let motionY = 0;
  let youtubeEmbedUrl = '';
  let themeMode: ThemeMode = 'system';
  let analyser: AnalyserNode | undefined;
  let frequencyData: Uint8Array<ArrayBuffer> | undefined;
  let audioContext: AudioContext | undefined;
  let mediaSource: MediaElementAudioSourceNode | undefined;
  let browserCapabilities = {
    indexedDb: false,
    folderPicker: false,
    directoryInput: false
  };

  onMount(() => {
    const timer = window.setInterval(() => player.tick(), 1000);
    const unsubscribe = player.subscribe((state) => schedulePersistence(state));
    showIntro = window.localStorage.getItem('myMusicIntroSeen') !== 'true';
    themeMode = (window.localStorage.getItem('myMusicTheme') as ThemeMode | null) ?? 'system';
    applyThemeMode(themeMode);
    providerStatuses = getProviderStatuses();

    browserCapabilities = {
      indexedDb: hasIndexedDb(),
      folderPicker: canScanFolders(),
      directoryInput: canUseDirectoryInput()
    };

    completeSpotifyLoginFromUrl(new URL(window.location.href))
      .then((status) => {
        providerStatuses = getProviderStatuses();
        if (status) {
          pushToast('Spotify connected.', 'success');
          void loadDiscoveryShelves();
        }
      })
      .catch((error: unknown) => {
        providerStatuses = getProviderStatuses();
        pushToast(getErrorMessage(error), 'error');
      });

    restoreLibrarySnapshot()
      .then((snapshot) => {
        player.setLibrary(snapshot.tracks, snapshot.playlists, snapshot.recentlyPlayed);
        player.setFavorites(snapshot.favoriteIds);

        if (snapshot.tracks.length > 0) {
          scanStatus = `${snapshot.tracks.length} local songs loaded`;
        }
      })
      .catch((error: unknown) => {
        scanError = getErrorMessage(error);
      })
      .finally(() => {
        hydrated = true;
      });

    window.addEventListener('keydown', handleKeyboard);
    visualFrame = window.requestAnimationFrame(updateVisualizer);
    void loadDiscoveryShelves();

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', handleKeyboard);
      unsubscribe();
      revokePlayableUrls();
      if (persistTimer) window.clearTimeout(persistTimer);
      if (searchTimer) window.clearTimeout(searchTimer);
      searchAbortController?.abort();
      window.cancelAnimationFrame(visualFrame);
      void audioContext?.close();
    };
  });

  function schedulePersistence(state: PlayerState) {
    if (!hydrated) return;

    if (persistTimer) {
      window.clearTimeout(persistTimer);
    }

    persistTimer = window.setTimeout(() => {
      const favoriteIds = state.tracks.filter((track) => track.favorite).map((track) => track.id);
      void saveFavoriteIds(favoriteIds);
      void saveStoredPlaylists(state.playlists);
      void saveRecentlyPlayed(state.recentlyPlayed);
      void saveProviderTracks(state.tracks);
    }, 250);
  }

  function coverStyle(track: Track | undefined) {
    const cover = track?.cover ?? { from: '#d7ff73', via: '#4ab5a4', to: '#1e4b5f' };

    if (cover.imageDataUrl) {
      return `background-image:
        linear-gradient(180deg, rgb(0 0 0 / 0.05), rgb(0 0 0 / 0.22)),
        url("${cover.imageDataUrl}");
        background-size: cover;
        background-position: center;`;
    }

    return `background:
      linear-gradient(135deg, ${cover.from}, ${cover.via} 46%, ${cover.to}),
      radial-gradient(circle at 30% 18%, rgb(255 255 255 / 0.4), transparent 28%);`;
  }

  function handleGlobalSearchInput(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    onlineSearchQuery = value;
    player.setSearch(value);

    if (searchTimer) {
      window.clearTimeout(searchTimer);
    }

    searchTimer = window.setTimeout(() => {
      void runUnifiedSearch(value);
    }, 420);
  }

  async function runUnifiedSearch(query: string) {
    const trimmed = query.trim();
    searchAbortController?.abort();

    if (!trimmed) {
      isSearching = false;
      searchResult = emptySearchResult;
      providerStatuses = getProviderStatuses();
      return;
    }

    searchAbortController = new AbortController();
    isSearching = true;

    try {
      searchResult = await searchMusic(trimmed, {
        signal: searchAbortController.signal,
        limit: 10
      });
      providerStatuses = searchResult.providerResults.map((result) => result.status);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      pushToast(getErrorMessage(error), 'error');
      providerStatuses = getProviderStatuses();
    } finally {
      isSearching = false;
    }
  }

  async function loadDiscoveryShelves() {
    const statuses = getProviderStatuses();
    providerStatuses = statuses;

    if (!statuses.some((status) => status.state === 'configured' || status.state === 'connected')) {
      return;
    }

    discoveryShelves = discoveryShelves.map((shelf) => ({ ...shelf, loading: true }));

    const settled = await Promise.allSettled(
      discoveryShelves.map((shelf) => searchMusic(shelf.query, { limit: 8 }))
    );

    discoveryShelves = discoveryShelves.map((shelf, index) => {
      const result = settled[index];

      return {
        ...shelf,
        loading: false,
        tracks: result.status === 'fulfilled' ? result.value.tracks.slice(0, 8) : []
      };
    });
  }

  function providerStatusTone(status: ProviderStatus) {
    if (status.state === 'connected' || status.state === 'configured') return 'text-[#d7ff73]';
    if (status.state === 'not_configured' || status.state === 'not_connected') return 'text-zinc-400';
    return 'text-[#ffafcc]';
  }

  function handleSeek(event: Event) {
    const position = Number((event.currentTarget as HTMLInputElement).value);

    if (($currentTrack?.source === 'local' || $currentTrack?.previewUrl) && audioElement) {
      audioElement.currentTime = position;
    }

    player.seek(position);
  }

  function handleVolume(event: Event) {
    player.setVolume(Number((event.currentTarget as HTMLInputElement).value));
  }

  function openAddMusic() {
    scanError = '';
    isImportOpen = true;
  }

  function closeAddMusic() {
    if (isImporting) return;
    isImportOpen = false;
    isDragOver = false;
  }

  function openFilePicker(mode: 'songs' | 'folder') {
    if (!fileInput) return;

    scanError = '';
    fileInputMode = mode;
    fileInput.value = '';

    if (mode === 'folder') {
      fileInput.setAttribute('webkitdirectory', '');
      fileInput.setAttribute('directory', '');
    } else {
      fileInput.removeAttribute('webkitdirectory');
      fileInput.removeAttribute('directory');
    }

    fileInput.click();
  }

  async function scanLocalFolder() {
    if (canScanFolders()) {
      await runImport((onProgress) =>
        scanFolder({
          existingTracks: $player.tracks,
          onProgress
        })
      );
      return;
    }

    if (canUseDirectoryInput()) {
      openFilePicker('folder');
      pushToast('Using browser folder fallback.', 'info');
      return;
    }

    scanError = 'Your browser does not support folder selection. Select individual files instead.';
    pushToast(scanError, 'error');
  }

  async function handleFileInputChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    if (files.length === 0) return;

    await runImport((onProgress) =>
      scanFiles(files, {
        existingTracks: $player.tracks,
        onProgress
      })
    );

    input.value = '';
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;

    if (!event.dataTransfer) return;

    await runImport((onProgress) =>
      scanDroppedItems(event.dataTransfer as DataTransfer, {
        existingTracks: $player.tracks,
        onProgress
      })
    );
  }

  async function runImport(
    importer: (
      onProgress: (progress: { current: number; total: number; fileName?: string }) => void
    ) => Promise<{
      tracks: Track[];
      addedTracks: Track[];
      addedCount: number;
      duplicateCount: number;
      unsupportedFiles: string[];
      limitedMetadataCount: number;
    }>
  ) {
    if (!hasIndexedDb()) {
      scanError = 'IndexedDB is not available, so this browser cannot save a local music library.';
      pushToast(scanError, 'error');
      return;
    }

    isImporting = true;
    scanError = '';
    scanStatus = 'Importing...';
    importCurrent = 0;
    importTotal = 0;
    importFileName = '';

    try {
      const result = await importer((progress) => {
        importCurrent = progress.current;
        importTotal = progress.total;
        importFileName = progress.fileName ?? '';
      });

      player.setLibrary(result.tracks, $player.playlists, $player.recentlyPlayed);

      const parts = [`${result.addedCount} songs added`];

      if (result.duplicateCount > 0) {
        parts.push(`${result.duplicateCount} duplicates skipped`);
      }

      if (result.unsupportedFiles.length > 0) {
        parts.push(`${result.unsupportedFiles.length} unsupported`);
      }

      if (result.limitedMetadataCount > 0) {
        parts.push(`${result.limitedMetadataCount} with limited metadata`);
      }

      scanStatus = parts.join(', ');
      pushToast(scanStatus, result.addedCount > 0 ? 'success' : 'info');
      isImportOpen = result.addedCount === 0 && result.unsupportedFiles.length > 0;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        scanStatus = 'Import canceled';
      } else {
        scanError = getErrorMessage(error);
        pushToast(scanError, 'error');
      }
    } finally {
      isImporting = false;
    }
  }

  async function clearLocalLibrary() {
    stopAudio();
    await clearStoredTracks();
    player.clearLocalTracks();
    scanStatus = '';
    scanError = '';
    pushToast('Local library cleared.', 'info');
  }

  async function toggleTrack(track: Track) {
    if (track.id === $player.currentTrackId && $player.isPlaying) {
      pausePlayback();
      return;
    }

    await playTrack(track);
  }

  async function playTrack(track: Track | undefined) {
    if (!track) return;

    if (track.playbackSupported === false) {
      scanError = 'Unsupported audio format in this browser.';
      pushToast(scanError, 'error');
      return;
    }

    if (track.source === 'local') {
      await playLocalTrack(track);
      return;
    }

    if (track.previewUrl) {
      await playPreviewTrack(track);
      return;
    }

    if (track.embedUrl && track.playbackMode === 'YOUTUBE') {
      stopAudio();
      youtubeEmbedUrl = track.embedUrl;
      player.playTrack(track.id);
      player.recordRecentlyPlayed(track.id);
      pushToast('Playing through the official YouTube embed.', 'info');
      return;
    }

    stopAudio();
    player.selectTrack(track.id);
    pushToast(providerOpenMessage(track), 'info');
  }

  async function togglePlayback() {
    if (!$currentTrack) return;

    if ($player.isPlaying) {
      pausePlayback();
      return;
    }

    await playTrack($currentTrack);
  }

  async function playAdjacent(direction: 1 | -1) {
    const nextTrack = getAdjacentTrack(direction);
    await playTrack(nextTrack);
  }

  async function playLocalTrack(track: Track) {
    if (!audioElement) return;

    try {
      player.selectTrack(track.id);
      const url = await createPlayableUrl(track);

      if (!url) {
        throw new Error('This local song needs to be imported again.');
      }

      if (audioTrackId !== track.id || audioElement.src !== url) {
        audioElement.src = url;
        audioTrackId = track.id;
      }

      audioElement.volume = $player.volume / 100;
      audioElement.muted = $player.muted;
      await audioElement.play();
      connectAudioAnalyzer();
      player.setPlaying(true);
      player.recordRecentlyPlayed(track.id);
    } catch (error: unknown) {
      player.setPlaying(false);
      scanError = getErrorMessage(error);
      pushToast(scanError, 'error');
    }
  }

  async function playPreviewTrack(track: Track) {
    if (!audioElement || !track.previewUrl) return;

    try {
      youtubeEmbedUrl = '';
      player.selectTrack(track.id);

      if (audioTrackId !== track.id || audioElement.src !== track.previewUrl) {
        audioElement.crossOrigin = 'anonymous';
        audioElement.src = track.previewUrl;
        audioTrackId = track.id;
      }

      audioElement.volume = $player.volume / 100;
      audioElement.muted = $player.muted;
      await audioElement.play();
      connectAudioAnalyzer();
      player.setPlaying(true);
      player.recordRecentlyPlayed(track.id);
    } catch (error: unknown) {
      player.setPlaying(false);
      scanError = getErrorMessage(error);
      pushToast(scanError, 'error');
    }
  }

  function pausePlayback() {
    if ($currentTrack?.source === 'local' || $currentTrack?.previewUrl) {
      audioElement?.pause();
    }

    player.setPlaying(false);
  }

  function stopAudio() {
    audioElement?.pause();

    if (audioElement) {
      audioElement.removeAttribute('src');
      audioElement.load();
    }

    audioTrackId = '';
    youtubeEmbedUrl = '';
    player.setPlaying(false);
  }

  function getAdjacentTrack(direction: 1 | -1) {
    if ($player.queue.length === 0) return undefined;

    if ($player.shuffle && direction === 1 && $player.queue.length > 1) {
      const candidates = $player.queue.filter((trackId) => trackId !== $player.currentTrackId);
      const nextId = candidates[Math.floor(Math.random() * candidates.length)];
      return $player.tracks.find((track) => track.id === nextId);
    }

    const currentIndex = $player.queue.indexOf($player.currentTrackId);
    const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = fallbackIndex + direction;

    if (nextIndex < 0) {
      return $player.tracks.find((track) => track.id === $player.queue[$player.queue.length - 1]);
    }

    if (nextIndex >= $player.queue.length) {
      if ($player.repeat === 'off') {
        return undefined;
      }

      return $player.tracks.find((track) => track.id === $player.queue[0]);
    }

    return $player.tracks.find((track) => track.id === $player.queue[nextIndex]);
  }

  async function handleAudioEnded() {
    if ($player.repeat === 'one' && audioElement) {
      audioElement.currentTime = 0;
      await audioElement.play();
      return;
    }

    const nextTrack = getAdjacentTrack(1);

    if (nextTrack) {
      await playTrack(nextTrack);
    } else {
      player.setPlaying(false);
    }
  }

  async function handleAudioLoadedMetadata() {
    if (!audioElement || !audioTrackId || !Number.isFinite(audioElement.duration)) return;

    player.setTrackDuration(audioTrackId, audioElement.duration);
    const track = $player.tracks.find((item) => item.id === audioTrackId);

    if (track) {
      await updateStoredTrack({ ...track, duration: Math.round(audioElement.duration) });
    }
  }

  function handleAudioTimeUpdate() {
    if (!audioElement || audioTrackId !== $player.currentTrackId) return;
    player.setPosition(audioElement.currentTime);
  }

  function handleKeyboard(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;

    if (event.key === 'Escape' && isImmersive) {
      isImmersive = false;
      return;
    }

    if (target?.closest('input, textarea, select, button')) {
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      void togglePlayback();
    }

    if (event.code === 'ArrowRight' && audioElement && ($currentTrack?.source === 'local' || $currentTrack?.previewUrl)) {
      audioElement.currentTime = Math.min(audioElement.duration || 0, audioElement.currentTime + 5);
    }

    if (event.code === 'ArrowLeft' && audioElement && ($currentTrack?.source === 'local' || $currentTrack?.previewUrl)) {
      audioElement.currentTime = Math.max(0, audioElement.currentTime - 5);
    }

    if (event.code === 'ArrowUp') {
      event.preventDefault();
      player.setVolume($player.volume + 5);
    }

    if (event.code === 'ArrowDown') {
      event.preventDefault();
      player.setVolume($player.volume - 5);
    }

    if (event.key.toLowerCase() === 'm') {
      player.toggleMuted();
    }

    if (event.key.toLowerCase() === 'f' && $currentTrack) {
      toggleFavorite($currentTrack);
    }
  }

  function playTrackIds(trackIds: string[]) {
    const firstTrack = trackIds
      .map((trackId) => $player.tracks.find((track) => track.id === trackId))
      .find(Boolean);

    if (!firstTrack) return;

    player.playQueue(trackIds, firstTrack.id);
    void playTrack(firstTrack);
  }

  function ensureProviderTrack(result: MusicTrack) {
    const incomingTrack = toPlayerTrack(result);
    const existingTrack = $player.tracks.find((track) => track.id === incomingTrack.id);

    if (!existingTrack) {
      player.appendTracks([incomingTrack]);
    }

    return existingTrack ?? incomingTrack;
  }

  async function playProviderResult(result: MusicTrack) {
    const track = ensureProviderTrack(result);
    await playTrack(track);
  }

  function addProviderToQueue(result: MusicTrack) {
    const track = ensureProviderTrack(result);
    addToQueue(track);
  }

  function playProviderNext(result: MusicTrack) {
    const track = ensureProviderTrack(result);
    playNext(track);
  }

  function addProviderToPlaylist(playlistId: string, result: MusicTrack) {
    const track = ensureProviderTrack(result);
    addTrackToPlaylist(playlistId, track);
  }

  function openExternalUrl(url: string | undefined) {
    if (!url || typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function providerOpenMessage(track: Track) {
    if (track.source === 'spotify') return 'Connect Spotify or open the track in Spotify for full playback.';
    if (track.source === 'appleMusic') return 'Open with Apple Music for full subscription playback.';
    if (track.source === 'youtube') return 'Open or play through the official YouTube embed.';
    return 'This provider did not expose playable browser audio.';
  }

  async function connectProvider(status: ProviderStatus) {
    try {
      if (status.id === 'spotify') {
        await startSpotifyLogin();
        return;
      }

      if (status.id === 'appleMusic') {
        const connected = await connectAppleMusic();
        providerStatuses = getProviderStatuses();
        pushToast(connected.message, 'success');
        void loadDiscoveryShelves();
        return;
      }

      pushToast(`${status.name}: ${status.message}`, 'info');
    } catch (error: unknown) {
      pushToast(getErrorMessage(error), 'error');
      providerStatuses = getProviderStatuses();
    }
  }

  async function disconnectProvider(status: ProviderStatus) {
    if (status.id === 'spotify') {
      disconnectSpotify();
      providerStatuses = getProviderStatuses();
      pushToast('Spotify disconnected.', 'info');
      return;
    }

    if (status.id === 'appleMusic') {
      await disconnectAppleMusic();
      providerStatuses = getProviderStatuses();
      pushToast('Apple Music disconnected.', 'info');
    }
  }

  function setThemeMode(mode: ThemeMode) {
    themeMode = mode;
    window.localStorage.setItem('myMusicTheme', mode);
    applyThemeMode(mode);
  }

  function applyThemeMode(mode: ThemeMode) {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode === 'light' ? 'light' : 'dark';
  }

  function clearFavorites() {
    player.clearFavorites();
    pushToast('Favorites cleared.', 'info');
  }

  function clearRecentHistory() {
    player.clearRecentlyPlayed();
    pushToast('Recently played cleared.', 'info');
  }

  function playNext(track: Track) {
    player.playNext(track.id);
    pushToast(`${track.title} will play next.`, 'success');
  }

  function addToQueue(track: Track) {
    player.addToQueue(track.id);
    pushToast(`${track.title} added to queue.`, 'success');
  }

  function removeFromQueue(track: Track) {
    player.removeFromQueue(track.id);
    pushToast(`${track.title} removed from queue.`, 'info');
  }

  function toggleFavorite(track: Track) {
    player.toggleFavorite(track.id);
    pushToast(track.favorite ? 'Removed from favorites.' : 'Added to favorites.', 'success');
  }

  function createPlaylist() {
    const name = newPlaylistName.trim();
    if (!name) return;

    player.createPlaylist(name);
    newPlaylistName = '';
    pushToast('Playlist created.', 'success');
  }

  function startRename(playlist: Playlist) {
    renamePlaylistId = playlist.id;
    renamePlaylistName = playlist.name;
  }

  function saveRename() {
    if (!renamePlaylistId) return;
    player.renamePlaylist(renamePlaylistId, renamePlaylistName);
    renamePlaylistId = '';
    renamePlaylistName = '';
    pushToast('Playlist renamed.', 'success');
  }

  function addTrackToPlaylist(playlistId: string, track: Track) {
    if (!playlistId) return;

    player.addToPlaylist(playlistId, track.id);
    pushToast(`${track.title} added to playlist.`, 'success');
  }

  function tracksForIds(trackIds: string[]) {
    return trackIds
      .map((trackId) => $player.tracks.find((track) => track.id === trackId))
      .filter(Boolean) as Track[];
  }

  function totalDuration(tracks: Track[]) {
    return tracks.reduce((total, track) => total + (track.duration || 0), 0);
  }

  function enterMusicExperience(target: 'search' | 'local' = 'search') {
    showIntro = false;
    window.localStorage.setItem('myMusicIntroSeen', 'true');
    triggerGlassBreak();

    if (target === 'local') {
      player.setView('local');
      openAddMusic();
      return;
    }

    player.setView('search');
  }

  function triggerGlassBreak() {
    glassBreak = true;
    window.setTimeout(() => {
      glassBreak = false;
    }, 780);
  }

  function handlePointerMove(event: PointerEvent) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    motionX = ((event.clientX / width) - 0.5) * 10;
    motionY = ((event.clientY / height) - 0.5) * -8;
  }

  function handlePointerDown(event: PointerEvent) {
    const id = Date.now() + rippleId;
    rippleId += 1;
    ripples = [...ripples.slice(-5), { id, x: event.clientX, y: event.clientY }];
    window.setTimeout(() => {
      ripples = ripples.filter((ripple) => ripple.id !== id);
    }, 700);
  }

  function connectAudioAnalyzer() {
    if (!audioElement || analyser || typeof AudioContext === 'undefined') return;

    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      frequencyData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      mediaSource = audioContext.createMediaElementSource(audioElement);
      mediaSource.connect(analyser);
      analyser.connect(audioContext.destination);
    } catch {
      analyser = undefined;
      frequencyData = undefined;
    }
  }

  function updateVisualizer() {
    if (analyser && frequencyData && $player.isPlaying) {
      analyser.getByteFrequencyData(frequencyData);
      const average =
        frequencyData.reduce((total, value) => total + value, 0) / Math.max(1, frequencyData.length);
      visualLevel = 0.1 + Math.min(0.8, average / 255);
    } else {
      const ambient = $player.isPlaying ? 0.22 : 0.1;
      visualLevel = visualLevel * 0.92 + ambient * 0.08;
    }

    visualFrame = window.requestAnimationFrame(updateVisualizer);
  }

  function fuzzyMatch(value: string, query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    const source = value.toLowerCase();
    if (source.includes(normalized)) return true;

    let queryIndex = 0;
    for (const character of source) {
      if (character === normalized[queryIndex]) queryIndex += 1;
      if (queryIndex === normalized.length) return true;
    }

    return false;
  }

  function pushToast(message: string, tone: Toast['tone'] = 'info') {
    const id = Date.now() + toastId;
    toastId += 1;
    toasts = [...toasts, { id, message, tone }].slice(-4);
    window.setTimeout(() => {
      toasts = toasts.filter((toast) => toast.id !== id);
    }, 4200);
  }

  function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Something went wrong while loading music.';
  }

  $: progressTrack = $currentTrack?.duration && $currentTrack.duration > 0 ? $currentTrack.duration : 1;
  $: progressPercent = Math.max(0, Math.min(100, ($player.position / progressTrack) * 100));
  $: queueTracks = tracksForIds($player.queue);
  $: favoriteTracks = $filteredTracks.filter((track) => track.favorite);
  $: recentTracks = ($player.recentlyPlayed
    .map((trackId) => $player.tracks.find((track) => track.id === trackId))
    .filter(Boolean) as Track[])
    .filter((track) => fuzzyMatch(`${track.title} ${track.artist} ${track.album}`, $player.search));
  $: activeTracks =
    $player.activeView === 'local'
      ? $filteredTracks.filter((track) => track.source === 'local')
      : $player.activeView === 'favorites'
      ? favoriteTracks
      : $player.activeView === 'recent'
        ? recentTracks
        : $filteredTracks;
  $: localTracks = $filteredTracks.filter((track) => track.source === 'local');
  $: onlineTracks = searchResult.tracks;
  $: onlineArtists = searchResult.artists;
  $: onlineAlbums = searchResult.albums;
  $: onlineProviderMessages = providerStatuses.filter(
    (status) => status.state !== 'configured' && status.state !== 'connected'
  );
  $: anyProviderEnabled = providerStatuses.some(
    (status) => status.state === 'configured' || status.state === 'connected'
  );
  $: visualStyle = `--visual-level: ${visualLevel}; --tilt-x: ${motionY}deg; --tilt-y: ${motionX}deg;`;
  $: currentProviderLabel = $currentTrack?.providerBadge ?? ($currentTrack?.source === 'local' ? 'Local' : 'Ready');
  $: albumGroups = Array.from(
    $filteredTracks.reduce((groups, track) => {
      const id = `${track.album}::${track.artist}`;
      const group = groups.get(id) ?? {
        id,
        name: track.album,
        artist: track.artist,
        tracks: [],
        duration: 0,
        coverTrack: track
      };
      group.tracks.push(track);
      group.duration += track.duration || 0;
      groups.set(id, group);
      return groups;
    }, new Map<string, AlbumGroup>())
  ).map(([, group]) => group);
  $: artistGroups = Array.from(
    $filteredTracks.reduce((groups, track) => {
      const albums = groups.get(track.artist) ?? new Map<string, Track[]>();
      const albumTracks = albums.get(track.album) ?? [];
      albumTracks.push(track);
      albums.set(track.album, albumTracks);
      groups.set(track.artist, albums);
      return groups;
    }, new Map<string, Map<string, Track[]>>())
  );
  $: filteredPlaylists = $player.playlists.filter((playlist) =>
    fuzzyMatch(`${playlist.name} ${tracksForIds(playlist.trackIds).map((track) => track.title).join(' ')}`, $player.search)
  );
  $: if (selectedPlaylistId && !$player.playlists.some((playlist) => playlist.id === selectedPlaylistId)) {
    selectedPlaylistId = $player.playlists[0]?.id ?? '';
  }
  $: if (!selectedPlaylistId && $player.playlists.length > 0) {
    selectedPlaylistId = $player.playlists[0].id;
  }
  $: selectedPlaylist = $player.playlists.find((playlist) => playlist.id === selectedPlaylistId);
  $: localTracksLoaded = $player.tracks.some((track) => track.source === 'local');
  $: if (audioElement) {
    audioElement.volume = $player.volume / 100;
    audioElement.muted = $player.muted;
  }
</script>

<svelte:head>
  <title>My Music</title>
  <meta
    name="description"
    content="A local music and official provider discovery player built with SvelteKit and Tauri."
  />
</svelte:head>

<main
  class="immersive-shell min-h-screen px-3 py-3 text-zinc-50 sm:px-4 lg:px-6"
  style={visualStyle}
  on:pointermove={handlePointerMove}
  on:pointerdown={handlePointerDown}
>
  <div class="ambient-stage" aria-hidden="true">
    <div class="ambient-grid"></div>
    <div class="ambient-orb ambient-orb-a"></div>
    <div class="ambient-orb ambient-orb-b"></div>
    <div class="visual-orb">
      <span></span>
      <span></span>
      <span></span>
    </div>
  </div>

  {#each ripples as ripple}
    <span
      class="glass-ripple"
      style={`left: ${ripple.x}px; top: ${ripple.y}px;`}
      aria-hidden="true"
    ></span>
  {/each}

  {#if glassBreak}
    <div class="glass-fracture" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
  {/if}

  {#if showIntro}
    <section class="intro-screen">
      <div class="intro-depth">
        <div class="intro-disc">
          <Disc3 size={58} />
        </div>
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-[#d7ff73]">My Music</p>
        <h1 class="mt-4 text-balance text-5xl font-semibold sm:text-7xl">MY MUSIC</h1>
        <p class="mt-4 text-lg text-zinc-300">Your music. Your world.</p>
        <p class="mt-2 text-sm text-zinc-500">Search - Discover - Listen</p>
        <div class="intro-wave mt-7" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            class="glass-primary h-12 rounded-md px-6 text-sm font-semibold uppercase tracking-[0.12em]"
            on:click={() => enterMusicExperience('search')}
          >
            Explore Music
          </button>
          <button
            type="button"
            class="h-12 rounded-md border border-white/14 bg-white/8 px-6 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-100 backdrop-blur-md transition hover:bg-white/12"
            on:click={() => enterMusicExperience('local')}
          >
            Local Music
          </button>
        </div>
      </div>
    </section>
  {/if}
  <div
    class="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-[1540px] grid-cols-1 gap-3 pb-28 lg:grid-cols-[236px_minmax(0,1fr)_330px] lg:pb-32 xl:grid-cols-[256px_minmax(0,1fr)_360px]"
  >
    <aside
      class="hidden rounded-lg border border-white/10 bg-white/[0.055] p-3 shadow-2xl shadow-black/20 backdrop-blur-xl lg:block"
    >
      <div class="flex h-full flex-col">
        <div class="flex items-center gap-3 px-2 py-2">
          <div
            class="grid size-11 place-items-center rounded-md bg-[#d7ff73] text-[#101314] shadow-lg shadow-lime-300/10"
          >
            <Disc3 size={24} strokeWidth={2.4} />
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">My Music</p>
            <p class="truncate text-xs text-zinc-400">Discovery + Local</p>
          </div>
        </div>

        <nav class="mt-7 space-y-1">
          {#each navItems as item}
            <button
              type="button"
              class={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition ${
                $player.activeView === item.id
                  ? 'bg-[#d7ff73] text-[#101314] shadow-lg shadow-lime-300/10'
                  : 'text-zinc-300 hover:bg-white/10 hover:text-white'
              }`}
              on:click={() => player.setView(item.id)}
              title={item.label}
            >
              <svelte:component this={item.icon} size={18} />
              <span class="truncate font-medium">{item.label}</span>
            </button>
          {/each}
        </nav>

        <div class="mt-8 grid grid-cols-2 gap-2">
          <div class="rounded-md border border-white/10 bg-black/18 p-3">
            <p class="text-xl font-semibold">{$libraryStats.online}</p>
            <p class="mt-1 text-xs text-zinc-400">Provider</p>
          </div>
          <div class="rounded-md border border-white/10 bg-black/18 p-3">
            <p class="text-xl font-semibold">{$libraryStats.local}</p>
            <p class="mt-1 text-xs text-zinc-400">Local</p>
          </div>
        </div>

        <button
          type="button"
          class="mt-4 flex h-11 items-center justify-center gap-2 rounded-md bg-[#d7ff73] px-4 text-sm font-semibold text-[#101314] transition hover:bg-[#e4ff95]"
          on:click={openAddMusic}
        >
          <Plus size={18} />
          <span>Add Music</span>
        </button>

        <div class="mt-auto rounded-lg border border-white/10 bg-[#f7a072]/10 p-4">
          <div class="mb-3 flex items-center justify-between">
            <Sparkles size={18} class="text-[#f7a072]" />
            <span class="rounded-full bg-white/10 px-2 py-1 text-[11px] font-medium text-zinc-200">
              Local
            </span>
          </div>
          <p class="text-sm font-semibold leading-5 text-white">Your music stays on this device.</p>
          <p class="mt-2 text-xs leading-5 text-zinc-400">
            Metadata, playlists, favorites, and recent plays are stored in IndexedDB.
          </p>
        </div>
      </div>
    </aside>

    <section class="min-w-0 rounded-lg border border-white/10 bg-[#f7f7f2]/[0.055] backdrop-blur-xl">
      <div class="border-b border-white/10 px-4 py-4 sm:px-5">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div class="min-w-0">
            <div class="flex items-center gap-2 text-xs font-medium uppercase text-[#d7ff73]">
              <BadgeCheck size={15} />
              <span>Music Discovery</span>
            </div>
            <h1 class="mt-2 truncate text-2xl font-semibold tracking-normal sm:text-3xl">
              {navItems.find((item) => item.id === $player.activeView)?.label ?? 'Library'}
            </h1>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              class="flex h-11 items-center justify-center gap-2 rounded-md bg-[#d7ff73] px-4 text-sm font-semibold text-[#101314] transition hover:bg-[#e4ff95] disabled:opacity-70"
              disabled={isImporting}
              on:click={openAddMusic}
            >
              {#if isImporting}
                <LoaderCircle size={18} class="animate-spin" />
              {:else}
                <Plus size={18} />
              {/if}
              <span class="whitespace-nowrap">Add Music</span>
            </button>

            <label
              class="flex h-12 min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/22 px-3 text-sm text-zinc-300 shadow-inner shadow-white/5 sm:w-[420px]"
            >
              <Search size={17} class="shrink-0 text-zinc-500" />
              <input
                class="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-500"
                placeholder="Search songs, artists, albums..."
                value={onlineSearchQuery || $player.search}
                on:input={handleGlobalSearchInput}
                on:focus={() => player.setView('search')}
              />
            </label>
          </div>
        </div>

        <div class="mt-4 flex gap-2 overflow-x-auto pb-1 thin-scrollbar">
          {#each providerStatuses as status}
            <button
              type="button"
              class="flex h-8 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 text-xs font-medium text-zinc-300"
              on:click={() => player.setView('settings')}
              title={status.message}
            >
              {#if status.state === 'configured' || status.state === 'connected'}
                <Radio size={13} class="text-[#d7ff73]" />
              {:else}
                <WifiOff size={13} class={providerStatusTone(status)} />
              {/if}
              <span>{status.name}</span>
              <span class={providerStatusTone(status)}>{status.message}</span>
            </button>
          {/each}
        </div>

        <div class="mt-4 flex gap-2 overflow-x-auto pb-1 thin-scrollbar">
          {#each $genres as genre}
            <button
              type="button"
              class={`h-9 shrink-0 rounded-full px-4 text-sm font-medium transition ${
                $player.selectedGenre === genre
                  ? 'bg-white text-[#101314]'
                  : 'bg-white/8 text-zinc-300 hover:bg-white/12 hover:text-white'
              }`}
              on:click={() => player.setGenre(genre)}
            >
              {genre}
            </button>
          {/each}
        </div>

        {#if scanStatus || scanError || localTracksLoaded}
          <div
            class={`mt-3 flex flex-col gap-2 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${
              scanError
                ? 'border-[#ffafcc]/30 bg-[#ffafcc]/10 text-[#ffcfdf]'
                : 'border-white/10 bg-black/18 text-zinc-300'
            }`}
          >
            <span class="flex min-w-0 items-center gap-2">
              <HardDrive size={16} class="shrink-0" />
              <span class="truncate">{scanError || scanStatus}</span>
            </span>

            {#if localTracksLoaded}
              <button
                type="button"
                class="flex h-8 shrink-0 items-center justify-center gap-2 rounded-md bg-white/8 px-3 text-xs font-medium text-zinc-200 transition hover:bg-white/12"
                title="Clear local library"
                on:click={clearLocalLibrary}
              >
                <Trash2 size={14} />
                <span>Clear</span>
              </button>
            {/if}
          </div>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-2 border-b border-white/10 p-3 sm:grid-cols-5 sm:p-4">
        <div class="rounded-md bg-black/18 p-3">
          <p class="text-lg font-semibold">{$libraryStats.tracks}</p>
          <p class="text-xs text-zinc-400">Songs</p>
        </div>
        <div class="rounded-md bg-black/18 p-3">
          <p class="text-lg font-semibold">{$libraryStats.artists}</p>
          <p class="text-xs text-zinc-400">Artists</p>
        </div>
        <div class="rounded-md bg-black/18 p-3">
          <p class="text-lg font-semibold">{$libraryStats.albums}</p>
          <p class="text-xs text-zinc-400">Albums</p>
        </div>
        <div class="rounded-md bg-black/18 p-3">
          <p class="text-lg font-semibold">{$libraryStats.favorites}</p>
          <p class="text-xs text-zinc-400">Favorites</p>
        </div>
        <div class="rounded-md bg-black/18 p-3">
          <p class="text-lg font-semibold">{$libraryStats.playlists}</p>
          <p class="text-xs text-zinc-400">Playlists</p>
        </div>
      </div>

      <div class="thin-scrollbar max-h-[calc(100vh-330px)] min-h-[360px] overflow-y-auto p-2 sm:p-3 lg:max-h-[calc(100vh-250px)]">
        {#if $player.activeView === 'search'}
          <div class="space-y-4">
            <section class="rounded-lg border border-white/10 bg-black/18 p-4">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div class="min-w-0">
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#8bd3ff]">Unified Search</p>
                  <h2 class="mt-2 text-2xl font-semibold">Search songs, artists, albums...</h2>
                  <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                    Results come only from enabled official provider APIs plus your local metadata.
                  </p>
                </div>
                <label class="flex h-13 min-w-0 items-center gap-3 rounded-md border border-white/10 bg-white/8 px-4 text-sm text-zinc-300 lg:w-[420px]">
                  <Search size={19} class="shrink-0 text-zinc-500" />
                  <input
                    class="min-w-0 flex-1 bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500"
                    placeholder="Blinding Lights, Arijit Singh, After Hours..."
                    bind:value={onlineSearchQuery}
                    on:input={handleGlobalSearchInput}
                  />
                </label>
              </div>

              <div class="mt-4 flex gap-2 overflow-x-auto pb-1 thin-scrollbar">
                {#each searchTabs as tab}
                  <button
                    type="button"
                    class={`h-9 shrink-0 rounded-full px-4 text-sm font-medium transition ${
                      searchTab === tab.id
                        ? 'bg-white text-[#101314]'
                        : 'bg-white/8 text-zinc-300 hover:bg-white/12'
                    }`}
                    on:click={() => (searchTab = tab.id)}
                  >
                    {tab.label}
                  </button>
                {/each}
              </div>
            </section>

            {#if isSearching}
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {#each Array.from({ length: 6 }) as _}
                  <div class="skeleton-card h-28 rounded-lg border border-white/10 bg-white/6"></div>
                {/each}
              </div>
            {:else if searchResult.query}
              {#if onlineProviderMessages.length > 0}
                <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {#each onlineProviderMessages as status}
                    <button
                      type="button"
                      class="rounded-lg border border-white/10 bg-white/[0.06] p-3 text-left transition hover:bg-white/10"
                      on:click={() => player.setView('settings')}
                    >
                      <p class="flex items-center gap-2 text-sm font-semibold">
                        <WifiOff size={15} class={providerStatusTone(status)} />
                        <span>{status.name}</span>
                      </p>
                      <p class="mt-1 text-xs text-zinc-500">{status.message}</p>
                    </button>
                  {/each}
                </div>
              {/if}

              {#if (searchTab === 'all' || searchTab === 'songs') && onlineTracks.length > 0}
                <section class="space-y-3">
                  <div class="flex items-center justify-between">
                    <h2 class="text-sm font-semibold">Songs</h2>
                    <span class="text-xs text-zinc-500">{onlineTracks.length} results</span>
                  </div>
                  <div class="grid gap-3 xl:grid-cols-2">
                    {#each onlineTracks as result}
                      {@render OnlineTrackCard(result)}
                    {/each}
                  </div>
                </section>
              {/if}

              {#if (searchTab === 'all' || searchTab === 'artists') && onlineArtists.length > 0}
                <section class="space-y-3">
                  <h2 class="text-sm font-semibold">Artists</h2>
                  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {#each onlineArtists as artist}
                      {@render OnlineEntityCard(artist, 'artist')}
                    {/each}
                  </div>
                </section>
              {/if}

              {#if (searchTab === 'all' || searchTab === 'albums') && onlineAlbums.length > 0}
                <section class="space-y-3">
                  <h2 class="text-sm font-semibold">Albums</h2>
                  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {#each onlineAlbums as album}
                      {@render OnlineEntityCard(album, 'album')}
                    {/each}
                  </div>
                </section>
              {/if}

              {#if onlineTracks.length === 0 && onlineArtists.length === 0 && onlineAlbums.length === 0}
                <div class="rounded-lg border border-dashed border-white/12 bg-black/16 p-8 text-center">
                  <Globe2 size={30} class="mx-auto text-zinc-500" />
                  <p class="mt-3 text-lg font-semibold">No online results yet</p>
                  <p class="mt-1 text-sm text-zinc-500">Connect/configure a provider or try another search.</p>
                </div>
              {/if}
            {:else}
              <div class="rounded-lg border border-dashed border-white/12 bg-black/16 p-8 text-center">
                <Search size={32} class="mx-auto text-zinc-500" />
                <p class="mt-3 text-lg font-semibold">Start with a song, artist, or album</p>
                <p class="mt-1 text-sm text-zinc-500">Search local metadata and every enabled provider.</p>
              </div>
            {/if}
          </div>
        {:else if $player.activeView === 'settings'}
          <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section class="rounded-lg border border-white/10 bg-black/18 p-4">
              <h2 class="text-lg font-semibold">Appearance</h2>
              <p class="mt-2 text-sm text-zinc-500">Choose how My Music should present the interface.</p>
              <div class="mt-4 grid grid-cols-3 gap-2">
                {#each themeModes as mode}
                  <button
                    type="button"
                    class={`h-10 rounded-md text-sm font-semibold ${
                      themeMode === mode.id ? 'bg-white text-[#101314]' : 'bg-white/8 text-zinc-300'
                    }`}
                    on:click={() => setThemeMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                {/each}
              </div>
            </section>

            <section class="rounded-lg border border-white/10 bg-black/18 p-4">
              <h2 class="text-lg font-semibold">About</h2>
              <div class="mt-4 space-y-3 text-sm text-zinc-400">
                <div class="flex items-center justify-between gap-3">
                  <span>My Music</span>
                  <span class="font-semibold text-zinc-100">0.1.0</span>
                </div>
                <button
                  type="button"
                  class="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/8 text-sm font-semibold text-zinc-100"
                  on:click={() => openExternalUrl('https://github.com/kumar057/my-music')}
                >
                  <ExternalLink size={15} />
                  GitHub
                </button>
              </div>
            </section>

            <section class="rounded-lg border border-white/10 bg-black/18 p-4">
              <h2 class="text-lg font-semibold">Music Providers</h2>
              <div class="mt-4 grid gap-3 md:grid-cols-3">
                {#each providerStatuses as status}
                  <div class="rounded-lg border border-white/10 bg-white/[0.06] p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="text-sm font-semibold">{status.name}</p>
                        <p class={`mt-1 text-xs ${providerStatusTone(status)}`}>{status.message}</p>
                      </div>
                      <Radio size={18} class={providerStatusTone(status)} />
                    </div>
                    <div class="mt-4 flex gap-2">
                      {#if status.state === 'connected'}
                        <button
                          type="button"
                          class="h-9 rounded-md border border-white/10 bg-white/8 px-3 text-xs font-semibold"
                          on:click={() => disconnectProvider(status)}
                        >
                          Disconnect
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="h-9 rounded-md bg-white px-3 text-xs font-semibold text-[#101314]"
                          on:click={() => connectProvider(status)}
                        >
                          {status.connectLabel ?? 'Connect'}
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </section>

            <section class="rounded-lg border border-white/10 bg-black/18 p-4">
              <h2 class="text-lg font-semibold">Playback</h2>
              <div class="mt-4 space-y-3 text-sm text-zinc-400">
                <div class="flex items-center justify-between gap-3">
                  <span>Volume</span>
                  <span class="font-semibold text-zinc-100">{$player.volume}%</span>
                </div>
                <label class="relative flex h-5 items-center">
                  <span class="absolute h-1 w-full rounded-full bg-white/12"></span>
                  <span class="absolute h-1 rounded-full bg-[#8bd3ff]" style={`width: ${$player.volume}%`}></span>
                  <input
                    aria-label="Volume"
                    class="relative z-10 h-5 w-full cursor-pointer opacity-0"
                    type="range"
                    min="0"
                    max="100"
                    value={$player.volume}
                    on:input={handleVolume}
                  />
                </label>
                <p>Autoplay follows browser permission rules. Crossfade is a UI placeholder until browser-safe mixing is added.</p>
              </div>
            </section>

            <section class="rounded-lg border border-white/10 bg-black/18 p-4 xl:col-span-2">
              <h2 class="text-lg font-semibold">Local Library</h2>
              <div class="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="h-10 rounded-md bg-[#d7ff73] px-4 text-sm font-semibold text-[#101314]"
                  on:click={openAddMusic}
                >
                  Add Local Music
                </button>
                <button
                  type="button"
                  class="h-10 rounded-md border border-[#ffafcc]/30 bg-[#ffafcc]/10 px-4 text-sm font-semibold text-[#ffcfdf]"
                  on:click={clearLocalLibrary}
                >
                  Clear local music metadata
                </button>
                <button
                  type="button"
                  class="h-10 rounded-md border border-white/10 bg-white/8 px-4 text-sm font-semibold text-zinc-100"
                  on:click={clearRecentHistory}
                >
                  Clear recently played
                </button>
                <button
                  type="button"
                  class="h-10 rounded-md border border-white/10 bg-white/8 px-4 text-sm font-semibold text-zinc-100"
                  on:click={clearFavorites}
                >
                  Clear favorites
                </button>
              </div>
              <p class="mt-3 text-sm leading-6 text-zinc-500">
                Local files stay on this device. Provider playlists and favorites store only IDs and metadata.
              </p>
            </section>
          </div>
        {:else if $player.activeView === 'home' || $player.activeView === 'discover'}
          <div class="space-y-4">
            <section class="hero-panel overflow-hidden rounded-lg border border-white/10 bg-black/18 p-5 sm:p-6">
              <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-center">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#d7ff73]">MY MUSIC</p>
                  <h2 class="mt-3 text-balance text-3xl font-semibold sm:text-5xl">Your music. Your world.</h2>
                  <p class="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
                    Search official providers, play permitted previews and embeds, and keep your own local library offline.
                  </p>
                  <div class="mt-6 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      class="glass-primary h-11 rounded-md px-5 text-sm font-semibold"
                      on:click={() => {
                        triggerGlassBreak();
                        player.setView('search');
                      }}
                    >
                      Explore Music
                    </button>
                    <button
                      type="button"
                      class="h-11 rounded-md border border-white/10 bg-white/8 px-5 text-sm font-semibold"
                      on:click={openAddMusic}
                    >
                      Local Music
                    </button>
                  </div>
                </div>
                <div class="album-depth-card mx-auto w-full max-w-[260px]">
                  <div class="aspect-square rounded-lg" style={coverStyle($currentTrack)}></div>
                </div>
              </div>
            </section>

            {#each discoveryShelves as shelf}
              <section class="rounded-lg border border-white/10 bg-black/16 p-4">
                <div class="flex items-center justify-between">
                  <h2 class="text-sm font-semibold">{shelf.title}</h2>
                  <span class="text-xs text-zinc-500">{shelf.query}</span>
                </div>
                <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {#if shelf.loading}
                    {#each Array.from({ length: 4 }) as _}
                      <div class="skeleton-card h-44 rounded-lg border border-white/10 bg-white/6"></div>
                    {/each}
                  {:else}
                    {#each shelf.tracks as result}
                      {@render CompactProviderCard(result)}
                    {:else}
                      <div class="rounded-md border border-dashed border-white/12 p-4 text-sm text-zinc-500 sm:col-span-2 xl:col-span-4">
                        {anyProviderEnabled ? 'No official results for this shelf yet.' : 'Connect or configure a provider to populate this shelf.'}
                      </div>
                    {/each}
                  {/if}
                </div>
              </section>
            {/each}

            <section class="rounded-lg border border-white/10 bg-black/16 p-4">
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold">Local Music</h2>
                <button type="button" class="text-xs font-medium text-[#d7ff73]" on:click={() => player.setView('local')}>View</button>
              </div>
              <div class="mt-3 space-y-1">
                {#each localTracks.slice(0, 6) as track}
                  {@render TrackRow(track, true)}
                {:else}
                  <p class="text-sm text-zinc-500">No local songs imported yet.</p>
                {/each}
              </div>
            </section>
          </div>
        {:else if $player.tracks.length === 0}
          <div class="grid min-h-[360px] place-items-center rounded-md border border-dashed border-white/12 bg-black/12 p-6 text-center">
            <div>
              <div class="mx-auto grid size-14 place-items-center rounded-md bg-white/8 text-zinc-300">
                <FileMusic size={26} />
              </div>
              <p class="mt-4 text-lg font-semibold text-white">Your library is empty</p>
              <p class="mt-1 text-sm text-zinc-400">Add music from your device to start listening.</p>
              <button
                type="button"
                class="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#d7ff73] px-5 text-sm font-semibold text-[#101314]"
                on:click={openAddMusic}
              >
                <Plus size={18} />
                <span>Add Music</span>
              </button>
            </div>
          </div>
        {:else if $player.activeView === 'artists'}
          <div class="space-y-3">
            {#each artistGroups as [artist, albums]}
              <section class="rounded-md bg-black/16 p-4">
                <h2 class="text-base font-semibold">{artist}</h2>
                <div class="mt-3 space-y-3">
                  {#each Array.from(albums) as [album, tracks]}
                    <div class="rounded-md border border-white/10 bg-white/5 p-3">
                      <div class="flex items-center justify-between gap-3">
                        <div class="min-w-0">
                          <p class="truncate text-sm font-semibold">{album}</p>
                          <p class="mt-1 text-xs text-zinc-500">{tracks.length} songs</p>
                        </div>
                        <button
                          type="button"
                          class="grid size-9 place-items-center rounded-md bg-white text-[#101314]"
                          on:click={() => playTrackIds(tracks.map((track) => track.id))}
                          title="Play album"
                        >
                          <Play size={16} />
                        </button>
                      </div>
                      <div class="mt-2 space-y-1">
                        {#each tracks as track}
                          {@render TrackRow(track, true)}
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {:else if $player.activeView === 'albums'}
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {#each albumGroups as album}
              <section class="rounded-md border border-white/10 bg-black/16 p-3">
                <div class="aspect-square rounded-md p-3" style={coverStyle(album.coverTrack)}>
                  <div class="flex h-full items-end">
                    <div class="w-full rounded-md bg-black/35 p-3 backdrop-blur-md">
                      <p class="truncate text-sm font-semibold">{album.name}</p>
                      <p class="mt-1 truncate text-xs text-white/70">{album.artist}</p>
                    </div>
                  </div>
                </div>
                <div class="mt-3 flex items-center justify-between gap-2">
                  <div class="min-w-0 text-xs text-zinc-500">
                    {album.tracks.length} tracks - {formatDuration(album.duration)}
                  </div>
                  <button
                    type="button"
                    class="grid size-9 place-items-center rounded-md bg-white text-[#101314]"
                    on:click={() => playTrackIds(album.tracks.map((track) => track.id))}
                    title="Play album"
                  >
                    <Play size={16} />
                  </button>
                </div>
              </section>
            {/each}
          </div>
        {:else if $player.activeView === 'playlists'}
          <div class="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
            <section class="rounded-md bg-black/16 p-4">
              <h2 class="text-sm font-semibold">Playlists</h2>
              <div class="mt-3 flex gap-2">
                <input
                  class="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-black/22 px-3 text-sm outline-none placeholder:text-zinc-500"
                  placeholder="New playlist"
                  bind:value={newPlaylistName}
                />
                <button
                  type="button"
                  class="grid size-10 place-items-center rounded-md bg-[#d7ff73] text-[#101314]"
                  on:click={createPlaylist}
                  title="Create playlist"
                >
                  <Plus size={18} />
                </button>
              </div>
              <div class="mt-4 space-y-1">
                {#each filteredPlaylists as playlist}
                  <button
                    type="button"
                    class={`flex h-12 w-full items-center justify-between gap-2 rounded-md px-3 text-left ${
                      selectedPlaylistId === playlist.id ? 'bg-white/14' : 'hover:bg-white/8'
                    }`}
                    on:click={() => (selectedPlaylistId = playlist.id)}
                  >
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-semibold">{playlist.name}</span>
                      <span class="text-xs text-zinc-500">{playlist.trackIds.length} songs</span>
                    </span>
                    <Library size={16} class="shrink-0 text-zinc-500" />
                  </button>
                {:else}
                  <p class="text-sm text-zinc-500">No playlists yet.</p>
                {/each}
              </div>
            </section>

            <section class="rounded-md bg-black/16 p-4">
              {#if selectedPlaylist}
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div class="min-w-0">
                    {#if renamePlaylistId === selectedPlaylist.id}
                      <div class="flex gap-2">
                        <input
                          class="h-10 min-w-0 rounded-md border border-white/10 bg-black/22 px-3 text-sm outline-none"
                          bind:value={renamePlaylistName}
                        />
                        <button
                          type="button"
                          class="rounded-md bg-white px-3 text-sm font-semibold text-[#101314]"
                          on:click={saveRename}
                        >
                          Save
                        </button>
                      </div>
                    {:else}
                      <h2 class="truncate text-base font-semibold">{selectedPlaylist.name}</h2>
                    {/if}
                    <p class="mt-1 text-xs text-zinc-500">
                      {selectedPlaylist.trackIds.length} songs - {formatDuration(totalDuration(tracksForIds(selectedPlaylist.trackIds)))}
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      class="grid size-9 place-items-center rounded-md bg-white text-[#101314]"
                      on:click={() => playTrackIds(selectedPlaylist.trackIds)}
                      title="Play playlist"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      type="button"
                      class="grid size-9 place-items-center rounded-md bg-white/8 text-zinc-200"
                      on:click={() => startRename(selectedPlaylist)}
                      title="Rename playlist"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      class="grid size-9 place-items-center rounded-md bg-[#ffafcc]/14 text-[#ffafcc]"
                      on:click={() => player.deletePlaylist(selectedPlaylist.id)}
                      title="Delete playlist"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div class="mt-4 space-y-1">
                  {#each tracksForIds(selectedPlaylist.trackIds) as track}
                    <div class="flex items-center gap-2 rounded-md hover:bg-white/8">
                      <div class="min-w-0 flex-1">
                        {@render TrackRow(track, true)}
                      </div>
                      <button
                        type="button"
                        class="grid size-8 shrink-0 place-items-center rounded-md bg-white/8 text-zinc-300"
                        on:click={() => player.movePlaylistTrack(selectedPlaylist.id, track.id, -1)}
                        title="Move up"
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        type="button"
                        class="grid size-8 shrink-0 place-items-center rounded-md bg-white/8 text-zinc-300"
                        on:click={() => player.movePlaylistTrack(selectedPlaylist.id, track.id, 1)}
                        title="Move down"
                      >
                        <ChevronDown size={15} />
                      </button>
                      <button
                        type="button"
                        class="grid size-8 shrink-0 place-items-center rounded-md bg-white/8 text-zinc-300"
                        on:click={() => player.removeFromPlaylist(selectedPlaylist.id, track.id)}
                        title="Remove from playlist"
                      >
                        <Minus size={15} />
                      </button>
                    </div>
                  {:else}
                    <p class="rounded-md border border-dashed border-white/12 p-4 text-sm text-zinc-500">
                      Add songs from the Songs page.
                    </p>
                  {/each}
                </div>
              {:else}
                <p class="text-sm text-zinc-500">Create a playlist to start collecting songs.</p>
              {/if}
            </section>
          </div>
        {:else}
          <div class="hidden grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_86px_150px_78px] px-3 py-2 text-xs font-medium uppercase text-zinc-500 md:grid">
            <span>Title</span>
            <span>Album</span>
            <span>Quality</span>
            <span>Actions</span>
            <span class="text-right">Time</span>
          </div>

          <div class="space-y-1">
            {#each activeTracks as track}
              {@render TrackRow(track)}
            {:else}
              <div class="grid min-h-[280px] place-items-center rounded-md border border-dashed border-white/12 bg-black/12 p-6 text-center">
                <div>
                  <div class="mx-auto grid size-12 place-items-center rounded-md bg-white/8 text-zinc-300">
                    <FileMusic size={22} />
                  </div>
                  <p class="mt-4 text-sm font-semibold text-white">No songs found</p>
                  <p class="mt-1 text-sm text-zinc-400">Try another search or add more music.</p>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <aside class="grid gap-3 lg:grid-rows-[auto_minmax(0,1fr)]">
      <section class="rounded-lg border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl">
        <div class="relative overflow-hidden rounded-lg p-4" style={coverStyle($currentTrack)}>
          <div class="absolute inset-0 bg-black/10"></div>
          <div class="relative flex aspect-square items-end">
            <div class="w-full rounded-md bg-black/32 p-4 backdrop-blur-md">
              <p class="truncate text-xl font-semibold text-white">
                {$currentTrack?.title ?? 'No track selected'}
              </p>
              <p class="mt-1 truncate text-sm text-white/75">
                {$currentTrack?.artist ?? 'Local Library'}
              </p>
            </div>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">{$currentTrack?.album ?? 'Ready'}</p>
            <p class="mt-1 truncate text-xs text-zinc-400">
              {$currentTrack?.fileType ?? 'Audio'} - {$currentTrack?.bitrate ?? 'Local'}
            </p>
          </div>
          {#if $currentTrack}
            <button
              type="button"
              class={`grid size-10 shrink-0 place-items-center rounded-md border border-white/10 transition ${
                $currentTrack.favorite
                  ? 'bg-[#ffafcc]/16 text-[#ffafcc]'
                  : 'bg-white/8 text-zinc-300 hover:bg-white/12'
              }`}
              title="Favorite"
              on:click={() => toggleFavorite($currentTrack)}
            >
              <Heart size={18} fill={$currentTrack.favorite ? 'currentColor' : 'none'} />
            </button>
          {/if}
        </div>
      </section>

      <section
        class="min-h-[320px] rounded-lg border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">Up Next</h2>
          <span class="text-xs text-zinc-500">{queueTracks.length} songs</span>
        </div>

        <div class="thin-scrollbar mt-3 max-h-[280px] space-y-1 overflow-y-auto lg:max-h-[calc(100vh-560px)]">
          {#each queueTracks as track, index}
            <div
              class={`flex h-14 w-full items-center gap-3 rounded-md px-2 transition ${
                track.id === $player.currentTrackId ? 'bg-white/12' : 'hover:bg-white/8'
              }`}
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 text-left"
                on:click={() => playTrack(track)}
              >
                <span class="w-5 shrink-0 text-center text-xs text-zinc-500">
                  {(index + 1).toString().padStart(2, '0')}
                </span>
                <span class="grid size-9 shrink-0 place-items-center rounded-md" style={coverStyle(track)}>
                  <Disc3 size={17} class="text-black/60" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-zinc-100">{track.title}</span>
                  <span class="mt-0.5 block truncate text-xs text-zinc-500">{track.artist}</span>
                </span>
              </button>
              <button
                type="button"
                class="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-white/8 hover:text-zinc-200"
                on:click={() => removeFromQueue(track)}
                title="Remove from queue"
              >
                <X size={15} />
              </button>
            </div>
          {:else}
            <p class="rounded-md border border-dashed border-white/12 p-4 text-sm text-zinc-500">
              Queue is empty.
            </p>
          {/each}
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          {#each $player.playlists.slice(0, 4) as playlist}
            <button
              type="button"
              class="rounded-md border border-white/10 bg-black/18 p-3 text-left transition hover:bg-white/10"
              on:click={() => {
                selectedPlaylistId = playlist.id;
                player.setView('playlists');
              }}
            >
              <p class="truncate text-sm font-semibold">{playlist.name}</p>
              <p class="mt-1 text-xs text-zinc-500">{playlist.trackIds.length} songs</p>
            </button>
          {/each}
        </div>
      </section>
    </aside>
  </div>

  <section
    class="fixed inset-x-3 bottom-3 z-20 mx-auto max-w-[1540px] rounded-lg border border-white/12 bg-[#161817]/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:inset-x-4 lg:inset-x-6"
  >
    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)_minmax(220px,0.45fr)] lg:items-center">
      <div class="flex min-w-0 items-center gap-3">
        <div class="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md" style={coverStyle($currentTrack)}>
          <Disc3 size={26} class="text-black/65" />
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{$currentTrack?.title ?? 'No track selected'}</p>
          <p class="mt-1 truncate text-xs text-zinc-400">
            {$currentTrack?.artist ?? 'Search music or add local files'} - {currentProviderLabel}
          </p>
        </div>
      </div>

      <div class="min-w-0">
        <div class="mb-2 flex items-center justify-center gap-2">
          <button
            type="button"
            class={`grid size-9 place-items-center rounded-md transition ${
              $player.shuffle ? 'bg-[#8bd3ff]/18 text-[#8bd3ff]' : 'text-zinc-400 hover:bg-white/8 hover:text-white'
            }`}
            title="Shuffle"
            on:click={() => player.toggleShuffle()}
          >
            <Shuffle size={17} />
          </button>
          <button
            type="button"
            class="grid size-9 place-items-center rounded-md text-zinc-300 transition hover:bg-white/8 hover:text-white"
            title="Previous"
            on:click={() => playAdjacent(-1)}
          >
            <SkipBack size={18} />
          </button>
          <button
            type="button"
            class="grid size-11 place-items-center rounded-full bg-white text-[#101314] shadow-lg shadow-white/10 transition hover:scale-[1.03] disabled:opacity-50"
            title={$player.isPlaying ? 'Pause' : 'Play'}
            disabled={!$currentTrack}
            on:click={togglePlayback}
          >
            {#if $player.isPlaying}
              <Pause size={20} />
            {:else}
              <Play size={20} />
            {/if}
          </button>
          <button
            type="button"
            class="grid size-9 place-items-center rounded-md text-zinc-300 transition hover:bg-white/8 hover:text-white"
            title="Next"
            on:click={() => playAdjacent(1)}
          >
            <SkipForward size={18} />
          </button>
          <button
            type="button"
            class={`grid size-9 place-items-center rounded-md transition ${
              $player.repeat === 'off'
                ? 'text-zinc-400 hover:bg-white/8 hover:text-white'
                : 'bg-[#d7ff73]/16 text-[#d7ff73]'
            }`}
            title="Repeat"
            on:click={() => player.cycleRepeat()}
          >
            {#if $player.repeat === 'one'}
              <Repeat1 size={17} />
            {:else}
              <Repeat size={17} />
            {/if}
          </button>
        </div>

        <div class="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 text-xs text-zinc-500">
          <span>{formatDuration($player.position)}</span>
          <label class="relative flex h-5 items-center">
            <span class="absolute h-1 w-full rounded-full bg-white/12"></span>
            <span
              class="absolute h-1 rounded-full bg-[#d7ff73]"
              style={`width: ${progressPercent}%`}
            ></span>
            <input
              aria-label="Playback position"
              class="relative z-10 h-5 w-full cursor-pointer opacity-0"
              type="range"
              min="0"
              max={progressTrack}
              value={$player.position}
              on:input={handleSeek}
            />
          </label>
          <span class="text-right">{formatDuration($currentTrack?.duration ?? 0)}</span>
        </div>
      </div>

      <div class="hidden min-w-0 items-center gap-3 lg:flex">
        <button
          type="button"
          class="grid size-9 shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-white/8 hover:text-white"
          on:click={() => (isImmersive = true)}
          title="Immersive Mode"
        >
          <Maximize2 size={18} />
        </button>
        <button
          type="button"
          class="grid size-9 shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-white/8 hover:text-white"
          on:click={() => player.toggleMuted()}
          title={$player.muted ? 'Unmute' : 'Mute'}
        >
          {#if $player.muted}
            <VolumeX size={18} />
          {:else}
            <Volume2 size={18} />
          {/if}
        </button>
        <label class="relative flex h-5 flex-1 items-center">
          <span class="absolute h-1 w-full rounded-full bg-white/12"></span>
          <span
            class="absolute h-1 rounded-full bg-[#8bd3ff]"
            style={`width: ${$player.volume}%`}
          ></span>
          <input
            aria-label="Volume"
            class="relative z-10 h-5 w-full cursor-pointer opacity-0"
            type="range"
            min="0"
            max="100"
            value={$player.volume}
            on:input={handleVolume}
          />
        </label>
        <span class="w-9 text-right text-xs text-zinc-500">{$player.volume}%</span>
      </div>
    </div>
  </section>

  <nav class="fixed inset-x-3 bottom-[112px] z-20 grid grid-cols-5 gap-1 rounded-lg border border-white/12 bg-[#161817]/92 p-1 shadow-2xl shadow-black/35 backdrop-blur-xl lg:hidden">
    {#each [
      { id: 'home' as LibraryView, label: 'Home', icon: Home },
      { id: 'search' as LibraryView, label: 'Search', icon: Search },
      { id: 'local' as LibraryView, label: 'Library', icon: Library },
      { id: 'favorites' as LibraryView, label: 'Favorites', icon: Heart },
      { id: 'settings' as LibraryView, label: 'Settings', icon: Settings }
    ] as item}
      <button
        type="button"
        class={`grid min-h-12 place-items-center rounded-md text-[11px] transition ${
          $player.activeView === item.id ? 'bg-white text-[#101314]' : 'text-zinc-400 hover:bg-white/8'
        }`}
        on:click={() => player.setView(item.id)}
      >
        <svelte:component this={item.icon} size={17} />
        <span>{item.label}</span>
      </button>
    {/each}
  </nav>

  {#if isImmersive}
    <section class="immersive-mode fixed inset-0 z-50 grid place-items-center bg-[#070808]/96 p-4 text-center backdrop-blur-2xl">
      <button
        type="button"
        class="absolute right-4 top-4 grid size-10 place-items-center rounded-md border border-white/10 bg-white/8 text-zinc-200"
        on:click={() => (isImmersive = false)}
        title="Exit immersive mode"
      >
        <X size={18} />
      </button>

      <div class="w-full max-w-3xl">
        <div class="immersive-visual mx-auto">
          <div class="visual-orb visual-orb-large" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="album-depth-card immersive-art mx-auto">
            <div class="aspect-square rounded-xl" style={coverStyle($currentTrack)}></div>
          </div>
        </div>

        {#if youtubeEmbedUrl}
          <div class="mx-auto mt-6 aspect-video max-w-2xl overflow-hidden rounded-lg border border-white/10 bg-black">
            <iframe
              class="h-full w-full"
              src={youtubeEmbedUrl}
              title="YouTube player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
          </div>
        {/if}

        <p class="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-[#d7ff73]">{currentProviderLabel}</p>
        <h2 class="mt-3 truncate text-3xl font-semibold sm:text-5xl">
          {$currentTrack?.title ?? 'Nothing playing'}
        </h2>
        <p class="mt-2 truncate text-zinc-400">{$currentTrack?.artist ?? 'Choose a track to begin'}</p>

        <div class="mx-auto mt-8 grid max-w-xl grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 text-xs text-zinc-500">
          <span>{formatDuration($player.position)}</span>
          <div class="h-2 overflow-hidden rounded-full bg-white/12">
            <div class="h-full rounded-full bg-[#d7ff73]" style={`width: ${progressPercent}%`}></div>
          </div>
          <span>{formatDuration($currentTrack?.duration ?? 0)}</span>
        </div>

        <div class="mt-8 flex justify-center gap-3">
          <button type="button" class="glass-control" on:click={() => playAdjacent(-1)} title="Previous">
            <SkipBack size={20} />
          </button>
          <button type="button" class="glass-play size-16" on:click={togglePlayback} title={$player.isPlaying ? 'Pause' : 'Play'}>
            {#if $player.isPlaying}
              <Pause size={24} />
            {:else}
              <Play size={24} />
            {/if}
          </button>
          <button type="button" class="glass-control" on:click={() => playAdjacent(1)} title="Next">
            <SkipForward size={20} />
          </button>
        </div>
      </div>
    </section>
  {/if}

  {#if isImportOpen}
    <div class="fixed inset-0 z-40 grid place-items-center bg-black/65 px-3 py-6 backdrop-blur-sm">
      <section class="w-full max-w-2xl rounded-lg border border-white/12 bg-[#161817] p-4 shadow-2xl shadow-black/50 sm:p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold">Add Your Music</h2>
            <p class="mt-1 text-sm text-zinc-400">Select music from your device.</p>
          </div>
          <button
            type="button"
            class="grid size-9 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12"
            on:click={closeAddMusic}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div class="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            class="flex h-12 items-center justify-center gap-2 rounded-md bg-[#d7ff73] px-4 text-sm font-semibold text-[#101314] disabled:opacity-70"
            disabled={isImporting}
            on:click={() => openFilePicker('songs')}
          >
            <FileMusic size={18} />
            <span>Select Songs</span>
          </button>
          <button
            type="button"
            class="flex h-12 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/8 px-4 text-sm font-semibold text-zinc-100 disabled:opacity-70"
            disabled={isImporting}
            on:click={scanLocalFolder}
          >
            <FolderOpen size={18} />
            <span>Select Folder</span>
          </button>
        </div>

        <button
          type="button"
          class={`mt-4 grid min-h-[180px] w-full place-items-center rounded-lg border border-dashed p-6 text-center transition ${
            isDragOver
              ? 'border-[#d7ff73] bg-[#d7ff73]/10'
              : 'border-white/16 bg-black/18 hover:bg-black/24'
          }`}
          on:dragenter|preventDefault={() => (isDragOver = true)}
          on:dragover|preventDefault={() => (isDragOver = true)}
          on:dragleave|preventDefault={() => (isDragOver = false)}
          on:drop={handleDrop}
          on:click={() => openFilePicker('songs')}
        >
          <span>
            <span class="mx-auto grid size-12 place-items-center rounded-md bg-white/8 text-zinc-200">
              <UploadCloud size={24} />
            </span>
            <span class="mt-3 block text-sm font-semibold text-white">Drag & Drop your music here</span>
            <span class="mt-1 block text-xs text-zinc-500">
              MP3, WAV, FLAC, M4A, AAC, OGG, OPUS, AIFF, and WebM where Chrome supports them.
            </span>
          </span>
        </button>

        <div class="mt-4 grid gap-2 sm:grid-cols-3">
          <div class="rounded-md border border-white/10 bg-black/18 p-3">
            <p class="text-xs text-zinc-500">IndexedDB</p>
            <p class="mt-1 flex items-center gap-2 text-sm font-semibold">
              {#if browserCapabilities.indexedDb}
                <CheckCircle2 size={15} class="text-[#d7ff73]" />
                <span>Available</span>
              {:else}
                <AlertCircle size={15} class="text-[#ffafcc]" />
                <span>Unavailable</span>
              {/if}
            </p>
          </div>
          <div class="rounded-md border border-white/10 bg-black/18 p-3">
            <p class="text-xs text-zinc-500">Folder Picker</p>
            <p class="mt-1 flex items-center gap-2 text-sm font-semibold">
              {#if browserCapabilities.folderPicker || browserCapabilities.directoryInput}
                <CheckCircle2 size={15} class="text-[#d7ff73]" />
                <span>Supported</span>
              {:else}
                <AlertCircle size={15} class="text-[#ffafcc]" />
                <span>Files only</span>
              {/if}
            </p>
          </div>
          <div class="rounded-md border border-white/10 bg-black/18 p-3">
            <p class="text-xs text-zinc-500">Storage</p>
            <p class="mt-1 text-sm font-semibold">Local only</p>
          </div>
        </div>

        {#if isImporting}
          <div class="mt-4 rounded-md border border-white/10 bg-black/18 p-3">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="flex min-w-0 items-center gap-2">
                <LoaderCircle size={16} class="shrink-0 animate-spin text-[#d7ff73]" />
                <span class="truncate">Importing {importFileName || 'music'}...</span>
              </span>
              <span class="shrink-0 text-zinc-400">{importCurrent} / {importTotal}</span>
            </div>
            <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                class="h-full rounded-full bg-[#d7ff73]"
                style={`width: ${importTotal > 0 ? Math.round((importCurrent / importTotal) * 100) : 8}%`}
              ></div>
            </div>
          </div>
        {/if}

        {#if scanError}
          <div class="mt-4 rounded-md border border-[#ffafcc]/30 bg-[#ffafcc]/10 p-3 text-sm text-[#ffcfdf]">
            {scanError}
          </div>
        {/if}
      </section>
    </div>
  {/if}

  <div class="fixed right-3 top-3 z-50 grid w-[min(360px,calc(100vw-1.5rem))] gap-2">
    {#each toasts as toast}
      <div
        class={`rounded-md border px-3 py-2 text-sm shadow-xl backdrop-blur-md ${
          toast.tone === 'success'
            ? 'border-[#d7ff73]/30 bg-[#d7ff73]/12 text-[#ecffb8]'
            : toast.tone === 'error'
              ? 'border-[#ffafcc]/30 bg-[#ffafcc]/12 text-[#ffcfdf]'
              : 'border-white/12 bg-[#161817]/95 text-zinc-200'
        }`}
      >
        {toast.message}
      </div>
    {/each}
  </div>

  <input
    bind:this={fileInput}
    class="hidden"
    type="file"
    accept={audioAccept}
    multiple
    on:change={handleFileInputChange}
  />

  <audio
    bind:this={audioElement}
    preload="metadata"
    on:ended={handleAudioEnded}
    on:error={() => {
      scanError = 'This browser could not play the selected audio file.';
      player.setPlaying(false);
    }}
    on:loadedmetadata={handleAudioLoadedMetadata}
    on:pause={() => {
      if ($currentTrack?.source === 'local' && !audioElement?.ended) {
        player.setPlaying(false);
      }
    }}
    on:play={() => player.setPlaying(true)}
    on:timeupdate={handleAudioTimeUpdate}
  ></audio>
</main>

{#snippet OnlineTrackCard(result: MusicTrack)}
  <article class="result-card rounded-lg border border-white/10 bg-white/[0.06] p-3 transition">
    <div class="flex gap-3">
      <button
        type="button"
        class="album-tilt grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-white/8"
        style={result.artwork ? `background-image: url('${result.artwork}'); background-size: cover; background-position: center;` : ''}
        on:click={() => playProviderResult(result)}
        title="Play"
      >
        {#if !result.artwork}
          <Disc3 size={24} class="text-zinc-500" />
        {/if}
      </button>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate text-sm font-semibold">{result.title}</span>
          <span class="shrink-0 rounded-full border border-white/10 bg-black/24 px-2 py-0.5 text-[11px] text-zinc-300">
            {result.providerBadge}
          </span>
        </div>
        <p class="mt-1 truncate text-xs text-zinc-400">{result.artist}</p>
        <p class="mt-1 truncate text-xs text-zinc-500">{result.album}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="grid size-8 place-items-center rounded-md bg-white text-[#101314] disabled:opacity-50"
            disabled={!result.playable && !result.externalUrl}
            on:click={() => playProviderResult(result)}
            title={result.previewUrl ? 'Play preview' : result.embedUrl ? 'Play official embed' : 'Open provider'}
          >
            <Play size={15} />
          </button>
          <button
            type="button"
            class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12"
            on:click={() => playProviderNext(result)}
            title="Play next"
          >
            <ListPlus size={15} />
          </button>
          <button
            type="button"
            class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12"
            on:click={() => addProviderToQueue(result)}
            title="Add to queue"
          >
            <Plus size={15} />
          </button>
          {#if $player.playlists.length > 0}
            <select
              class="h-8 max-w-[112px] rounded-md border border-white/10 bg-[#161817] px-2 text-xs text-zinc-300 outline-none"
              aria-label="Add provider track to playlist"
              on:change={(event) => {
                addProviderToPlaylist((event.currentTarget as HTMLSelectElement).value, result);
                (event.currentTarget as HTMLSelectElement).value = '';
              }}
            >
              <option value="">Playlist</option>
              {#each $player.playlists as playlist}
                <option value={playlist.id}>{playlist.name}</option>
              {/each}
            </select>
          {/if}
          {#if result.externalUrl}
            <button
              type="button"
              class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12"
              on:click={() => openExternalUrl(result.externalUrl)}
              title="Open provider"
            >
              <ExternalLink size={15} />
            </button>
          {/if}
        </div>
      </div>
    </div>
  </article>
{/snippet}

<style>
  .immersive-shell {
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(circle at calc(50% + (var(--tilt-y) * 4)) 8%, rgb(215 255 115 / 0.16), transparent 26rem),
      radial-gradient(circle at 90% 18%, rgb(139 211 255 / 0.12), transparent 24rem),
      linear-gradient(135deg, #090b0c 0%, #101314 42%, #211d20 100%);
    perspective: 1200px;
  }

  .ambient-stage {
    pointer-events: none;
    position: fixed;
    inset: 0;
    z-index: 0;
    transform: rotateX(var(--tilt-x)) rotateY(var(--tilt-y));
    transform-style: preserve-3d;
    transition: transform 160ms ease-out;
  }

  .ambient-grid {
    position: absolute;
    inset: -20%;
    opacity: 0.16;
    background-image:
      linear-gradient(rgb(255 255 255 / 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgb(255 255 255 / 0.08) 1px, transparent 1px);
    background-size: 72px 72px;
    mask-image: radial-gradient(circle at center, black, transparent 68%);
    transform: translateZ(-160px) rotateX(58deg);
  }

  .ambient-orb {
    position: absolute;
    width: 34rem;
    aspect-ratio: 1;
    border-radius: 999px;
    filter: blur(48px);
    opacity: calc(0.22 + (var(--visual-level) * 0.16));
  }

  .ambient-orb-a {
    left: -8rem;
    top: 10%;
    background: #d7ff73;
  }

  .ambient-orb-b {
    right: -10rem;
    bottom: 8%;
    background: #8bd3ff;
  }

  .visual-orb {
    position: absolute;
    right: 8%;
    top: 16%;
    width: min(34vw, 26rem);
    aspect-ratio: 1;
    border-radius: 999px;
    border: 1px solid rgb(255 255 255 / 0.14);
    box-shadow:
      0 0 calc(60px + (var(--visual-level) * 90px)) rgb(215 255 115 / 0.14),
      inset 0 0 60px rgb(255 255 255 / 0.08);
    opacity: 0.62;
    animation: orb-breathe 7s ease-in-out infinite;
  }

  .visual-orb span {
    position: absolute;
    inset: calc(12% + (var(--visual-level) * 6%));
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 999px;
    transform: rotate(calc(var(--visual-level) * 60deg));
  }

  .visual-orb span:nth-child(2) {
    inset: 24%;
    border-color: rgb(139 211 255 / 0.18);
    transform: rotateX(64deg);
  }

  .visual-orb span:nth-child(3) {
    inset: 35%;
    border-color: rgb(255 255 255 / 0.2);
    background: rgb(255 255 255 / 0.05);
    backdrop-filter: blur(12px);
  }

  .intro-screen {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 1rem;
    background:
      radial-gradient(circle at 50% 12%, rgb(215 255 115 / 0.16), transparent 28rem),
      rgb(7 8 8 / 0.96);
    backdrop-filter: blur(24px);
  }

  .intro-depth {
    width: min(720px, 100%);
    padding: clamp(2rem, 8vw, 4.5rem);
    text-align: center;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 12px;
    background: linear-gradient(180deg, rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.035));
    box-shadow: 0 30px 100px rgb(0 0 0 / 0.45);
    transform: rotateX(calc(var(--tilt-x) * 0.25)) rotateY(calc(var(--tilt-y) * 0.25));
  }

  .intro-disc,
  .glass-play,
  .glass-control,
  .glass-primary {
    display: inline-grid;
    place-items: center;
    background: linear-gradient(180deg, rgb(255 255 255 / 0.92), rgb(215 255 115 / 0.92));
    color: #101314;
    box-shadow:
      0 14px 42px rgb(215 255 115 / 0.18),
      inset 0 1px 0 rgb(255 255 255 / 0.7);
    transition:
      transform 180ms ease,
      box-shadow 180ms ease;
  }

  .intro-disc {
    width: 6.5rem;
    aspect-ratio: 1;
    margin: 0 auto 1.5rem;
    border-radius: 999px;
  }

  .glass-primary:hover,
  .glass-play:hover,
  .glass-control:hover,
  .result-card:hover {
    transform: translateY(-2px);
  }

  .glass-primary:active,
  .glass-play:active,
  .glass-control:active {
    transform: translateY(1px) scale(0.98);
  }

  .glass-control {
    width: 3rem;
    height: 3rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    color: #f5f7f7;
    border: 1px solid rgb(255 255 255 / 0.14);
    backdrop-filter: blur(18px);
  }

  .glass-play {
    border-radius: 999px;
  }

  .intro-wave,
  .skeleton-card {
    overflow: hidden;
    position: relative;
  }

  .intro-wave {
    display: flex;
    justify-content: center;
    gap: 0.35rem;
  }

  .intro-wave span {
    width: 0.38rem;
    height: 2.3rem;
    border-radius: 999px;
    background: linear-gradient(180deg, #d7ff73, #8bd3ff);
    animation: wave-rise 1.1s ease-in-out infinite;
  }

  .intro-wave span:nth-child(2) { animation-delay: 80ms; }
  .intro-wave span:nth-child(3) { animation-delay: 160ms; }
  .intro-wave span:nth-child(4) { animation-delay: 240ms; }
  .intro-wave span:nth-child(5) { animation-delay: 320ms; }
  .intro-wave span:nth-child(6) { animation-delay: 400ms; }
  .intro-wave span:nth-child(7) { animation-delay: 480ms; }

  .skeleton-card::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.09), transparent);
    animation: skeleton-sweep 1.4s linear infinite;
  }

  .result-card,
  .hero-panel,
  .album-depth-card {
    box-shadow:
      0 18px 60px rgb(0 0 0 / 0.22),
      inset 0 1px 0 rgb(255 255 255 / 0.08);
    backdrop-filter: blur(18px);
  }

  .album-depth-card {
    padding: 0.8rem;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 16px;
    background: linear-gradient(140deg, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0.04));
    transform-style: preserve-3d;
    transform: rotateX(calc(var(--tilt-x) * 0.42)) rotateY(calc(var(--tilt-y) * 0.42)) translateZ(24px);
    transition: transform 180ms ease-out;
  }

  .album-tilt {
    transform-style: preserve-3d;
    transition:
      transform 180ms ease,
      box-shadow 180ms ease;
  }

  .album-tilt:hover {
    transform: perspective(700px) rotateX(4deg) rotateY(-5deg) translateY(-2px);
    box-shadow: 0 16px 38px rgb(0 0 0 / 0.28);
  }

  .glass-ripple {
    pointer-events: none;
    position: fixed;
    z-index: 55;
    width: 1rem;
    aspect-ratio: 1;
    border: 1px solid rgb(255 255 255 / 0.34);
    border-radius: 999px;
    translate: -50% -50%;
    animation: ripple-out 700ms ease-out forwards;
  }

  .glass-fracture {
    pointer-events: none;
    position: fixed;
    inset: 0;
    z-index: 54;
    backdrop-filter: blur(2px);
    animation: fracture-fade 780ms ease-out forwards;
  }

  .glass-fracture span {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 32vw;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.42), transparent);
    transform-origin: left center;
  }

  .glass-fracture span:nth-child(1) { transform: rotate(18deg); }
  .glass-fracture span:nth-child(2) { transform: rotate(74deg); }
  .glass-fracture span:nth-child(3) { transform: rotate(138deg); }
  .glass-fracture span:nth-child(4) { transform: rotate(212deg); }

  .immersive-visual {
    position: relative;
    min-height: 320px;
  }

  .visual-orb-large {
    left: 50%;
    top: 50%;
    right: auto;
    width: min(66vw, 34rem);
    translate: -50% -50%;
  }

  .immersive-art {
    position: relative;
    z-index: 2;
    width: min(48vw, 18rem);
  }

  @keyframes orb-breathe {
    0%, 100% {
      scale: calc(0.96 + (var(--visual-level) * 0.12));
      rotate: 0deg;
    }
    50% {
      scale: calc(1 + (var(--visual-level) * 0.18));
      rotate: 8deg;
    }
  }

  @keyframes wave-rise {
    0%, 100% { transform: scaleY(0.35); opacity: 0.55; }
    50% { transform: scaleY(1); opacity: 1; }
  }

  @keyframes skeleton-sweep {
    from { transform: translateX(-100%); }
    to { transform: translateX(100%); }
  }

  @keyframes ripple-out {
    from {
      opacity: 0.55;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(18);
    }
  }

  @keyframes fracture-fade {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @media (max-width: 768px) {
    .visual-orb {
      width: 16rem;
      opacity: 0.34;
    }

    .ambient-orb {
      width: 20rem;
      filter: blur(38px);
    }

    .album-depth-card {
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ambient-stage,
    .visual-orb,
    .intro-wave span,
    .skeleton-card::after,
    .glass-ripple,
    .glass-fracture,
    .album-tilt,
    .album-depth-card {
      animation: none !important;
      transform: none !important;
      transition: none !important;
    }
  }
</style>

{#snippet CompactProviderCard(result: MusicTrack)}
  <button
    type="button"
    class="result-card album-tilt min-w-0 rounded-lg border border-white/10 bg-white/[0.06] p-3 text-left transition"
    on:click={() => playProviderResult(result)}
  >
    <span
      class="block aspect-square rounded-md bg-white/8"
      style={result.artwork ? `background-image: url('${result.artwork}'); background-size: cover; background-position: center;` : ''}
    ></span>
    <span class="mt-3 block truncate text-sm font-semibold">{result.title}</span>
    <span class="mt-1 block truncate text-xs text-zinc-400">{result.artist}</span>
    <span class="mt-2 inline-flex rounded-full border border-white/10 bg-black/24 px-2 py-0.5 text-[11px] text-zinc-300">
      {result.providerBadge}
    </span>
  </button>
{/snippet}

{#snippet OnlineEntityCard(entity: MusicArtist | MusicAlbum, kind: 'artist' | 'album')}
  <article class="result-card rounded-lg border border-white/10 bg-white/[0.06] p-3 transition">
    <button
      type="button"
      class="album-tilt block aspect-square w-full rounded-md bg-white/8"
      style={entity.artwork ? `background-image: url('${entity.artwork}'); background-size: cover; background-position: center;` : ''}
      on:click={() => openExternalUrl(entity.externalUrl)}
      title="Open provider"
    ></button>
    <p class="mt-3 truncate text-sm font-semibold">
      {kind === 'artist' ? (entity as MusicArtist).name : (entity as MusicAlbum).title}
    </p>
    {#if kind === 'album'}
      <p class="mt-1 truncate text-xs text-zinc-400">{(entity as MusicAlbum).artist}</p>
    {/if}
    <div class="mt-3 flex items-center justify-between gap-2">
      <span class="rounded-full border border-white/10 bg-black/24 px-2 py-0.5 text-[11px] text-zinc-300">
        {entity.providerBadge}
      </span>
      {#if entity.externalUrl}
        <button
          type="button"
          class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12"
          on:click={() => openExternalUrl(entity.externalUrl)}
          title="Open provider"
        >
          <ExternalLink size={15} />
        </button>
      {/if}
    </div>
  </article>
{/snippet}

{#snippet TrackRow(track: Track, compact = false)}
  <div
    class={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md p-2 text-left transition ${
      compact
        ? ''
        : 'md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_86px_150px_78px] md:px-3'
    } ${
      track.id === $player.currentTrackId
        ? 'bg-[#d7ff73]/15 ring-1 ring-[#d7ff73]/35'
        : 'hover:bg-white/8'
    }`}
  >
    <span class="flex min-w-0 items-center gap-3">
      <span
        class="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md"
        style={coverStyle(track)}
      >
        <Disc3 size={22} class="text-black/70" />
      </span>
      <span class="min-w-0">
        <span class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm font-semibold text-white">{track.title}</span>
          {#if track.favorite}
            <Star size={14} class="shrink-0 fill-[#ffd166] text-[#ffd166]" />
          {/if}
        </span>
        <span class="mt-1 block truncate text-xs text-zinc-400">{track.artist}</span>
      </span>
    </span>

    {#if !compact}
      <span class="hidden min-w-0 md:block">
        <span class="block truncate text-sm text-zinc-300">{track.album}</span>
        <span class="mt-1 block truncate text-xs text-zinc-500">
          {track.genre} - {track.year || 'Unknown'} - {formatFileSize(track.size)}
        </span>
      </span>

      <span class="hidden text-xs font-semibold text-[#8bd3ff] md:block">
        {track.fileType}
      </span>

      <span class="hidden items-center gap-1 md:flex">
        <button
          type="button"
          class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12"
          on:click={() => playNext(track)}
          title="Play next"
        >
          <ListPlus size={15} />
        </button>
        <button
          type="button"
          class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12"
          on:click={() => addToQueue(track)}
          title="Add to queue"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          class={`grid size-8 place-items-center rounded-md ${
            track.favorite ? 'bg-[#ffafcc]/16 text-[#ffafcc]' : 'bg-white/8 text-zinc-300'
          }`}
          on:click={() => toggleFavorite(track)}
          title="Favorite"
        >
          <Heart size={15} fill={track.favorite ? 'currentColor' : 'none'} />
        </button>
        {#if $player.playlists.length > 0}
          <select
            class="h-8 max-w-[78px] rounded-md border border-white/10 bg-[#161817] px-1 text-xs text-zinc-300 outline-none"
            aria-label="Add to playlist"
            on:change={(event) => {
              addTrackToPlaylist((event.currentTarget as HTMLSelectElement).value, track);
              (event.currentTarget as HTMLSelectElement).value = '';
            }}
          >
            <option value="">Playlist</option>
            {#each $player.playlists as playlist}
              <option value={playlist.id}>{playlist.name}</option>
            {/each}
          </select>
        {/if}
      </span>
    {/if}

    <span class="flex items-center gap-2 justify-self-end">
      {#if !compact}
        <span class="hidden text-sm text-zinc-400 md:inline">{formatDuration(track.duration)}</span>
      {/if}
      <button
        type="button"
        class={`grid size-9 place-items-center rounded-md ${
          track.id === $player.currentTrackId && $player.isPlaying
            ? 'bg-white text-[#101314]'
            : 'bg-white/8 text-zinc-200'
        }`}
        on:click={() => toggleTrack(track)}
        title={track.id === $player.currentTrackId && $player.isPlaying ? 'Pause' : 'Play'}
      >
        {#if track.id === $player.currentTrackId && $player.isPlaying}
          <Pause size={16} />
        {:else}
          <Play size={16} />
        {/if}
      </button>
    </span>
  </div>
{/snippet}
