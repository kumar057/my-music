import type { Playlist, Track } from '$lib/types/music';
import { formatFileSize } from '$lib/utils/format';

type FileSystemPermissionMode = 'read' | 'readwrite';

type FileSystemPermissionDescriptor = {
  mode?: FileSystemPermissionMode;
};

type FileSystemHandleKind = 'file' | 'directory';

type FileSystemHandle = {
  kind: FileSystemHandleKind;
  name: string;
  queryPermission?: (descriptor?: FileSystemPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor?: FileSystemPermissionDescriptor) => Promise<PermissionState>;
};

type FileSystemFileHandle = FileSystemHandle & {
  kind: 'file';
  getFile: () => Promise<File>;
};

type FileSystemDirectoryHandle = FileSystemHandle & {
  kind: 'directory';
  entries: () => AsyncIterable<[string, FileSystemHandle]>;
};

type WindowWithFileSystemAccess = Window & {
  showDirectoryPicker?: (options?: { mode?: FileSystemPermissionMode }) => Promise<FileSystemDirectoryHandle>;
};

type WebkitFileEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: WebkitFileEntry[]) => void,
      error?: (error: DOMException) => void
    ) => void;
  };
};

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => WebkitFileEntry | null;
};

type StoredTrackRecord = {
  key: string;
  fingerprint: string;
  track: Track;
  handle?: FileSystemFileHandle;
  file?: File;
};

type StoredSetting<T> = {
  key: string;
  value: T;
};

type ImportSource = 'folder' | 'files' | 'drop';

type ImportCandidate = {
  file: File;
  path: string;
  handle?: FileSystemFileHandle;
};

type TrackMetadata = {
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number;
  duration: number;
  artworkDataUrl?: string;
  limited: boolean;
};

export type ImportProgress = {
  current: number;
  total: number;
  fileName?: string;
};

export type LocalScanResult = {
  tracks: Track[];
  addedTracks: Track[];
  scannedFiles: number;
  addedCount: number;
  duplicateCount: number;
  unsupportedFiles: string[];
  limitedMetadataCount: number;
  source: ImportSource;
};

export type LibrarySnapshot = {
  tracks: Track[];
  playlists: Playlist[];
  recentlyPlayed: string[];
  favoriteIds: string[];
};

export type ImportOptions = {
  existingTracks?: Track[];
  onProgress?: (progress: ImportProgress) => void;
};

const DATABASE_NAME = 'local-music-player';
const DATABASE_VERSION = 2;
const TRACK_STORE = 'tracks';
const PLAYLIST_STORE = 'playlists';
const SETTING_STORE = 'settings';
const LAST_SCAN_KEY = 'last-scan';
const FAVORITES_KEY = 'favorites';
const RECENT_KEY = 'recently-played';

export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'flac',
  'm4a',
  'aac',
  'ogg',
  'opus',
  'aiff',
  'aif',
  'webm'
];

const AUDIO_EXTENSIONS = new Set(SUPPORTED_AUDIO_EXTENSIONS);
const MAX_ARTWORK_BYTES = 2 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string[]> = {
  aac: ['audio/aac'],
  aif: ['audio/aiff', 'audio/x-aiff'],
  aiff: ['audio/aiff', 'audio/x-aiff'],
  flac: ['audio/flac', 'audio/x-flac'],
  m4a: ['audio/mp4', 'audio/x-m4a'],
  mp3: ['audio/mpeg'],
  oga: ['audio/ogg'],
  ogg: ['audio/ogg'],
  opus: ['audio/ogg; codecs="opus"', 'audio/opus'],
  wav: ['audio/wav', 'audio/x-wav'],
  webm: ['audio/webm']
};

const COVER_PALETTES = [
  ['#d7ff73', '#4ab5a4', '#1e4b5f'],
  ['#8bd3ff', '#4578c8', '#28314f'],
  ['#ffd166', '#ef7b45', '#3b2d4f'],
  ['#b8f2e6', '#5e6472', '#292f36'],
  ['#f7a072', '#7d4f50', '#2d232e'],
  ['#fbf8cc', '#f07167', '#175676'],
  ['#cdb4db', '#ffafcc', '#4f518c'],
  ['#ccd5ae', '#e9edc9', '#6c584c']
];

let databasePromise: Promise<IDBDatabase> | undefined;
const activeObjectUrls = new Map<string, string>();

export function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

export function canScanFolders() {
  if (typeof window === 'undefined') return false;
  return typeof (window as WindowWithFileSystemAccess).showDirectoryPicker === 'function';
}

export function canUseDirectoryInput() {
  if (typeof document === 'undefined') return false;
  const input = document.createElement('input');
  return 'webkitdirectory' in input;
}

export function getAudioSupport(extension: string) {
  if (typeof document === 'undefined') return true;

  const audio = document.createElement('audio');
  const mimeTypes = MIME_BY_EXTENSION[extension.toLowerCase()] ?? [];

  if (mimeTypes.length === 0) {
    return false;
  }

  return mimeTypes.some((mimeType) => audio.canPlayType(mimeType) !== '');
}

export async function scanFolder(options: ImportOptions = {}): Promise<LocalScanResult> {
  const picker = (window as WindowWithFileSystemAccess).showDirectoryPicker;

  if (!picker) {
    throw new Error('Your browser does not support folder selection. Select individual files instead.');
  }

  const directory = await picker({ mode: 'read' });
  const candidates: ImportCandidate[] = [];
  await collectDirectoryCandidates(directory, directory.name, candidates);

  return importCandidates(candidates, 'folder', options);
}

export async function scanFiles(files: File[], options: ImportOptions = {}): Promise<LocalScanResult> {
  const candidates = files.map((file) => ({
    file,
    path: getBrowserFilePath(file)
  }));

  return importCandidates(candidates, 'files', options);
}

export async function scanDroppedItems(
  dataTransfer: DataTransfer,
  options: ImportOptions = {}
): Promise<LocalScanResult> {
  const candidates = await collectDroppedCandidates(dataTransfer);
  return importCandidates(candidates, 'drop', options);
}

export async function restoreLibrarySnapshot(): Promise<LibrarySnapshot> {
  const database = await openDatabase();
  const records = await readAllRecords(database);
  const playlists = await readAllPlaylists(database);
  const favoriteIds = await readSetting<string[]>(database, FAVORITES_KEY, []);
  const recentlyPlayed = await readSetting<string[]>(database, RECENT_KEY, []);
  const favoriteSet = new Set(favoriteIds);
  const trackIds = new Set(records.map((record) => record.track.id));

  return {
    tracks: records.map((record) => ({
      ...record.track,
      favorite: favoriteSet.has(record.track.id)
    })),
    playlists: playlists.map((playlist) => ({
      ...playlist,
      trackIds: playlist.trackIds.filter((trackId) => trackIds.has(trackId)),
      count: playlist.trackIds.filter((trackId) => trackIds.has(trackId)).length
    })),
    favoriteIds: favoriteIds.filter((trackId) => trackIds.has(trackId)),
    recentlyPlayed: recentlyPlayed.filter((trackId) => trackIds.has(trackId))
  };
}

export async function restoreStoredTracks() {
  const snapshot = await restoreLibrarySnapshot();
  return snapshot.tracks;
}

export async function createPlayableUrl(track: Track) {
  if (!track.storageKey) {
    return null;
  }

  if (track.playbackSupported === false) {
    throw new Error('Unsupported audio format in this browser.');
  }

  const existingUrl = activeObjectUrls.get(track.storageKey);
  if (existingUrl) {
    return existingUrl;
  }

  const database = await openDatabase();
  const record = await readRecord(database, track.storageKey);

  if (!record) {
    throw new Error('This track is no longer available in browser storage.');
  }

  const file = record.handle ? await getFileFromHandle(record.handle) : record.file;

  if (!file) {
    throw new Error('This browser needs the song file to be imported again.');
  }

  const url = URL.createObjectURL(file);
  activeObjectUrls.set(track.storageKey, url);
  return url;
}

export async function updateStoredTrack(track: Track) {
  if (!track.storageKey) return;

  const database = await openDatabase();
  const record = await readRecord(database, track.storageKey);

  if (!record) return;

  await putTrackRecords(database, [{ ...record, track }]);
}

export async function saveStoredPlaylists(playlists: Playlist[]) {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PLAYLIST_STORE, 'readwrite');
    const store = transaction.objectStore(PLAYLIST_STORE);
    store.clear();

    for (const playlist of playlists) {
      store.put({
        ...playlist,
        count: playlist.trackIds.length,
        updatedAt: playlist.updatedAt ?? Date.now()
      });
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save playlists.'));
  });
}

export async function saveFavoriteIds(favoriteIds: string[]) {
  const database = await openDatabase();
  await putSetting(database, FAVORITES_KEY, favoriteIds);
}

export async function saveRecentlyPlayed(recentlyPlayed: string[]) {
  const database = await openDatabase();
  await putSetting(database, RECENT_KEY, recentlyPlayed);
}

export async function clearStoredTracks() {
  revokePlayableUrls();

  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([TRACK_STORE, PLAYLIST_STORE, SETTING_STORE], 'readwrite');
    transaction.objectStore(TRACK_STORE).clear();
    transaction.objectStore(PLAYLIST_STORE).clear();
    transaction.objectStore(SETTING_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear library.'));
  });
}

export function revokePlayableUrls() {
  for (const url of activeObjectUrls.values()) {
    URL.revokeObjectURL(url);
  }

  activeObjectUrls.clear();
}

export async function getLastScanSummary() {
  const database = await openDatabase();
  return readSetting<{ count: number; source: ImportSource; scannedAt: string } | null>(
    database,
    LAST_SCAN_KEY,
    null
  );
}

async function importCandidates(
  candidates: ImportCandidate[],
  source: ImportSource,
  options: ImportOptions
): Promise<LocalScanResult> {
  if (!hasIndexedDb()) {
    throw new Error('IndexedDB is not available in this browser, so the local library cannot be saved.');
  }

  const database = await openDatabase();
  const existingRecords = await readAllRecords(database);
  const existingFingerprints = new Set([
    ...existingRecords.map((record) => record.fingerprint),
    ...(options.existingTracks ?? []).map((track) => track.fingerprint).filter(Boolean) as string[]
  ]);
  const acceptedCandidates = candidates.filter((candidate) => isAudioCandidate(candidate.file));
  const unsupportedFiles = candidates
    .filter((candidate) => !isAudioCandidate(candidate.file))
    .map((candidate) => candidate.file.name);
  const records: StoredTrackRecord[] = [];
  let duplicateCount = 0;
  let limitedMetadataCount = 0;

  for (let index = 0; index < acceptedCandidates.length; index += 1) {
    const candidate = acceptedCandidates[index];
    const extension = getExtension(candidate.file.name);
    const fingerprint = createFingerprint(candidate.file);

    options.onProgress?.({
      current: index + 1,
      total: acceptedCandidates.length,
      fileName: candidate.file.name
    });

    if (existingFingerprints.has(fingerprint)) {
      duplicateCount += 1;
      continue;
    }

    if (!getAudioSupport(extension)) {
      unsupportedFiles.push(candidate.file.name);
      continue;
    }

    const metadata = await readTrackMetadata(candidate.file, candidate.path);

    if (metadata.limited) {
      limitedMetadataCount += 1;
    }

    const record = createRecordFromFile(candidate, source, metadata, fingerprint);
    records.push(record);
    existingFingerprints.add(fingerprint);
  }

  await putTrackRecords(database, records);

  const snapshot = await restoreLibrarySnapshot();

  await putSetting(database, LAST_SCAN_KEY, {
    count: snapshot.tracks.length,
    source,
    scannedAt: new Date().toISOString()
  });

  return {
    tracks: snapshot.tracks,
    addedTracks: records.map((record) => record.track),
    scannedFiles: acceptedCandidates.length,
    addedCount: records.length,
    duplicateCount,
    unsupportedFiles,
    limitedMetadataCount,
    source
  };
}

async function collectDirectoryCandidates(
  directory: FileSystemDirectoryHandle,
  path: string,
  candidates: ImportCandidate[]
) {
  for await (const [, handle] of directory.entries()) {
    const entryPath = `${path}/${handle.name}`;

    if (handle.kind === 'directory') {
      await collectDirectoryCandidates(handle as FileSystemDirectoryHandle, entryPath, candidates);
      continue;
    }

    const fileHandle = handle as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    candidates.push({ file, path: entryPath, handle: fileHandle });
  }
}

async function collectDroppedCandidates(dataTransfer: DataTransfer) {
  const candidates: ImportCandidate[] = [];
  const items = Array.from(dataTransfer.items ?? []);

  if (items.length > 0) {
    for (const item of items) {
      const entry = (item as DataTransferItemWithEntry).webkitGetAsEntry?.() as
        | WebkitFileEntry
        | null
        | undefined;

      if (entry) {
        await collectWebkitEntryCandidates(entry, entry.name, candidates);
        continue;
      }

      const file = item.getAsFile();
      if (file) {
        candidates.push({ file, path: file.name });
      }
    }

    return candidates;
  }

  return Array.from(dataTransfer.files ?? []).map((file) => ({
    file,
    path: getBrowserFilePath(file)
  }));
}

async function collectWebkitEntryCandidates(
  entry: WebkitFileEntry,
  path: string,
  candidates: ImportCandidate[]
) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject);
    });
    candidates.push({ file, path });
    return;
  }

  if (!entry.isDirectory || !entry.createReader) {
    return;
  }

  const reader = entry.createReader();
  let entries: WebkitFileEntry[] = [];

  do {
    entries = await new Promise<WebkitFileEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    for (const child of entries) {
      await collectWebkitEntryCandidates(child, `${path}/${child.name}`, candidates);
    }
  } while (entries.length > 0);
}

function createRecordFromFile(
  candidate: ImportCandidate,
  source: ImportSource,
  metadata: TrackMetadata,
  fingerprint: string
): StoredTrackRecord {
  const key = `${source}:${stableHash(fingerprint).toString(36)}`;
  const track = createTrack(candidate.file, candidate.path, key, metadata, fingerprint);

  return candidate.handle
    ? { key, fingerprint, track, handle: candidate.handle }
    : {
        key,
        fingerprint,
        track,
        file: candidate.file
      };
}

function createTrack(
  file: File,
  path: string,
  storageKey: string,
  metadata: TrackMetadata,
  fingerprint: string
): Track {
  const extension = getExtension(file.name).toUpperCase() || 'AUDIO';
  const palette = COVER_PALETTES[stableHash(path) % COVER_PALETTES.length] ?? COVER_PALETTES[0];

  return {
    id: `local-${stableHash(fingerprint).toString(36)}`,
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    duration: metadata.duration,
    genre: metadata.genre,
    year: metadata.year,
    fileType: extension,
    bitrate: formatFileSize(file.size),
    favorite: false,
    source: 'local',
    storageKey,
    fingerprint,
    path,
    fileName: file.name,
    size: file.size,
    lastModified: file.lastModified,
    playbackSupported: true,
    importWarning: metadata.limited ? 'Song added with limited metadata' : undefined,
    addedAt: Date.now(),
    cover: {
      from: palette[0],
      via: palette[1],
      to: palette[2],
      imageDataUrl: metadata.artworkDataUrl
    }
  };
}

async function readTrackMetadata(file: File, path: string): Promise<TrackMetadata> {
  const parsed = parseFileName(file.name);
  const defaults: TrackMetadata = {
    title: parsed.title,
    artist: parsed.artist,
    album: 'Unknown Album',
    genre: 'Unknown',
    year: new Date(file.lastModified).getFullYear(),
    duration: await readAudioDuration(file),
    limited: true
  };

  if (getExtension(file.name) !== 'mp3') {
    return defaults;
  }

  const id3 = await readId3Metadata(file);

  if (!id3) {
    return defaults;
  }

  return {
    ...defaults,
    title: id3.title || defaults.title,
    artist: id3.artist || defaults.artist,
    album: id3.album || defaults.album,
    genre: id3.genre || defaults.genre,
    year: id3.year || defaults.year,
    artworkDataUrl: id3.artworkDataUrl,
    limited: false
  };
}

async function readAudioDuration(file: File) {
  if (typeof Audio === 'undefined') {
    return 0;
  }

  return new Promise<number>((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      resolve(Number.isFinite(duration) ? Math.round(duration) : 0);
    };

    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(0);
    window.setTimeout(() => finish(0), 5000);
    audio.src = url;
  });
}

async function readId3Metadata(file: File) {
  const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());

  if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) {
    return null;
  }

  const majorVersion = header[3];
  const tagSize = syncSafeToInt(header.slice(6, 10));
  const tagBytes = new Uint8Array(await file.slice(0, Math.min(tagSize + 10, 2_500_000)).arrayBuffer());
  const result: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    year?: number;
    artworkDataUrl?: string;
  } = {};

  let offset = 10;

  while (offset + 10 <= tagBytes.length) {
    const frameId = ascii(tagBytes.slice(offset, offset + 4));
    const frameSize =
      majorVersion === 4
        ? syncSafeToInt(tagBytes.slice(offset + 4, offset + 8))
        : uint32ToInt(tagBytes.slice(offset + 4, offset + 8));

    if (!frameId.trim() || frameSize <= 0) {
      break;
    }

    const frame = tagBytes.slice(offset + 10, offset + 10 + frameSize);

    if (frame.length < frameSize) {
      break;
    }

    if (['TIT2', 'TPE1', 'TALB', 'TCON', 'TDRC', 'TYER'].includes(frameId)) {
      const text = decodeTextFrame(frame);

      if (frameId === 'TIT2') result.title = text;
      if (frameId === 'TPE1') result.artist = text;
      if (frameId === 'TALB') result.album = text;
      if (frameId === 'TCON') result.genre = text.replace(/^\((.*)\)$/, '$1');
      if (frameId === 'TDRC' || frameId === 'TYER') {
        const year = Number.parseInt(text.slice(0, 4), 10);
        if (Number.isFinite(year)) result.year = year;
      }
    }

    if (frameId === 'APIC') {
      result.artworkDataUrl = readApicFrame(frame);
    }

    offset += 10 + frameSize;
  }

  return result;
}

function readApicFrame(frame: Uint8Array) {
  if (frame.length < 5) return undefined;

  let offset = 1;
  const mimeEnd = frame.indexOf(0, offset);
  if (mimeEnd === -1) return undefined;

  const mimeType = ascii(frame.slice(offset, mimeEnd)) || 'image/jpeg';
  offset = mimeEnd + 2;

  const descriptionEnd = frame.indexOf(0, offset);
  if (descriptionEnd === -1) return undefined;

  const imageBytes = frame.slice(descriptionEnd + 1);

  if (imageBytes.length === 0 || imageBytes.length > MAX_ARTWORK_BYTES) {
    return undefined;
  }

  return `data:${mimeType};base64,${base64FromBytes(imageBytes)}`;
}

function decodeTextFrame(frame: Uint8Array) {
  if (frame.length === 0) return '';

  const encoding = frame[0];
  const bytes = frame.slice(1);
  let decoder: TextDecoder;

  if (encoding === 3) {
    decoder = new TextDecoder('utf-8');
  } else if (encoding === 1) {
    decoder = new TextDecoder('utf-16');
  } else if (encoding === 2) {
    decoder = new TextDecoder('utf-16be');
  } else {
    decoder = new TextDecoder('latin1');
  }

  return decoder.decode(bytes).replace(/\0/g, '').trim();
}

function parseFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim();
  const [artist, ...titleParts] = baseName.split(/\s+-\s+/);
  const title = titleParts.join(' - ').trim();

  if (artist && title) {
    return {
      artist: artist.trim(),
      title
    };
  }

  return {
    artist: 'Unknown Artist',
    title: baseName || fileName
  };
}

function getBrowserFilePath(file: File) {
  const fileWithRelativePath = file as File & { webkitRelativePath?: string };
  return fileWithRelativePath.webkitRelativePath || file.name;
}

function isAudioCandidate(file: File) {
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.has(getExtension(file.name));
}

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function createFingerprint(file: File) {
  return `${file.name.toLowerCase()}:${file.size}:${file.lastModified}`;
}

async function getFileFromHandle(handle: FileSystemFileHandle) {
  const permission = await verifyReadPermission(handle);

  if (!permission) {
    throw new Error('Permission is needed to play this local song.');
  }

  return handle.getFile();
}

async function verifyReadPermission(handle: FileSystemFileHandle) {
  if (!handle.queryPermission || !handle.requestPermission) {
    return true;
  }

  const descriptor = { mode: 'read' as const };

  if ((await handle.queryPermission(descriptor)) === 'granted') {
    return true;
  }

  return (await handle.requestPermission(descriptor)) === 'granted';
}

function openDatabase() {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(TRACK_STORE)) {
        database.createObjectStore(TRACK_STORE, { keyPath: 'key' });
      }

      if (!database.objectStoreNames.contains(PLAYLIST_STORE)) {
        database.createObjectStore(PLAYLIST_STORE, { keyPath: 'id' });
      }

      if (!database.objectStoreNames.contains(SETTING_STORE)) {
        database.createObjectStore(SETTING_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'));
  });

  return databasePromise;
}

async function putTrackRecords(database: IDBDatabase, records: StoredTrackRecord[]) {
  if (records.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TRACK_STORE, 'readwrite');
    const store = transaction.objectStore(TRACK_STORE);

    for (const record of records) {
      store.put(record);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save library.'));
  });
}

function readAllRecords(database: IDBDatabase) {
  return new Promise<StoredTrackRecord[]>((resolve, reject) => {
    const request = database.transaction(TRACK_STORE, 'readonly').objectStore(TRACK_STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredTrackRecord[]);
    request.onerror = () => reject(request.error ?? new Error('Could not restore library.'));
  });
}

function readRecord(database: IDBDatabase, key: string) {
  return new Promise<StoredTrackRecord | undefined>((resolve, reject) => {
    const request = database.transaction(TRACK_STORE, 'readonly').objectStore(TRACK_STORE).get(key);
    request.onsuccess = () => resolve(request.result as StoredTrackRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error('Could not read song file.'));
  });
}

function readAllPlaylists(database: IDBDatabase) {
  return new Promise<Playlist[]>((resolve, reject) => {
    const request = database.transaction(PLAYLIST_STORE, 'readonly').objectStore(PLAYLIST_STORE).getAll();
    request.onsuccess = () => resolve(request.result as Playlist[]);
    request.onerror = () => reject(request.error ?? new Error('Could not restore playlists.'));
  });
}

async function putSetting<T>(database: IDBDatabase, key: string, value: T) {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SETTING_STORE, 'readwrite');
    transaction.objectStore(SETTING_STORE).put({ key, value } satisfies StoredSetting<T>);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save settings.'));
  });
}

function readSetting<T>(database: IDBDatabase, key: string, fallback: T) {
  return new Promise<T>((resolve, reject) => {
    const request = database.transaction(SETTING_STORE, 'readonly').objectStore(SETTING_STORE).get(key);
    request.onsuccess = () => {
      const setting = request.result as StoredSetting<T> | undefined;
      resolve(setting?.value ?? fallback);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not restore settings.'));
  });
}

function syncSafeToInt(bytes: Uint8Array) {
  return (bytes[0] << 21) | (bytes[1] << 14) | (bytes[2] << 7) | bytes[3];
}

function uint32ToInt(bytes: Uint8Array) {
  return ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
}

function ascii(bytes: Uint8Array) {
  return new TextDecoder('latin1').decode(bytes);
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function stableHash(input: string) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}
