<script lang="ts">
  import {
    Album,
    BadgeCheck,
    Disc3,
    FileMusic,
    FolderOpen,
    HardDrive,
    Heart,
    Library,
    ListMusic,
    LoaderCircle,
    MicVocal,
    Pause,
    Play,
    Repeat,
    Repeat1,
    Search,
    Shuffle,
    SkipBack,
    SkipForward,
    SlidersHorizontal,
    Sparkles,
    Star,
    Trash2,
    Volume2
  } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import {
    canScanFolders,
    clearStoredTracks,
    createPlayableUrl,
    getLastScanSummary,
    restoreStoredTracks,
    revokePlayableUrls,
    scanFiles,
    scanFolder
  } from '$lib/local/localLibrary';
  import {
    currentTrack,
    filteredTracks,
    genres,
    libraryStats,
    player
  } from '$lib/stores/player';
  import type { LibraryView, Track } from '$lib/types/music';
  import { formatDuration } from '$lib/utils/format';

  const navItems: { id: LibraryView; label: string; icon: typeof Library }[] = [
    { id: 'albums', label: 'Albums', icon: Album },
    { id: 'songs', label: 'Songs', icon: ListMusic },
    { id: 'artists', label: 'Artists', icon: MicVocal },
    { id: 'playlists', label: 'Playlists', icon: Library }
  ];

  const audioAccept =
    'audio/*,.aac,.aif,.aiff,.alac,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.webm';

  let audioElement: HTMLAudioElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  let audioTrackId = '';
  let isScanning = false;
  let scanStatus = '';
  let scanError = '';

  onMount(() => {
    const timer = window.setInterval(() => player.tick(), 1000);
    let cancelled = false;

    const summary = getLastScanSummary();
    if (summary) {
      scanStatus = `${summary.count} local songs saved`;
    }

    restoreStoredTracks()
      .then((tracks) => {
        if (!cancelled && tracks.length > 0) {
          player.loadTracks(tracks);
          scanStatus = `${tracks.length} local songs loaded`;
        }
      })
      .catch((error: unknown) => {
        scanError = getErrorMessage(error);
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      revokePlayableUrls();
    };
  });

  function coverStyle(track: Track | undefined) {
    const cover = track?.cover ?? { from: '#d7ff73', via: '#4ab5a4', to: '#1e4b5f' };
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

  async function scanLocalFolder() {
    if (!canScanFolders()) {
      openFilePicker(true);
      return;
    }

    await runScan(() => scanFolder());
  }

  function openFilePicker(directory = false) {
    if (!fileInput) {
      return;
    }

    scanError = '';
    fileInput.value = '';

    if (directory) {
      fileInput.setAttribute('webkitdirectory', '');
    } else {
      fileInput.removeAttribute('webkitdirectory');
    }

    fileInput.click();
  }

  async function handleFileInputChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    if (files.length === 0) {
      return;
    }

    await runScan(() => scanFiles(files));
    input.value = '';
  }

  async function runScan(scanner: () => Promise<{ tracks: Track[]; scannedFiles: number }>) {
    isScanning = true;
    scanError = '';
    scanStatus = 'Scanning local music';
    stopAudio();

    try {
      const result = await scanner();
      player.loadTracks(result.tracks);
      scanStatus =
        result.scannedFiles === 1
          ? '1 local song loaded'
          : `${result.scannedFiles} local songs loaded`;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        scanStatus = 'Scan canceled';
      } else {
        scanError = getErrorMessage(error);
      }
    } finally {
      isScanning = false;
    }
  }

  async function clearLocalLibrary() {
    stopAudio();
    await clearStoredTracks();
    player.resetToDemo();
    scanStatus = 'Demo library loaded';
    scanError = '';
  }

  async function toggleTrack(track: Track) {
    if (track.id === $player.currentTrackId && $player.isPlaying) {
      pausePlayback();
      return;
    }

    await playTrack(track);
  }

  async function playTrack(track: Track | undefined) {
    if (!track) {
      return;
    }

    if (track.source === 'local') {
      await playLocalTrack(track);
      return;
    }

    stopAudio();
    player.playTrack(track.id);
  }

  async function togglePlayback() {
    if (!$currentTrack) {
      return;
    }

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
    if (!audioElement) {
      return;
    }

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
      await audioElement.play();
      player.setPlaying(true);
    } catch (error: unknown) {
      player.setPlaying(false);
      scanError = getErrorMessage(error);
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
    const currentIndex = $player.queue.indexOf($player.currentTrackId);
    const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = fallbackIndex + direction;

    if (nextIndex < 0) {
      return $player.tracks[$player.queue.length - 1];
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

  function handleAudioLoadedMetadata() {
    if (!audioElement || !audioTrackId || !Number.isFinite(audioElement.duration)) {
      return;
    }

    player.setTrackDuration(audioTrackId, audioElement.duration);
  }

  function handleAudioTimeUpdate() {
    if (!audioElement || audioTrackId !== $player.currentTrackId) {
      return;
    }

    player.setPosition(audioElement.currentTime);
  }

  function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Something went wrong while loading music.';
  }

  $: progressTrack = $currentTrack?.duration && $currentTrack.duration > 0 ? $currentTrack.duration : 1;
  $: progressPercent = Math.max(0, Math.min(100, ($player.position / progressTrack) * 100));
  $: queueTracks = $player.queue
    .map((trackId) => $player.tracks.find((track) => track.id === trackId))
    .filter(Boolean) as Track[];
  $: localTracksLoaded = $player.tracks.some((track) => track.source === 'local');
  $: if (audioElement) {
    audioElement.volume = $player.volume / 100;
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
            <p class="truncate text-xs text-zinc-400">Tauri Library</p>
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

        <div class="mt-auto rounded-lg border border-white/10 bg-[#f7a072]/10 p-4">
          <div class="mb-3 flex items-center justify-between">
            <Sparkles size={18} class="text-[#f7a072]" />
            <span class="rounded-full bg-white/10 px-2 py-1 text-[11px] font-medium text-zinc-200">
              2026
            </span>
          </div>
          <p class="text-sm font-semibold leading-5 text-white">Local-first, lossless-ready.</p>
          <p class="mt-2 text-xs leading-5 text-zinc-400">
            Indexed library, playback engine, metadata, and plugins stay cleanly separated.
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
              {$player.activeView[0].toUpperCase() + $player.activeView.slice(1)}
            </h1>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              class="flex h-11 items-center justify-center gap-2 rounded-md bg-[#d7ff73] px-4 text-sm font-semibold text-[#101314] transition hover:bg-[#e4ff95] disabled:opacity-70"
              title="Scan folder"
              disabled={isScanning}
              on:click={scanLocalFolder}
            >
              {#if isScanning}
                <LoaderCircle size={18} class="animate-spin" />
              {:else}
                <FolderOpen size={18} />
              {/if}
              <span class="whitespace-nowrap">Scan Folder</span>
            </button>

            <button
              type="button"
              class="flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/8 px-3 text-sm font-medium text-zinc-200 transition hover:bg-white/12"
              title="Import files"
              on:click={() => openFilePicker(false)}
            >
              <FileMusic size={18} />
              <span class="whitespace-nowrap sm:hidden xl:inline">Files</span>
            </button>

            <label
              class="flex h-11 min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/22 px-3 text-sm text-zinc-300 sm:w-[320px]"
            >
              <Search size={17} class="shrink-0 text-zinc-500" />
              <input
                class="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-500"
                placeholder="Search music"
                value={$player.search}
                on:input={handleSearch}
              />
            </label>

            <button
              type="button"
              class="grid h-11 w-full place-items-center rounded-md border border-white/10 bg-white/8 text-zinc-200 transition hover:bg-white/12 sm:w-11"
              title="Filters"
            >
              <SlidersHorizontal size={18} />
            </button>
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

      <div class="grid grid-cols-2 gap-2 border-b border-white/10 p-3 sm:grid-cols-4 sm:p-4">
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
      </div>

      <div class="thin-scrollbar max-h-[calc(100vh-330px)] min-h-[360px] overflow-y-auto p-2 sm:p-3 lg:max-h-[calc(100vh-250px)]">
        <div class="hidden grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_92px_78px] px-3 py-2 text-xs font-medium uppercase text-zinc-500 md:grid">
          <span>Title</span>
          <span>Album</span>
          <span>Quality</span>
          <span class="text-right">Time</span>
        </div>

        <div class="space-y-1">
          {#if $filteredTracks.length === 0}
            <div class="grid min-h-[280px] place-items-center rounded-md border border-dashed border-white/12 bg-black/12 p-6 text-center">
              <div>
                <div class="mx-auto grid size-12 place-items-center rounded-md bg-white/8 text-zinc-300">
                  <FileMusic size={22} />
                </div>
                <p class="mt-4 text-sm font-semibold text-white">No songs loaded</p>
                <p class="mt-1 text-sm text-zinc-400">Choose a folder or import audio files.</p>
                <div class="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                  <button
                    type="button"
                    class="flex h-10 items-center justify-center gap-2 rounded-md bg-[#d7ff73] px-4 text-sm font-semibold text-[#101314]"
                    on:click={scanLocalFolder}
                  >
                    <FolderOpen size={17} />
                    <span>Scan Folder</span>
                  </button>
                  <button
                    type="button"
                    class="flex h-10 items-center justify-center gap-2 rounded-md bg-white/8 px-4 text-sm font-medium text-zinc-200"
                    on:click={() => openFilePicker(false)}
                  >
                    <FileMusic size={17} />
                    <span>Import Files</span>
                  </button>
                </div>
              </div>
            </div>
          {:else}
            {#each $filteredTracks as track}
            <div
              class={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md p-2 text-left transition md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_92px_78px] md:px-3 ${
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

              <span class="hidden min-w-0 md:block">
                <span class="block truncate text-sm text-zinc-300">{track.album}</span>
                <span class="mt-1 block truncate text-xs text-zinc-500">{track.genre} - {track.year}</span>
              </span>

              <span class="hidden text-xs font-semibold text-[#8bd3ff] md:block">
                {track.fileType}
              </span>

              <span class="flex items-center gap-2 justify-self-end">
                <span class="hidden text-sm text-zinc-400 md:inline">{formatDuration(track.duration)}</span>
                <button
                  type="button"
                  class={`grid size-9 place-items-center rounded-md ${
                    track.id === $player.currentTrackId && $player.isPlaying
                      ? 'bg-white text-[#101314]'
                      : 'bg-white/8 text-zinc-200'
                  }`}
                  on:click|stopPropagation={() => toggleTrack(track)}
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
            {/each}
          {/if}
        </div>
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
              on:click={() => $currentTrack && player.toggleFavorite($currentTrack.id)}
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
            <button
              type="button"
              class={`flex h-14 w-full items-center gap-3 rounded-md px-2 text-left transition ${
                track.id === $player.currentTrackId ? 'bg-white/12' : 'hover:bg-white/8'
              }`}
              on:click={() => playTrack(track)}
            >
              <span class="w-5 shrink-0 text-center text-xs text-zinc-500">
                {(index + 1).toString().padStart(2, '0')}
              </span>
              <span
                class="grid size-9 shrink-0 place-items-center rounded-md"
                style={coverStyle(track)}
              >
                <Disc3 size={17} class="text-black/60" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-zinc-100">{track.title}</span>
                <span class="mt-0.5 block truncate text-xs text-zinc-500">{track.artist}</span>
              </span>
              <span class="text-xs text-zinc-500">{formatDuration(track.duration)}</span>
            </button>
          {/each}
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          {#each $player.playlists as playlist}
            <button
              type="button"
              class="rounded-md border border-white/10 bg-black/18 p-3 text-left transition hover:bg-white/10"
            >
              <p class="truncate text-sm font-semibold">{playlist.name}</p>
              <p class="mt-1 text-xs text-zinc-500">{playlist.count} songs</p>
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
          <p class="mt-1 truncate text-xs text-zinc-400">{$currentTrack?.artist ?? 'Scan local music'}</p>
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
            class="grid size-11 place-items-center rounded-full bg-white text-[#101314] shadow-lg shadow-white/10 transition hover:scale-[1.03]"
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
        <Volume2 size={18} class="shrink-0 text-zinc-400" />
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
