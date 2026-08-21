<script lang="ts">
  import {
    Album,
    AlertCircle,
    BadgeCheck,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock3,
    Disc3,
    FileMusic,
    FolderOpen,
    HardDrive,
    Heart,
    Home,
    Library,
    ListMusic,
    ListPlus,
    LoaderCircle,
    MicVocal,
    Minus,
    Pause,
    Pencil,
    Play,
    Plus,
    Repeat,
    Repeat1,
    Search,
    Shuffle,
    SkipBack,
    SkipForward,
    Sparkles,
    Star,
    Trash2,
    UploadCloud,
    Volume2,
    VolumeX,
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
    saveRecentlyPlayed,
    saveStoredPlaylists,
    scanDroppedItems,
    scanFiles,
    scanFolder,
    updateStoredTrack
  } from '$lib/local/localLibrary';
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

  const navItems: { id: LibraryView; label: string; icon: typeof Library }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'songs', label: 'Songs', icon: ListMusic },
    { id: 'artists', label: 'Artists', icon: MicVocal },
    { id: 'albums', label: 'Albums', icon: Album },
    { id: 'playlists', label: 'Playlists', icon: Library },
    { id: 'favorites', label: 'Favorites', icon: Heart },
    { id: 'recent', label: 'Recently Played', icon: Clock3 }
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
  let hydrated = false;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  let selectedPlaylistId = '';
  let newPlaylistName = '';
  let renamePlaylistId = '';
  let renamePlaylistName = '';
  let browserCapabilities = {
    indexedDb: false,
    folderPicker: false,
    directoryInput: false
  };

  onMount(() => {
    const timer = window.setInterval(() => player.tick(), 1000);
    const unsubscribe = player.subscribe((state) => schedulePersistence(state));

    browserCapabilities = {
      indexedDb: hasIndexedDb(),
      folderPicker: canScanFolders(),
      directoryInput: canUseDirectoryInput()
    };

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

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', handleKeyboard);
      unsubscribe();
      revokePlayableUrls();
      if (persistTimer) window.clearTimeout(persistTimer);
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

  function handleSearch(event: Event) {
    player.setSearch((event.currentTarget as HTMLInputElement).value);
  }

  function handleSeek(event: Event) {
    const position = Number((event.currentTarget as HTMLInputElement).value);

    if ($currentTrack?.source === 'local' && audioElement) {
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
    player.clearLibrary();
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

    stopAudio();
    player.playTrack(track.id);
    player.recordRecentlyPlayed(track.id);
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
      player.setPlaying(true);
      player.recordRecentlyPlayed(track.id);
    } catch (error: unknown) {
      player.setPlaying(false);
      scanError = getErrorMessage(error);
      pushToast(scanError, 'error');
    }
  }

  function pausePlayback() {
    if ($currentTrack?.source === 'local') {
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

    if (target?.closest('input, textarea, select, button')) {
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      void togglePlayback();
    }

    if (event.code === 'ArrowRight' && audioElement && $currentTrack?.source === 'local') {
      audioElement.currentTime = Math.min(audioElement.duration || 0, audioElement.currentTime + 5);
    }

    if (event.code === 'ArrowLeft' && audioElement && $currentTrack?.source === 'local') {
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
  }

  function playTrackIds(trackIds: string[]) {
    const firstTrack = trackIds
      .map((trackId) => $player.tracks.find((track) => track.id === trackId))
      .find(Boolean);

    if (!firstTrack) return;

    player.playQueue(trackIds, firstTrack.id);
    void playTrack(firstTrack);
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
    $player.activeView === 'favorites'
      ? favoriteTracks
      : $player.activeView === 'recent'
        ? recentTracks
        : $filteredTracks;
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
  <title>Local Music Player</title>
  <meta
    name="description"
    content="A local-first music player shell built with SvelteKit and Tauri."
  />
</svelte:head>

<main class="min-h-screen px-3 py-3 text-zinc-50 sm:px-4 lg:px-6">
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
            <p class="truncate text-sm font-semibold">Local Music</p>
            <p class="truncate text-xs text-zinc-400">Browser + Tauri</p>
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
            <p class="text-xl font-semibold">{$libraryStats.tracks}</p>
            <p class="mt-1 text-xs text-zinc-400">Tracks</p>
          </div>
          <div class="rounded-md border border-white/10 bg-black/18 p-3">
            <p class="text-xl font-semibold">{$libraryStats.albums}</p>
            <p class="mt-1 text-xs text-zinc-400">Albums</p>
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
              <span>Local Library</span>
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
              class="flex h-11 min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/22 px-3 text-sm text-zinc-300 sm:w-[320px]"
            >
              <Search size={17} class="shrink-0 text-zinc-500" />
              <input
                class="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-500"
                placeholder="Search songs, artists, albums"
                value={$player.search}
                on:input={handleSearch}
              />
            </label>
          </div>
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
        {#if $player.tracks.length === 0}
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
        {:else if $player.activeView === 'home'}
          <div class="grid gap-3 lg:grid-cols-2">
            <section class="rounded-md bg-black/16 p-4">
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold">Recently Played</h2>
                <button
                  type="button"
                  class="text-xs font-medium text-[#d7ff73]"
                  on:click={() => player.setView('recent')}
                >
                  View
                </button>
              </div>
              <div class="mt-3 space-y-1">
                {#each recentTracks.slice(0, 5) as track}
                  {@render TrackRow(track, true)}
                {:else}
                  <p class="text-sm text-zinc-500">Nothing played yet.</p>
                {/each}
              </div>
            </section>
            <section class="rounded-md bg-black/16 p-4">
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold">Favorites</h2>
                <button
                  type="button"
                  class="text-xs font-medium text-[#d7ff73]"
                  on:click={() => player.setView('favorites')}
                >
                  View
                </button>
              </div>
              <div class="mt-3 space-y-1">
                {#each favoriteTracks.slice(0, 5) as track}
                  {@render TrackRow(track, true)}
                {:else}
                  <p class="text-sm text-zinc-500">No favorites yet.</p>
                {/each}
              </div>
            </section>
            <section class="rounded-md bg-black/16 p-4 lg:col-span-2">
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold">Albums</h2>
                <button
                  type="button"
                  class="text-xs font-medium text-[#d7ff73]"
                  on:click={() => player.setView('albums')}
                >
                  View
                </button>
              </div>
              <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {#each albumGroups.slice(0, 6) as album}
                  <button
                    type="button"
                    class="flex min-w-0 items-center gap-3 rounded-md bg-white/6 p-2 text-left transition hover:bg-white/10"
                    on:click={() => playTrackIds(album.tracks.map((track) => track.id))}
                  >
                    <span class="grid size-12 shrink-0 place-items-center rounded-md" style={coverStyle(album.coverTrack)}>
                      <Disc3 size={20} class="text-black/60" />
                    </span>
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-semibold">{album.name}</span>
                      <span class="mt-1 block truncate text-xs text-zinc-500">{album.artist}</span>
                    </span>
                  </button>
                {/each}
              </div>
            </section>
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
          <p class="mt-1 truncate text-xs text-zinc-400">{$currentTrack?.artist ?? 'Add local music'}</p>
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
