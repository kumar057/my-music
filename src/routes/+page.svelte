<script lang="ts">
  import '$lib/styles/three-d-music.css';
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
          hydrated = true;
        }
      })
      .catch((error: unknown) => {
        scanError = getErrorMessage(error);
        hydrated = true;
      });

    void loadDiscoveryShelves();

    const handlePointerMove = (event: PointerEvent) => {
      motionX = (event.clientX / window.innerWidth - 0.5) * 2;
      motionY = (event.clientY / window.innerHeight - 0.5) * 2;
      document.documentElement.style.setProperty('--tilt-x', `${motionY * -4}deg`);
      document.documentElement.style.setProperty('--tilt-y', `${motionX * 4}deg`);
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      window.clearInterval(timer);
      unsubscribe();
      window.removeEventListener('pointermove', handlePointerMove);
      if (searchTimer) window.clearTimeout(searchTimer);
      searchAbortController?.abort();
      if (audioElement) audioElement.pause();
      if (mediaSource) mediaSource.disconnect();
      if (audioContext) void audioContext.close();
    };
  });

  $: document?.documentElement.style.setProperty('--visual-level', String(visualLevel));
  $: document?.documentElement.style.setProperty('--tilt-x', `${motionY * -4}deg`);
  $: document?.documentElement.style.setProperty('--tilt-y', `${motionX * 4}deg`);
  $: document?.documentElement.style.setProperty('--current-color', coverPalette($currentTrack)[0]);

  function schedulePersistence(state: PlayerState) {
    if (!hydrated) return;
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      void Promise.all([
        saveFavoriteIds(state.favoriteIds),
        saveRecentlyPlayed(state.recentlyPlayed),
        saveStoredPlaylists(state.playlists)
      ]);
    }, 400);
  }

  function pushToast(message: string, tone: Toast['tone']) {
    const id = ++toastId;
    toasts = [...toasts, { id, message, tone }].slice(-4);
    window.setTimeout(() => {
      toasts = toasts.filter((toast) => toast.id !== id);
    }, 3600);
  }

  function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Something went wrong.';
  }

  function coverPalette(track: Track | undefined) {
    return track?.palette ?? ['#d7ff73', '#8bd3ff', '#101314'];
  }

  function coverStyle(track: Track | undefined) {
    const palette = coverPalette(track);
    return `background: radial-gradient(circle at 24% 18%, ${palette[0]}, transparent 34%), radial-gradient(circle at 80% 80%, ${palette[1]}, transparent 38%), linear-gradient(145deg, ${palette[2]}, #111);`;
  }

  function providerStatusTone(status: ProviderStatus) {
    if (status.state === 'connected') return 'text-[#d7ff73]';
    if (status.state === 'unavailable') return 'text-[#ffafcc]';
    return 'text-[#8bd3ff]';
  }

  function setThemeMode(mode: ThemeMode) {
    themeMode = mode;
    window.localStorage.setItem('myMusicTheme', mode);
    applyThemeMode(mode);
  }

  function applyThemeMode(mode: ThemeMode) {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
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

  async function loadDiscoveryShelves() {
    if (!getProviderStatuses().some((status) => status.state === 'connected')) return;
    discoveryShelves = discoveryShelves.map((shelf) => ({ ...shelf, loading: true }));
    await Promise.all(
      discoveryShelves.map(async (shelf) => {
        try {
          const result = await searchMusic(shelf.query, { limit: 8 });
          discoveryShelves = discoveryShelves.map((item) => item.id === shelf.id ? { ...item, tracks: result.tracks, loading: false } : item);
        } catch {
          discoveryShelves = discoveryShelves.map((item) => item.id === shelf.id ? { ...item, loading: false } : item);
        }
      })
    );
  }

  function triggerGlassBreak() {
    glassBreak = true;
    window.setTimeout(() => (glassBreak = false), 800);
  }

  function handlePointerDown(event: PointerEvent) {
    rippleId += 1;
    const ripple = { id: rippleId, x: event.clientX, y: event.clientY };
    ripples = [...ripples, ripple].slice(-8);
    window.setTimeout(() => {
      ripples = ripples.filter((item) => item.id !== ripple.id);
    }, 760);
  }

  async function playProviderResult(result: MusicTrack) {
    if (result.previewUrl) {
      player.upsertTracks([toPlayerTrack(result)]);
      await playTrack(toPlayerTrack(result));
      return;
    }

    if (result.embedUrl && result.playbackMode === 'YOUTUBE') {
      youtubeEmbedUrl = result.embedUrl;
      player.playTrack(result.id);
      await saveRecentlyPlayed([$player.currentTrackId, ...$player.recentlyPlayed].filter(Boolean));
      pushToast('Playing through the official YouTube embed.', 'success');
      return;
    }

    if (result.externalUrl) openExternalUrl(result.externalUrl);
  }

  function playProviderNext(result: MusicTrack) {
    player.playNext(toPlayerTrack(result));
    pushToast(`${result.title} queued next.`, 'success');
  }

  function addProviderToQueue(result: MusicTrack) {
    player.addToQueue(toPlayerTrack(result));
    pushToast(`${result.title} added to queue.`, 'success');
  }

  function addProviderToPlaylist(playlistId: string, result: MusicTrack) {
    if (!playlistId) return;
    player.addTrackToPlaylist(playlistId, toPlayerTrack(result));
    pushToast(`${result.title} added to playlist.`, 'success');
  }

  function addTrackToPlaylist(playlistId: string, track: Track) {
    if (!playlistId) return;
    player.addTrackToPlaylist(playlistId, track);
    pushToast(`${track.title} added to playlist.`, 'success');
  }

  function toggleFavorite(track: Track) {
    player.toggleFavorite(track.id);
  }

  function playNext(track: Track) {
    player.playNext(track);
    pushToast(`${track.title} queued next.`, 'success');
  }

  function addToQueue(track: Track) {
    player.addToQueue(track);
    pushToast(`${track.title} added to queue.`, 'success');
  }

  function playTrackIds(ids: string[]) {
    if (!ids.length) return;
    player.playTrack(ids[0]);
    for (const id of ids.slice(1)) {
      const track = $player.tracks.find((item) => item.id === id);
      if (track) player.addToQueue(track);
    }
  }

  async function playTrack(track: Track) {
    youtubeEmbedUrl = '';
    if (track.source === 'local') {
      const playableUrl = await createPlayableUrl(track);
      if (!playableUrl) {
        pushToast('The local audio file is no longer available.', 'error');
        return;
      }
      audioTrackId = track.id;
      player.playTrack(track.id);
      await tickAudio(playableUrl);
      return;
    }

    if (track.previewUrl) {
      audioTrackId = track.id;
      player.playTrack(track.id);
      await tickAudio(track.previewUrl);
      return;
    }

    if (track.embedUrl && track.playbackMode === 'YOUTUBE') {
      youtubeEmbedUrl = track.embedUrl;
      player.playTrack(track.id);
      pushToast('Playing through the official YouTube embed.', 'success');
      return;
    }

    if (track.externalUrl) openExternalUrl(track.externalUrl);
  }

  async function tickAudio(url: string) {
    if (!audioElement) return;
    audioElement.src = url;
    audioElement.volume = $player.volume / 100;
    try {
      await audioElement.play();
    } catch {
      pushToast('Browser playback permission is required.', 'info');
    }
  }

  function toggleTrack(track: Track) {
    if ($player.currentTrackId === track.id && $player.isPlaying) {
      audioElement?.pause();
      player.setPlaying(false);
      return;
    }
    void playTrack(track);
  }

  function handleAudioEnded() {
    player.playNext();
  }

  function handleAudioLoadedMetadata() {
    if (audioElement && Number.isFinite(audioElement.duration)) {
      player.setCurrentDuration(audioElement.duration);
    }
  }

  function handleAudioTimeUpdate() {
    if (audioElement) player.setCurrentTime(audioElement.currentTime);
    if (!analyser || !frequencyData) return;
    analyser.getByteFrequencyData(frequencyData);
    let sum = 0;
    for (const value of frequencyData) sum += value;
    const average = sum / frequencyData.length / 255;
    visualLevel = Math.min(1, 0.08 + average * 1.8);
  }

  function handleVolume(event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    player.setVolume(value);
    if (audioElement) audioElement.volume = value / 100;
  }

  function openExternalUrl(url?: string) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openAddMusic() {
    isImportOpen = true;
    scanError = '';
  }

  function closeAddMusic() {
    if (isImporting) return;
    isImportOpen = false;
  }

  function openFilePicker(mode: 'songs' | 'folder') {
    fileInputMode = mode;
    fileInput?.click();
  }

  async function handleFileInputChange(event: Event) {
    const files = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
    if (!files.length) return;
    await importFiles(files);
    (event.currentTarget as HTMLInputElement).value = '';
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    const items = Array.from(event.dataTransfer?.items ?? []);
    if (!items.length) return;
    await importDropped(items);
  }

  async function importDropped(items: DataTransferItem[]) {
    isImporting = true;
    scanError = '';
    try {
      const result = await scanDroppedItems(items, (current, total, name) => {
        importCurrent = current;
        importTotal = total;
        importFileName = name;
      });
      await finalizeImport(result.tracks);
      scanStatus = `${result.added} added, ${result.duplicates} duplicates skipped.`;
    } catch (error: unknown) {
      scanError = getErrorMessage(error);
    } finally {
      isImporting = false;
    }
  }

  async function importFiles(files: File[]) {
    isImporting = true;
    scanError = '';
    try {
      const result = await scanFiles(files, (current, total, name) => {
        importCurrent = current;
        importTotal = total;
        importFileName = name;
      });
      await finalizeImport(result.tracks);
      scanStatus = `${result.added} added, ${result.duplicates} duplicates skipped.`;
    } catch (error: unknown) {
      scanError = getErrorMessage(error);
    } finally {
      isImporting = false;
    }
  }

  async function scanLocalFolder() {
    if (!canScanFolders()) {
      openFilePicker('folder');
      return;
    }
    isImporting = true;
    scanError = '';
    try {
      const result = await scanFolder((current, total, name) => {
        importCurrent = current;
        importTotal = total;
        importFileName = name;
      });
      await finalizeImport(result.tracks);
      scanStatus = `${result.added} added, ${result.duplicates} duplicates skipped.`;
    } catch (error: unknown) {
      scanError = getErrorMessage(error);
    } finally {
      isImporting = false;
    }
  }

  async function finalizeImport(tracks: Track[]) {
    if (!tracks.length) return;
    player.appendTracks(tracks);
    await saveStoredTracks(tracks);
    hydrated = true;
  }

  async function saveStoredTracks(tracks: Track[]) {
    await Promise.all(tracks.map((track) => updateStoredTrack(track)));
  }

  async function clearLocalLibrary() {
    await clearStoredTracks();
    player.clearLocalTracks();
    pushToast('Local music metadata cleared.', 'success');
  }

  function clearRecentHistory() {
    player.clearRecentlyPlayed();
  }

  function clearFavorites() {
    player.clearFavorites();
  }

  function dismissIntro() {
    showIntro = false;
    window.localStorage.setItem('myMusicIntroSeen', 'true');
  }

  function toggleImmersive() {
    isImmersive = !isImmersive;
    if (isImmersive) triggerGlassBreak();
  }

  $: localTracks = $player.tracks.filter((track) => track.source === 'local');
  $: onlineTracks = $player.tracks.filter((track) => track.source !== 'local');
  $: filtered = $filteredTracks;
  $: localCount = localTracks.length;
  $: onlineCount = onlineTracks.length;
  $: anyProviderEnabled = providerStatuses.some((status) => status.state === 'connected');
  $: artistGroups = groupArtists($player.tracks);
  $: albumGroups = groupAlbums($player.tracks);
  $: filteredPlaylists = $player.playlists.filter((playlist) => !selectedPlaylistId || playlist.id === selectedPlaylistId);
  $: selectedPlaylist = $player.playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? $player.playlists[0];
  $: currentPlaylistTracks = selectedPlaylist ? selectedPlaylist.trackIds.map((id) => $player.tracks.find((track) => track.id === id)).filter((track): track is Track => Boolean(track)) : [];
  $: searchSections = getSearchSections(searchResult, searchTab);
  $: rootStyle = `--tilt-x: ${motionY * -4}deg; --tilt-y: ${motionX * 4}deg; --visual-level: ${visualLevel};`;

  function groupArtists(tracks: Track[]) {
    const groups = new Map<string, Map<string, Track[]>>();
    for (const track of tracks) {
      const albumMap = groups.get(track.artist) ?? new Map<string, Track[]>();
      const list = albumMap.get(track.album) ?? [];
      list.push(track);
      albumMap.set(track.album, list);
      groups.set(track.artist, albumMap);
    }
    return Array.from(groups.entries());
  }

  function groupAlbums(tracks: Track[]) {
    const groups = new Map<string, Track[]>();
    for (const track of tracks) {
      const key = `${track.artist}::${track.album}`;
      const list = groups.get(key) ?? [];
      list.push(track);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([id, tracks]) => ({
      id,
      name: tracks[0].album,
      artist: tracks[0].artist,
      tracks,
      duration: tracks.reduce((sum, track) => sum + track.duration, 0),
      coverTrack: tracks[0]
    }));
  }

  function getSearchSections(result: UnifiedSearchResult, tab: SearchTab) {
    return {
      tracks: tab === 'all' || tab === 'songs' ? result.tracks : [],
      artists: tab === 'all' || tab === 'artists' ? result.artists : [],
      albums: tab === 'all' || tab === 'albums' ? result.albums : []
    };
  }

  async function runSearch(query = onlineSearchQuery) {
    const trimmed = query.trim();
    if (!trimmed) {
      searchResult = emptySearchResult;
      return;
    }
    searchAbortController?.abort();
    searchAbortController = new AbortController();
    isSearching = true;
    try {
      searchResult = await searchMusic(trimmed, { limit: 12, signal: searchAbortController.signal });
    } catch (error: unknown) {
      if (!searchAbortController.signal.aborted) pushToast(getErrorMessage(error), 'error');
    } finally {
      isSearching = false;
    }
  }

  function handleSearchInput(event: Event) {
    onlineSearchQuery = (event.currentTarget as HTMLInputElement).value;
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void runSearch(), 260);
  }

  $: if (onlineSearchQuery.trim() && $player.activeView === 'search') {
    void runSearch(onlineSearchQuery);
  }

  $: if (hydrated && visualFrame === 0) {
    visualFrame = window.requestAnimationFrame(() => {
      visualFrame = 0;
    });
  }

  $: currentCover = $currentTrack?.artwork || '';

  async function togglePlayback() {
    if (!$currentTrack) return;
    if ($player.isPlaying) {
      audioElement?.pause();
      player.setPlaying(false);
      return;
    }
    await playTrack($currentTrack);
  }

  async function skipTrack(direction: 'next' | 'previous') {
    if (direction === 'next') player.playNext();
    else player.playPrevious();
    const next = $player.tracks.find((track) => track.id === $player.currentTrackId);
    if (next) await playTrack(next);
  }

  function seek(event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    player.seek(value);
    if (audioElement) audioElement.currentTime = value;
  }

  function shuffleTracks() {
    player.shuffle();
  }

  function cycleRepeat() {
    player.cycleRepeat();
  }

  function selectGenre(genre: string) {
    player.setGenre(genre);
  }

  function toggleMute() {
    player.setMuted(!$player.isMuted);
  }

  function handleGlobalPointerDown(event: PointerEvent) {
    handlePointerDown(event);
  }

  async function handleWheel() {
    if (isImmersive) return;
  }

  function getVisualiserData() {
    if (!frequencyData) return [];
    return Array.from(frequencyData.slice(0, 18));
  }

  function updateAnalyser() {
    if (!audioContext || !audioElement) return;
    if (!analyser) {
      try {
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        if (!mediaSource) mediaSource = audioContext.createMediaElementSource(audioElement);
        mediaSource.connect(analyser);
        analyser.connect(audioContext.destination);
      } catch {
        analyser = undefined;
        frequencyData = undefined;
      }
    }
  }

  function ensureAudioContext() {
    if (!audioContext) {
      audioContext = new AudioContext();
      updateAnalyser();
    }
    if (audioContext.state === 'suspended') void audioContext.resume();
  }

  function handleAudioPlay() {
    ensureAudioContext();
    player.setPlaying(true);
  }

  function handleAudioPause() {
    if ($currentTrack?.source === 'local' && !audioElement?.ended) player.setPlaying(false);
  }

  function handleGlobalKey(event: KeyboardEvent) {
    if (event.key === ' ' && !isTypingTarget(event.target)) {
      event.preventDefault();
      void togglePlayback();
    }
    if (event.key === 'Escape') {
      showIntro = false;
      isImportOpen = false;
      youtubeEmbedUrl = '';
    }
  }

  function isTypingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
  }
</script>

<svelte:window on:pointerdown={handleGlobalPointerDown} on:keydown={handleGlobalKey} />

<main class:immersive={isImmersive} class="immersive-shell min-h-screen text-zinc-100" style={rootStyle}>
  <div class="ambient-stage">
    <div class="ambient-grid"></div>
    <div class="ambient-orb ambient-orb-a"></div>
    <div class="ambient-orb ambient-orb-b"></div>
  </div>

  <header class="sticky top-0 z-40 border-b border-white/10 bg-[#101314]/85 backdrop-blur-xl">
    <div class="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 lg:px-6">
      <button type="button" class="glass-control shrink-0" on:click={() => player.setView('home')} title="Home">
        <Disc3 size={18} />
      </button>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold">My Music</p>
        <p class="truncate text-[11px] text-zinc-500">Local library + official music discovery</p>
      </div>
      <div class="hidden items-center gap-2 sm:flex">
        <span class="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] text-zinc-400">3D Audio Space</span>
        <button type="button" class="glass-control" on:click={toggleImmersive} title="Immersive mode">
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  </header>

  <div class="relative z-10 mx-auto grid max-w-[1500px] gap-4 px-3 pb-28 pt-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-6">
    <aside class="hidden rounded-xl border border-white/10 bg-black/20 p-2 backdrop-blur-xl lg:block">
      <nav class="space-y-1">
        {#each navItems as item}
          <button type="button" class={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${$player.activeView === item.id ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/6 hover:text-white'}`} on:click={() => player.setView(item.id)}>
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        {/each}
      </nav>
    </aside>

    <section class="min-w-0">
      <div class="mb-4 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
        {#each navItems.slice(0, 6) as item}
          <button type="button" class={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs ${$player.activeView === item.id ? 'border-white/20 bg-white/12 text-white' : 'border-white/8 bg-black/15 text-zinc-400'}`} on:click={() => player.setView(item.id)}>
            <item.icon size={14} />{item.label}
          </button>
        {/each}
      </div>

      {#if $player.activeView === 'search'}
        <section class="rounded-xl border border-white/10 bg-black/18 p-4 backdrop-blur-xl">
          <div class="flex flex-col gap-3 md:flex-row md:items-center">
            <div class="relative min-w-0 flex-1">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input class="h-12 w-full rounded-lg border border-white/10 bg-black/24 pl-10 pr-4 text-sm outline-none transition focus:border-white/25 focus:ring-2 focus:ring-[#d7ff73]/10" placeholder="Search songs, artists, albums..." value={onlineSearchQuery} on:input={handleSearchInput} />
            </div>
            <div class="flex gap-2 overflow-x-auto">
              {#each searchTabs as tab}
                <button type="button" class={`h-10 shrink-0 rounded-full px-4 text-xs font-semibold ${searchTab === tab.id ? 'bg-white text-[#101314]' : 'bg-white/7 text-zinc-400'}`} on:click={() => (searchTab = tab.id)}>{tab.label}</button>
              {/each}
            </div>
          </div>

          {#if isSearching}
            <div class="mt-5 grid place-items-center py-14 text-sm text-zinc-500"><LoaderCircle class="animate-spin" size={24} />Searching official providers...</div>
          {:else if searchResult.generatedAt}
            <div class="mt-5 grid gap-6">
              {#if searchSections.tracks.length}
                <div>
                  <div class="mb-3 flex items-center justify-between"><h2 class="text-sm font-semibold">Songs</h2><span class="text-xs text-zinc-500">{searchSections.tracks.length} results</span></div>
                  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{#each searchSections.tracks as result}{@render OnlineTrackCard(result)}{/each}</div>
                </div>
              {/if}
              {#if searchSections.artists.length}
                <div>
                  <div class="mb-3 flex items-center justify-between"><h2 class="text-sm font-semibold">Artists</h2></div>
                  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{#each searchSections.artists as result}{@render OnlineEntityCard(result, 'artist')}{/each}</div>
                </div>
              {/if}
              {#if searchSections.albums.length}
                <div>
                  <div class="mb-3 flex items-center justify-between"><h2 class="text-sm font-semibold">Albums</h2></div>
                  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{#each searchSections.albums as result}{@render OnlineEntityCard(result, 'album')}{/each}</div>
                </div>
              {/if}
              {#if !searchSections.tracks.length && !searchSections.artists.length && !searchSections.albums.length}
                <div class="rounded-lg border border-dashed border-white/12 p-8 text-center"><WifiOff class="mx-auto text-zinc-500" size={30} /><p class="mt-3 text-sm font-semibold">No results</p><p class="mt-1 text-sm text-zinc-500">Connect/configure a provider or try another search.</p></div>
              {/if}
            </div>
          {:else}
            <div class="mt-5 grid place-items-center rounded-lg border border-dashed border-white/12 py-14 text-center"><Search class="mx-auto text-zinc-500" size={30} /><p class="mt-3 text-lg font-semibold">Start with a song, artist, or album</p><p class="mt-1 text-sm text-zinc-500">Search local metadata and every enabled provider.</p></div>
          {/if}
        </section>
      {:else if $player.activeView === 'settings'}
        <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section class="rounded-lg border border-white/10 bg-black/18 p-4"><h2 class="text-lg font-semibold">Appearance</h2><p class="mt-2 text-sm text-zinc-500">Choose how My Music should present the interface.</p><div class="mt-4 grid grid-cols-3 gap-2">{#each themeModes as mode}<button type="button" class={`h-10 rounded-md text-sm font-semibold ${themeMode === mode.id ? 'bg-white text-[#101314]' : 'bg-white/8 text-zinc-300'}`} on:click={() => setThemeMode(mode.id)}>{mode.label}</button>{/each}</div></section>
          <section class="rounded-lg border border-white/10 bg-black/18 p-4"><h2 class="text-lg font-semibold">About</h2><div class="mt-4 space-y-3 text-sm text-zinc-400"><div class="flex items-center justify-between gap-3"><span>My Music</span><span class="font-semibold text-zinc-100">0.1.0</span></div><button type="button" class="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/8 text-sm font-semibold text-zinc-100" on:click={() => openExternalUrl('https://github.com/kumar057/my-music')}><ExternalLink size={15} />GitHub</button></div></section>
          <section class="rounded-lg border border-white/10 bg-black/18 p-4 xl:col-span-2"><h2 class="text-lg font-semibold">Music Providers</h2><div class="mt-4 grid gap-3 md:grid-cols-3">{#each providerStatuses as status}<div class="rounded-lg border border-white/10 bg-white/[0.06] p-4"><div class="flex items-start justify-between gap-3"><div><p class="text-sm font-semibold">{status.name}</p><p class={`mt-1 text-xs ${providerStatusTone(status)}`}>{status.message}</p></div><Radio size={18} class={providerStatusTone(status)} /></div><div class="mt-4 flex gap-2">{#if status.state === 'connected'}<button type="button" class="h-9 rounded-md border border-white/10 bg-white/8 px-3 text-xs font-semibold" on:click={() => disconnectProvider(status)}>Disconnect</button>{:else}<button type="button" class="h-9 rounded-md bg-white px-3 text-xs font-semibold text-[#101314]" on:click={() => connectProvider(status)}>{status.connectLabel ?? 'Connect'}</button>{/if}</div></div>{/each}</div></section>
          <section class="rounded-lg border border-white/10 bg-black/18 p-4"><h2 class="text-lg font-semibold">Playback</h2><div class="mt-4 space-y-3 text-sm text-zinc-400"><div class="flex items-center justify-between gap-3"><span>Volume</span><span class="font-semibold text-zinc-100">{$player.volume}%</span></div><label class="relative flex h-5 items-center"><span class="absolute h-1 w-full rounded-full bg-white/12"></span><span class="absolute h-1 rounded-full bg-[#8bd3ff]" style={`width: ${$player.volume}%`}></span><input aria-label="Volume" class="relative z-10 h-5 w-full cursor-pointer opacity-0" type="range" min="0" max="100" value={$player.volume} on:input={handleVolume} /></label><p>Autoplay follows browser permission rules. Crossfade is a UI placeholder until browser-safe mixing is added.</p></div></section>
          <section class="rounded-lg border border-white/10 bg-black/18 p-4 xl:col-span-2"><h2 class="text-lg font-semibold">Local Library</h2><div class="mt-4 flex flex-wrap gap-2"><button type="button" class="h-10 rounded-md bg-[#d7ff73] px-4 text-sm font-semibold text-[#101314]" on:click={openAddMusic}>Add Local Music</button><button type="button" class="h-10 rounded-md border border-[#ffafcc]/30 bg-[#ffafcc]/10 px-4 text-sm font-semibold text-[#ffcfdf]" on:click={clearLocalLibrary}>Clear local music metadata</button><button type="button" class="h-10 rounded-md border border-white/10 bg-white/8 px-4 text-sm font-semibold text-zinc-100" on:click={clearRecentHistory}>Clear recently played</button><button type="button" class="h-10 rounded-md border border-white/10 bg-white/8 px-4 text-sm font-semibold text-zinc-100" on:click={clearFavorites}>Clear favorites</button></div><p class="mt-3 text-sm leading-6 text-zinc-500">Local files stay on this device. Provider playlists and favorites store only IDs and metadata.</p></section>
        </div>
      {:else if $player.activeView === 'home' || $player.activeView === 'discover'}
        <div class="space-y-4">
          <section class="hero-panel overflow-hidden rounded-lg border border-white/10 bg-black/18 p-5 sm:p-6"><div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-center"><div><p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#d7ff73]">MY MUSIC</p><h2 class="mt-3 text-balance text-3xl font-semibold sm:text-5xl">Your music. Your world.</h2><p class="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">Search official providers, play permitted previews and embeds, and keep your own local library offline.</p><div class="mt-6 flex flex-col gap-3 sm:flex-row"><button type="button" class="glass-primary h-11 rounded-md px-5 text-sm font-semibold" on:click={() => { triggerGlassBreak(); player.setView('search'); }}>Explore Music</button><button type="button" class="h-11 rounded-md border border-white/10 bg-white/8 px-5 text-sm font-semibold" on:click={openAddMusic}>Local Music</button></div></div><div class="album-depth-card mx-auto w-full max-w-[260px]"><div class="aspect-square rounded-lg" style={coverStyle($currentTrack)}></div></div></div></section>
          {#each discoveryShelves as shelf}<section class="rounded-lg border border-white/10 bg-black/16 p-4"><div class="flex items-center justify-between"><h2 class="text-sm font-semibold">{shelf.title}</h2><span class="text-xs text-zinc-500">{shelf.query}</span></div><div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{#if shelf.loading}{#each Array.from({ length: 4 }) as _}<div class="skeleton-card h-44 rounded-lg border border-white/10 bg-white/6"></div>{/each}{:else}{#each shelf.tracks as result}{@render CompactProviderCard(result)}{:else}<div class="rounded-md border border-dashed border-white/12 p-4 text-sm text-zinc-500 sm:col-span-2 xl:col-span-4">{anyProviderEnabled ? 'No official results for this shelf yet.' : 'Connect or configure a provider to populate this shelf.'}</div>{/each}{/if}</div></section>{/each}
          <section class="rounded-lg border border-white/10 bg-black/16 p-4"><div class="flex items-center justify-between"><h2 class="text-sm font-semibold">Local Music</h2><button type="button" class="text-xs font-medium text-[#d7ff73]" on:click={() => player.setView('local')}>View</button></div><div class="mt-3 space-y-1">{#each localTracks.slice(0, 6) as track}{@render TrackRow(track, true)}{:else}<p class="text-sm text-zinc-500">No local songs imported yet.</p>{/each}</div></section>
        </div>
      {:else if $player.tracks.length === 0}
        <div class="grid min-h-[360px] place-items-center rounded-md border border-dashed border-white/12 bg-black/12 p-6 text-center"><div><div class="mx-auto grid size-14 place-items-center rounded-md bg-white/8 text-zinc-300"><FileMusic size={26} /></div><p class="mt-4 text-lg font-semibold text-white">Your library is empty</p><p class="mt-1 text-sm text-zinc-400">Add music from your device to start listening.</p><button type="button" class="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#d7ff73] px-5 text-sm font-semibold text-[#101314]" on:click={openAddMusic}><Plus size={18} /><span>Add Music</span></button></div></div>
      {:else if $player.activeView === 'artists'}
        <div class="space-y-3">{#each artistGroups as [artist, albums]}<section class="rounded-md bg-black/16 p-4"><h2 class="text-base font-semibold">{artist}</h2><div class="mt-3 space-y-3">{#each Array.from(albums) as [album, tracks]}<div class="rounded-md border border-white/10 bg-white/5 p-3"><div class="flex items-center justify-between gap-3"><div class="min-w-0"><p class="truncate text-sm font-semibold">{album}</p><p class="mt-1 text-xs text-zinc-500">{tracks.length} songs</p></div><button type="button" class="grid size-9 place-items-center rounded-md bg-white text-[#101314]" on:click={() => playTrackIds(tracks.map((track) => track.id))} title="Play album"><Play size={16} /></button></div><div class="mt-2 space-y-1">{#each tracks as track}{@render TrackRow(track, true)}{/each}</div></div>{/each}</div></section>{/each}</div>
      {:else if $player.activeView === 'albums'}
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{#each albumGroups as album}<section class="rounded-md border border-white/10 bg-black/16 p-3"><div class="aspect-square rounded-md p-3" style={coverStyle(album.coverTrack)}><div class="flex h-full items-end"><div class="w-full rounded-md bg-black/35 p-3 backdrop-blur-md"><p class="truncate text-sm font-semibold">{album.name}</p><p class="mt-1 truncate text-xs text-white/70">{album.artist}</p></div></div></div><div class="mt-3 flex items-center justify-between gap-2"><div class="min-w-0 text-xs text-zinc-500">{album.tracks.length} tracks - {formatDuration(album.duration)}</div><button type="button" class="grid size-9 place-items-center rounded-md bg-white text-[#101314]" on:click={() => playTrackIds(album.tracks.map((track) => track.id))} title="Play album"><Play size={16} /></button></div></section>{/each}</div>
      {:else if $player.activeView === 'playlists'}
        <div class="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]"><section class="rounded-md bg-black/16 p-4"><h2 class="text-sm font-semibold">Playlists</h2><div class="mt-3 flex gap-2"><input class="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-black/22 px-3 text-sm outline-none placeholder:text-zinc-500" placeholder="New playlist" bind:value={newPlaylistName} /><button type="button" class="grid size-10 place-items-center rounded-md bg-[#d7ff73] text-[#101314]" on:click={createPlaylist}><Plus size={18} /></button></div><div class="mt-4 space-y-1">{#each filteredPlaylists as playlist}<button type="button" class={`flex h-12 w-full items-center justify-between gap-2 rounded-md px-3 text-left ${selectedPlaylistId === playlist.id ? 'bg-white/14' : 'hover:bg-white/8'}`} on:click={() => (selectedPlaylistId = playlist.id)}><span class="min-w-0"><span class="block truncate text-sm font-semibold">{playlist.name}</span><span class="text-xs text-zinc-500">{playlist.trackIds.length} songs</span></span><Library size={16} class="shrink-0 text-zinc-500" /></button>{:else}<p class="text-sm text-zinc-500">No playlists yet.</p>{/each}</div></section>
        <section class="rounded-md bg-black/16 p-4"><div class="flex items-center justify-between"><div><h2 class="text-sm font-semibold">{selectedPlaylist?.name ?? 'Playlist'}</h2><p class="mt-1 text-xs text-zinc-500">{currentPlaylistTracks.length} songs</p></div><button type="button" class="grid size-9 place-items-center rounded-md bg-white text-[#101314]" on:click={() => playTrackIds(currentPlaylistTracks.map((track) => track.id))}><Play size={16} /></button></div><div class="mt-3 space-y-1">{#each currentPlaylistTracks as track}{@render TrackRow(track, false)}{:else}<p class="text-sm text-zinc-500">This playlist is empty.</p>{/each}</div></section></div>
      {:else}
        <div class="space-y-2">{#each filtered as track}{@render TrackRow(track, false)}{:else}<div class="grid min-h-[300px] place-items-center rounded-lg border border-dashed border-white/12 text-center text-sm text-zinc-500">No tracks in this view.</div>{/each}</div>
      {/if}
    </section>
  </div>

  {#if $currentTrack}
    <footer class="fixed bottom-3 left-3 right-3 z-40 mx-auto max-w-[1200px] rounded-xl border border-white/10 bg-[#101314]/88 p-3 shadow-2xl backdrop-blur-2xl">
      <div class="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div class="flex min-w-0 items-center gap-3"><div class="size-12 shrink-0 rounded-lg" style={coverStyle($currentTrack)}></div><div class="min-w-0"><p class="truncate text-sm font-semibold">{$currentTrack.title}</p><p class="truncate text-xs text-zinc-500">{$currentTrack.artist}</p></div></div>
        <div class="flex items-center justify-center gap-2"><button type="button" class="glass-control" on:click={() => void skipTrack('previous')}><SkipBack size={16} /></button><button type="button" class="glass-play grid size-12 place-items-center" on:click={() => void togglePlayback()}>{#if $player.isPlaying}<Pause size={18} />{:else}<Play size={18} />{/if}</button><button type="button" class="glass-control" on:click={() => void skipTrack('next')}><SkipForward size={16} /></button></div>
        <div class="hidden items-center justify-end gap-3 md:flex"><button type="button" class="glass-control" on:click={shuffleTracks}><Shuffle size={16} /></button><button type="button" class="glass-control" on:click={cycleRepeat}>{#if $player.repeatMode === 'one'}<Repeat1 size={16} />{:else}<Repeat size={16} />{/if}</button><button type="button" class="glass-control" on:click={toggleMute}>{#if $player.isMuted}<VolumeX size={16} />{:else}<Volume2 size={16} />{/if}</button></div>
      </div>
      <div class="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-[#d7ff73] transition-[width]" style={`width: ${$player.currentDuration ? Math.min(100, ($player.currentTime / $player.currentDuration) * 100) : 0}%`}></div></div>
    </footer>
  {/if}

  {#if isImmersive}
    <section class="fixed inset-0 z-50 grid place-items-center bg-[#050606]/92 p-6 backdrop-blur-2xl">
      <div class="immersive-visual w-full max-w-[900px] rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <div class="visual-orb visual-orb-large"><span></span><span></span><span></span></div>
        <div class="immersive-art mx-auto aspect-square rounded-2xl border border-white/10 p-3" style={coverStyle($currentTrack)}><div class="h-full rounded-xl bg-black/10 backdrop-blur-sm"></div></div>
        <p class="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-[#d7ff73]">IMMERSIVE AUDIO</p>
        <h2 class="mt-2 text-2xl font-semibold">{$currentTrack?.title ?? 'Choose a track'}</h2>
        <p class="mt-1 text-sm text-zinc-500">{$currentTrack?.artist ?? 'Your music space'}</p>
        <div class="mt-7 flex justify-center gap-3"><button type="button" class="glass-control" on:click={() => void skipTrack('previous')}><SkipBack size={16} /></button><button type="button" class="glass-play grid size-14 place-items-center" on:click={() => void togglePlayback()}>{#if $player.isPlaying}<Pause size={20} />{:else}<Play size={20} />{/if}</button><button type="button" class="glass-control" on:click={() => void skipTrack('next')}><SkipForward size={16} /></button></div>
        <button type="button" class="mt-8 text-xs text-zinc-500 hover:text-white" on:click={toggleImmersive}>Exit immersive mode</button>
      </div>
    </section>
  {/if}

  {#if glassBreak}<div class="glass-fracture" aria-hidden="true"><span></span><span></span><span></span><span></span></div>{/if}
  {#each ripples as ripple}<div class="glass-ripple" style={`left:${ripple.x}px;top:${ripple.y}px`} aria-hidden="true"></div>{/each}

  {#if showIntro}
    <section class="intro-screen">
      <div class="intro-depth"><div class="intro-disc"><Disc3 size={42} /><span class="sr-only">My Music</span></div><p class="text-xs font-semibold uppercase tracking-[0.25em] text-[#d7ff73]">MY MUSIC</p><h1 class="mt-3 text-4xl font-semibold sm:text-6xl">Your music. Your world.</h1><p class="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-400">A local-first player with official music discovery, glass surfaces, and a new 3D audio space.</p><div class="intro-wave mt-7"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><button type="button" class="glass-primary mt-8 h-11 rounded-md px-5 text-sm font-semibold" on:click={dismissIntro}>Enter My Music</button></div>
    </section>
  {/if}

  {#if isImportOpen}
    <div class="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-xl">
      <section class="w-full max-w-xl rounded-xl border border-white/10 bg-[#111516]/96 p-5 shadow-2xl"><div class="flex items-start justify-between gap-3"><div><h2 class="text-lg font-semibold">Add Your Music</h2><p class="mt-1 text-sm text-zinc-400">Select music from your device.</p></div><button type="button" class="grid size-9 place-items-center rounded-md bg-white/8 text-zinc-300" on:click={closeAddMusic}><X size={18} /></button></div><div class="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" class="flex h-12 items-center justify-center gap-2 rounded-md bg-[#d7ff73] px-4 text-sm font-semibold text-[#101314] disabled:opacity-70" disabled={isImporting} on:click={() => openFilePicker('songs')}><FileMusic size={18} /><span>Select Songs</span></button><button type="button" class="flex h-12 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/8 px-4 text-sm font-semibold text-zinc-100 disabled:opacity-70" disabled={isImporting} on:click={scanLocalFolder}><FolderOpen size={18} /><span>Select Folder</span></button></div><button type="button" class={`mt-4 grid min-h-[180px] w-full place-items-center rounded-lg border border-dashed p-6 text-center transition ${isDragOver ? 'border-[#d7ff73] bg-[#d7ff73]/10' : 'border-white/16 bg-black/18 hover:bg-black/24'}`} on:dragenter|preventDefault={() => (isDragOver = true)} on:dragover|preventDefault={() => (isDragOver = true)} on:dragleave|preventDefault={() => (isDragOver = false)} on:drop={handleDrop} on:click={() => openFilePicker('songs')}><span><span class="mx-auto grid size-12 place-items-center rounded-md bg-white/8 text-zinc-200"><UploadCloud size={24} /></span><span class="mt-3 block text-sm font-semibold text-white">Drag & Drop your music here</span><span class="mt-1 block text-xs text-zinc-500">MP3, WAV, FLAC, M4A, AAC, OGG, OPUS, AIFF, and WebM where Chrome supports them.</span></span></button><div class="mt-4 grid gap-2 sm:grid-cols-3"><div class="rounded-md border border-white/10 bg-black/18 p-3"><p class="text-xs text-zinc-500">IndexedDB</p><p class="mt-1 flex items-center gap-2 text-sm font-semibold">{#if browserCapabilities.indexedDb}<CheckCircle2 size={15} class="text-[#d7ff73]" /><span>Available</span>{:else}<AlertCircle size={15} class="text-[#ffafcc]" /><span>Unavailable</span>{/if}</p></div><div class="rounded-md border border-white/10 bg-black/18 p-3"><p class="text-xs text-zinc-500">Folder Picker</p><p class="mt-1 flex items-center gap-2 text-sm font-semibold">{#if browserCapabilities.folderPicker || browserCapabilities.directoryInput}<CheckCircle2 size={15} class="text-[#d7ff73]" /><span>Supported</span>{:else}<AlertCircle size={15} class="text-[#ffafcc]" /><span>Files only</span>{/if}</p></div><div class="rounded-md border border-white/10 bg-black/18 p-3"><p class="text-xs text-zinc-500">Storage</p><p class="mt-1 text-sm font-semibold">Local only</p></div></div>{#if isImporting}<div class="mt-4 rounded-md border border-white/10 bg-black/18 p-3"><div class="flex items-center justify-between gap-3 text-sm"><span class="flex min-w-0 items-center gap-2"><LoaderCircle size={16} class="shrink-0 animate-spin text-[#d7ff73]" /><span class="truncate">Importing {importFileName || 'music'}...</span></span><span class="shrink-0 text-zinc-400">{importCurrent} / {importTotal}</span></div><div class="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-[#d7ff73]" style={`width: ${importTotal > 0 ? Math.round((importCurrent / importTotal) * 100) : 8}%`}></div></div></div>{/if}{#if scanError}<div class="mt-4 rounded-md border border-[#ffafcc]/30 bg-[#ffafcc]/10 p-3 text-sm text-[#ffcfdf]">{scanError}</div>{/if}</section>
    </div>
  {/if}

  <div class="fixed right-3 top-3 z-50 grid w-[min(360px,calc(100vw-1.5rem))] gap-2">{#each toasts as toast}<div class={`rounded-md border px-3 py-2 text-sm shadow-xl backdrop-blur-md ${toast.tone === 'success' ? 'border-[#d7ff73]/30 bg-[#d7ff73]/12 text-[#ecffb8]' : toast.tone === 'error' ? 'border-[#ffafcc]/30 bg-[#ffafcc]/12 text-[#ffcfdf]' : 'border-white/12 bg-[#161817]/95 text-zinc-200'}`}>{toast.message}</div>{/each}</div>
  <input bind:this={fileInput} class="hidden" type="file" accept={audioAccept} multiple on:change={handleFileInputChange} />
  <audio bind:this={audioElement} preload="metadata" on:ended={handleAudioEnded} on:error={() => { scanError = 'This browser could not play the selected audio file.'; player.setPlaying(false); }} on:loadedmetadata={handleAudioLoadedMetadata} on:pause={handleAudioPause} on:play={handleAudioPlay} on:timeupdate={handleAudioTimeUpdate}></audio>
</main>

{#snippet OnlineTrackCard(result: MusicTrack)}
  <article class="result-card rounded-lg border border-white/10 bg-white/[0.06] p-3 transition">
    <div class="flex gap-3"><button type="button" class="album-tilt grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-white/8" style={result.artwork ? `background-image: url('${result.artwork}'); background-size: cover; background-position: center;` : ''} on:click={() => playProviderResult(result)} title="Play">{#if !result.artwork}<Disc3 size={24} class="text-zinc-500" />{/if}</button><div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="truncate text-sm font-semibold">{result.title}</span><span class="shrink-0 rounded-full border border-white/10 bg-black/24 px-2 py-0.5 text-[11px] text-zinc-300">{result.providerBadge}</span></div><p class="mt-1 truncate text-xs text-zinc-400">{result.artist}</p><p class="mt-1 truncate text-xs text-zinc-500">{result.album}</p><div class="mt-3 flex flex-wrap gap-2"><button type="button" class="grid size-8 place-items-center rounded-md bg-white text-[#101314] disabled:opacity-50" disabled={!result.playable && !result.externalUrl} on:click={() => playProviderResult(result)} title={result.previewUrl ? 'Play preview' : result.embedUrl ? 'Play official embed' : 'Open provider'}><Play size={15} /></button><button type="button" class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12" on:click={() => playProviderNext(result)} title="Play next"><ListPlus size={15} /></button><button type="button" class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12" on:click={() => addProviderToQueue(result)} title="Add to queue"><Plus size={15} /></button>{#if $player.playlists.length > 0}<select class="h-8 max-w-[112px] rounded-md border border-white/10 bg-[#161817] px-2 text-xs text-zinc-300 outline-none" aria-label="Add provider track to playlist" on:change={(event) => { addProviderToPlaylist((event.currentTarget as HTMLSelectElement).value, result); (event.currentTarget as HTMLSelectElement).value = ''; }}><option value="">Playlist</option>{#each $player.playlists as playlist}<option value={playlist.id}>{playlist.name}</option>{/each}</select>{/if}{#if result.externalUrl}<button type="button" class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12" on:click={() => openExternalUrl(result.externalUrl)} title="Open provider"><ExternalLink size={15} /></button>{/if}</div></div></div>
  </article>
{/snippet}

<style>
  .immersive-shell {
    position: relative;
    overflow: hidden;
    background: radial-gradient(circle at calc(50% + (var(--tilt-y) * 4)) 8%, rgb(215 255 115 / 0.16), transparent 26rem), radial-gradient(circle at 90% 18%, rgb(139 211 255 / 0.12), transparent 24rem), linear-gradient(135deg, #090b0c 0%, #101314 42%, #211d20 100%);
    perspective: 1200px;
  }
  .ambient-stage { pointer-events: none; position: fixed; inset: 0; z-index: 0; transform: rotateX(var(--tilt-x)) rotateY(var(--tilt-y)); transform-style: preserve-3d; transition: transform 160ms ease-out; }
  .ambient-grid { position: absolute; inset: -20%; opacity: 0.16; background-image: linear-gradient(rgb(255 255 255 / 0.08) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.08) 1px, transparent 1px); background-size: 72px 72px; mask-image: radial-gradient(circle at center, black, transparent 68%); transform: translateZ(-160px) rotateX(58deg); }
  .ambient-orb { position: absolute; width: 34rem; aspect-ratio: 1; border-radius: 999px; filter: blur(48px); opacity: calc(0.22 + (var(--visual-level) * 0.16)); }
  .ambient-orb-a { left: -8rem; top: 10%; background: #d7ff73; }
  .ambient-orb-b { right: -10rem; bottom: 8%; background: #8bd3ff; }
  .visual-orb { position: absolute; right: 8%; top: 16%; width: min(34vw, 26rem); aspect-ratio: 1; border-radius: 999px; border: 1px solid rgb(255 255 255 / 0.14); box-shadow: 0 0 calc(60px + (var(--visual-level) * 90px)) rgb(215 255 115 / 0.14), inset 0 0 60px rgb(255 255 255 / 0.08); opacity: 0.62; animation: orb-breathe 7s ease-in-out infinite; }
  .visual-orb span { position: absolute; inset: calc(12% + (var(--visual-level) * 6%)); border: 1px solid rgb(255 255 255 / 0.14); border-radius: 999px; transform: rotate(calc(var(--visual-level) * 60deg)); }
  .visual-orb span:nth-child(2) { inset: 24%; border-color: rgb(139 211 255 / 0.18); transform: rotateX(64deg); }
  .visual-orb span:nth-child(3) { inset: 35%; border-color: rgb(255 255 255 / 0.2); background: rgb(255 255 255 / 0.05); backdrop-filter: blur(12px); }
  .intro-screen { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 1rem; background: radial-gradient(circle at 50% 12%, rgb(215 255 115 / 0.16), transparent 28rem), rgb(7 8 8 / 0.96); backdrop-filter: blur(24px); }
  .intro-depth { width: min(720px, 100%); padding: clamp(2rem, 8vw, 4.5rem); text-align: center; border: 1px solid rgb(255 255 255 / 0.12); border-radius: 12px; background: linear-gradient(180deg, rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.035)); box-shadow: 0 30px 100px rgb(0 0 0 / 0.45); transform: rotateX(calc(var(--tilt-x) * 0.25)) rotateY(calc(var(--tilt-y) * 0.25)); }
  .intro-disc, .glass-play, .glass-control, .glass-primary { display: inline-grid; place-items: center; background: linear-gradient(180deg, rgb(255 255 255 / 0.92), rgb(215 255 115 / 0.92)); color: #101314; box-shadow: 0 14px 42px rgb(215 255 115 / 0.18), inset 0 1px 0 rgb(255 255 255 / 0.7); transition: transform 180ms ease, box-shadow 180ms ease; }
  .intro-disc { width: 6.5rem; aspect-ratio: 1; margin: 0 auto 1.5rem; border-radius: 999px; }
  .glass-primary:hover, .glass-play:hover, .glass-control:hover, .result-card:hover { transform: translateY(-2px); }
  .glass-primary:active, .glass-play:active, .glass-control:active { transform: translateY(1px) scale(0.98); }
  .glass-control { width: 3rem; height: 3rem; border-radius: 999px; background: rgb(255 255 255 / 0.1); color: #f5f7f7; border: 1px solid rgb(255 255 255 / 0.14); backdrop-filter: blur(18px); }
  .glass-play { border-radius: 999px; }
  .intro-wave, .skeleton-card { overflow: hidden; position: relative; }
  .intro-wave { display: flex; justify-content: center; gap: 0.35rem; }
  .intro-wave span { width: 0.38rem; height: 2.3rem; border-radius: 999px; background: linear-gradient(180deg, #d7ff73, #8bd3ff); animation: wave-rise 1.1s ease-in-out infinite; }
  .intro-wave span:nth-child(2) { animation-delay: 80ms; }
  .intro-wave span:nth-child(3) { animation-delay: 160ms; }
  .intro-wave span:nth-child(4) { animation-delay: 240ms; }
  .intro-wave span:nth-child(5) { animation-delay: 320ms; }
  .intro-wave span:nth-child(6) { animation-delay: 400ms; }
  .intro-wave span:nth-child(7) { animation-delay: 480ms; }
  .skeleton-card::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.09), transparent); animation: skeleton-sweep 1.4s linear infinite; }
  .result-card, .hero-panel, .album-depth-card { box-shadow: 0 18px 60px rgb(0 0 0 / 0.22), inset 0 1px 0 rgb(255 255 255 / 0.08); backdrop-filter: blur(18px); }
  .album-depth-card { padding: 0.8rem; border: 1px solid rgb(255 255 255 / 0.12); border-radius: 16px; background: linear-gradient(140deg, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0.04)); transform-style: preserve-3d; transform: rotateX(calc(var(--tilt-x) * 0.42)) rotateY(calc(var(--tilt-y) * 0.42)) translateZ(24px); transition: transform 180ms ease-out; }
  .album-tilt { transform-style: preserve-3d; transition: transform 180ms ease, box-shadow 180ms ease; }
  .album-tilt:hover { transform: perspective(700px) rotateX(4deg) rotateY(-5deg) translateY(-2px); box-shadow: 0 16px 38px rgb(0 0 0 / 0.28); }
  .glass-ripple { pointer-events: none; position: fixed; z-index: 55; width: 1rem; aspect-ratio: 1; border: 1px solid rgb(255 255 255 / 0.34); border-radius: 999px; translate: -50% -50%; animation: ripple-out 700ms ease-out forwards; }
  .glass-fracture { pointer-events: none; position: fixed; inset: 0; z-index: 54; backdrop-filter: blur(2px); animation: fracture-fade 780ms ease-out forwards; }
  .glass-fracture span { position: absolute; left: 50%; top: 50%; width: 32vw; height: 1px; background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.42), transparent); transform-origin: left center; }
  .glass-fracture span:nth-child(1) { transform: rotate(18deg); }
  .glass-fracture span:nth-child(2) { transform: rotate(74deg); }
  .glass-fracture span:nth-child(3) { transform: rotate(138deg); }
  .glass-fracture span:nth-child(4) { transform: rotate(212deg); }
  .immersive-visual { position: relative; min-height: 320px; }
  .visual-orb-large { left: 50%; top: 50%; right: auto; width: min(66vw, 34rem); translate: -50% -50%; }
  .immersive-art { position: relative; z-index: 2; width: min(48vw, 18rem); }
  @keyframes orb-breathe { 0%, 100% { scale: calc(0.96 + (var(--visual-level) * 0.12)); rotate: 0deg; } 50% { scale: calc(1 + (var(--visual-level) * 0.18)); rotate: 8deg; } }
  @keyframes wave-rise { 0%, 100% { transform: scaleY(0.35); opacity: 0.55; } 50% { transform: scaleY(1); opacity: 1; } }
  @keyframes skeleton-sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
  @keyframes ripple-out { from { opacity: 0.55; transform: scale(1); } to { opacity: 0; transform: scale(18); } }
  @keyframes fracture-fade { from { opacity: 1; } to { opacity: 0; } }
  @media (max-width: 768px) { .visual-orb { width: 16rem; opacity: 0.34; } .ambient-orb { width: 20rem; filter: blur(38px); } .album-depth-card { transform: none; } }
  @media (prefers-reduced-motion: reduce) { .ambient-stage, .visual-orb, .intro-wave span, .skeleton-card::after, .glass-ripple, .glass-fracture, .album-tilt, .album-depth-card { animation: none !important; transform: none !important; transition: none !important; } }
</style>

{#snippet OnlineTrackCard(result: MusicTrack)}
  <article class="result-card rounded-lg border border-white/10 bg-white/[0.06] p-3 transition"><div class="flex gap-3"><button type="button" class="album-tilt grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-white/8" style={result.artwork ? `background-image: url('${result.artwork}'); background-size: cover; background-position: center;` : ''} on:click={() => playProviderResult(result)} title="Play">{#if !result.artwork}<Disc3 size={24} class="text-zinc-500" />{/if}</button><div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="truncate text-sm font-semibold">{result.title}</span><span class="shrink-0 rounded-full border border-white/10 bg-black/24 px-2 py-0.5 text-[11px] text-zinc-300">{result.providerBadge}</span></div><p class="mt-1 truncate text-xs text-zinc-400">{result.artist}</p><p class="mt-1 truncate text-xs text-zinc-500">{result.album}</p><div class="mt-3 flex flex-wrap gap-2"><button type="button" class="grid size-8 place-items-center rounded-md bg-white text-[#101314] disabled:opacity-50" disabled={!result.playable && !result.externalUrl} on:click={() => playProviderResult(result)} title={result.previewUrl ? 'Play preview' : result.embedUrl ? 'Play official embed' : 'Open provider'}><Play size={15} /></button><button type="button" class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12" on:click={() => playProviderNext(result)} title="Play next"><ListPlus size={15} /></button><button type="button" class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12" on:click={() => addProviderToQueue(result)} title="Add to queue"><Plus size={15} /></button>{#if $player.playlists.length > 0}<select class="h-8 max-w-[112px] rounded-md border border-white/10 bg-[#161817] px-2 text-xs text-zinc-300 outline-none" aria-label="Add provider track to playlist" on:change={(event) => { addProviderToPlaylist((event.currentTarget as HTMLSelectElement).value, result); (event.currentTarget as HTMLSelectElement).value = ''; }}><option value="">Playlist</option>{#each $player.playlists as playlist}<option value={playlist.id}>{playlist.name}</option>{/each}</select>{/if}{#if result.externalUrl}<button type="button" class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12" on:click={() => openExternalUrl(result.externalUrl)} title="Open provider"><ExternalLink size={15} /></button>{/if}</div></div></div></article>
{/snippet}

{#snippet OnlineEntityCard(entity: MusicArtist | MusicAlbum, kind: 'artist' | 'album')}
  <article class="result-card rounded-lg border border-white/10 bg-white/[0.06] p-3 transition"><button type="button" class="album-tilt block aspect-square w-full rounded-md bg-white/8" style={entity.artwork ? `background-image: url('${entity.artwork}'); background-size: cover; background-position: center;` : ''} on:click={() => openExternalUrl(entity.externalUrl)} title="Open provider"></button><p class="mt-3 truncate text-sm font-semibold">{kind === 'artist' ? (entity as MusicArtist).name : (entity as MusicAlbum).title}</p>{#if kind === 'album'}<p class="mt-1 truncate text-xs text-zinc-400">{(entity as MusicAlbum).artist}</p>{/if}<div class="mt-3 flex items-center justify-between gap-2"><span class="rounded-full border border-white/10 bg-black/24 px-2 py-0.5 text-[11px] text-zinc-300">{entity.providerBadge}</span>{#if entity.externalUrl}<button type="button" class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12" on:click={() => openExternalUrl(entity.externalUrl)} title="Open provider"><ExternalLink size={15} /></button>{/if}</div></article>
{/snippet}

{#snippet TrackRow(track: Track, compact = false)}
  <div class={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md p-2 text-left transition ${compact ? '' : 'md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_86px_150px_78px] md:px-3'} ${track.id === $player.currentTrackId ? 'bg-[#d7ff73]/15 ring-1 ring-[#d7ff73]/35' : 'hover:bg-white/8'}`}>
    <span class="flex min-w-0 items-center gap-3"><span class="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md" style={coverStyle(track)}><Disc3 size={22} class="text-black/70" /></span><span class="min-w-0"><span class="flex min-w-0 items-center gap-2"><span class="truncate text-sm font-semibold text-white">{track.title}</span>{#if track.favorite}<Star size={14} class="shrink-0 fill-[#ffd166] text-[#ffd166]" />{/if}</span><span class="mt-1 block truncate text-xs text-zinc-400">{track.artist}</span></span></span>
    {#if !compact}<span class="hidden min-w-0 md:block"><span class="block truncate text-sm text-zinc-300">{track.album}</span><span class="mt-1 block truncate text-xs text-zinc-500">{track.genre} - {track.year || 'Unknown'} - {formatFileSize(track.size)}</span></span><span class="hidden text-xs font-semibold text-[#8bd3ff] md:block">{track.fileType}</span><span class="hidden items-center gap-1 md:flex"><button type="button" class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12" on:click={() => playNext(track)}><ListPlus size={15} /></button><button type="button" class="grid size-8 place-items-center rounded-md bg-white/8 text-zinc-300 hover:bg-white/12" on:click={() => addToQueue(track)}><Plus size={15} /></button><button type="button" class={`grid size-8 place-items-center rounded-md ${track.favorite ? 'bg-[#ffafcc]/16 text-[#ffafcc]' : 'bg-white/8 text-zinc-300'}`} on:click={() => toggleFavorite(track)}><Heart size={15} fill={track.favorite ? 'currentColor' : 'none'} /></button>{#if $player.playlists.length > 0}<select class="h-8 max-w-[78px] rounded-md border border-white/10 bg-[#161817] px-1 text-xs text-zinc-300 outline-none" on:change={(event) => { addTrackToPlaylist((event.currentTarget as HTMLSelectElement).value, track); (event.currentTarget as HTMLSelectElement).value = ''; }}><option value="">Playlist</option>{#each $player.playlists as playlist}<option value={playlist.id}>{playlist.name}</option>{/each}</select>{/if}</span>{/if}
    <span class="flex items-center gap-2 justify-self-end">{#if !compact}<span class="hidden text-sm text-zinc-400 md:inline">{formatDuration(track.duration)}</span>{/if}<button type="button" class={`grid size-9 place-items-center rounded-md ${track.id === $player.currentTrackId && $player.isPlaying ? 'bg-white text-[#101314]' : 'bg-white/8 text-zinc-200'}`} on:click={() => toggleTrack(track)} title={track.id === $player.currentTrackId && $player.isPlaying ? 'Pause' : 'Play'}>{#if track.id === $player.currentTrackId && $player.isPlaying}<Pause size={16} />{:else}<Play size={16} />{/if}</button></span>
  </div>
{/snippet}

{#snippet CompactProviderCard(result: MusicTrack)}
  <button type="button" class="result-card album-tilt min-w-0 rounded-lg border border-white/10 bg-white/[0.06] p-3 text-left transition" on:click={() => playProviderResult(result)}><span class="block aspect-square rounded-md bg-white/8" style={result.artwork ? `background-image: url('${result.artwork}'); background-size: cover; background-position: center;` : ''}></span><span class="mt-3 block truncate text-sm font-semibold">{result.title}</span><span class="mt-1 block truncate text-xs text-zinc-400">{result.artist}</span><span class="mt-2 inline-flex rounded-full border border-white/10 bg-black/24 px-2 py-0.5 text-[11px] text-zinc-300">{result.providerBadge}</span></button>
{/snippet}
