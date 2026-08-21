import type { Track } from '$lib/types/music';
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

type StoredTrackRecord = {
  key: string;
  track: Track;
  handle?: FileSystemFileHandle;
  file?: File;
};

export type LocalScanResult = {
  tracks: Track[];
  scannedFiles: number;
  source: 'folder' | 'files';
};

const DATABASE_NAME = 'local-music-player';
const DATABASE_VERSION = 1;
const TRACK_STORE = 'tracks';
const LAST_SCAN_KEY = 'local-music-player:last-scan';
const AUDIO_EXTENSIONS = new Set([
  'aac',
  'aif',
  'aiff',
  'alac',
  'flac',
  'm4a',
  'mp3',
  'oga',
  'ogg',
  'opus',
  'wav',
  'webm'
]);

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

export function canScanFolders() {
  if (typeof window === 'undefined') return false;
  return typeof (window as WindowWithFileSystemAccess).showDirectoryPicker === 'function';
}

export async function scanFolder(): Promise<LocalScanResult> {
  const picker = (window as WindowWithFileSystemAccess).showDirectoryPicker;

  if (!picker) {
    throw new Error('Folder scanning is not available in this browser.');
  }

  const directory = await picker({ mode: 'read' });
  const records: StoredTrackRecord[] = [];
  await collectDirectoryRecords(directory, directory.name, records);
  await replaceStoredRecords(records);
  rememberScan(records.length, 'folder');

  return {
    tracks: records.map((record) => record.track),
    scannedFiles: records.length,
    source: 'folder'
  };
}

export async function scanFiles(files: File[]): Promise<LocalScanResult> {
  const records = files
    .filter(isAudioFile)
    .map((file) => createRecordFromFile(file, getBrowserFilePath(file), 'files'));

  await replaceStoredRecords(records);
  rememberScan(records.length, 'files');

  return {
    tracks: records.map((record) => record.track),
    scannedFiles: records.length,
    source: 'files'
  };
}

export async function restoreStoredTracks() {
  const database = await openDatabase();
  const records = await readAllRecords(database);
  return records.map((record) => record.track);
}

export async function createPlayableUrl(track: Track) {
  if (!track.storageKey) {
    return null;
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

export async function clearStoredTracks() {
  revokePlayableUrls();

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LAST_SCAN_KEY);
  }

  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TRACK_STORE, 'readwrite');
    transaction.objectStore(TRACK_STORE).clear();
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

export function getLastScanSummary() {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const value = localStorage.getItem(LAST_SCAN_KEY);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as { count: number; source: 'folder' | 'files'; scannedAt: string };
  } catch {
    return null;
  }
}

async function collectDirectoryRecords(
  directory: FileSystemDirectoryHandle,
  path: string,
  records: StoredTrackRecord[]
) {
  for await (const [, handle] of directory.entries()) {
    const entryPath = `${path}/${handle.name}`;

    if (handle.kind === 'directory') {
      await collectDirectoryRecords(handle as FileSystemDirectoryHandle, entryPath, records);
      continue;
    }

    const fileHandle = handle as FileSystemFileHandle;
    const file = await fileHandle.getFile();

    if (isAudioFile(file)) {
      records.push(createRecordFromFile(file, entryPath, 'folder', fileHandle));
    }
  }
}

function createRecordFromFile(
  file: File,
  path: string,
  source: 'folder' | 'files',
  handle?: FileSystemFileHandle
): StoredTrackRecord {
  const key = `${source}:${stableHash(`${path}:${file.size}:${file.lastModified}`)}`;
  const track = createTrack(file, path, key);

  return source === 'folder'
    ? { key, track, handle }
    : {
        key,
        track,
        file
      };
}

function createTrack(file: File, path: string, storageKey: string): Track {
  const extension = getExtension(file.name).toUpperCase() || 'AUDIO';
  const parsed = parseFileName(file.name);
  const album = getAlbumFromPath(path);
  const palette = COVER_PALETTES[stableHash(path) % COVER_PALETTES.length] ?? COVER_PALETTES[0];

  return {
    id: `local-${stableHash(storageKey).toString(36)}`,
    title: parsed.title,
    artist: parsed.artist,
    album,
    duration: 0,
    genre: 'Local',
    year: new Date(file.lastModified).getFullYear(),
    fileType: extension,
    bitrate: formatFileSize(file.size),
    favorite: false,
    source: 'local',
    storageKey,
    path,
    fileName: file.name,
    size: file.size,
    lastModified: file.lastModified,
    cover: {
      from: palette[0],
      via: palette[1],
      to: palette[2]
    }
  };
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

function getAlbumFromPath(path: string) {
  const parts = path.split('/').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : 'Local Files';
}

function getBrowserFilePath(file: File) {
  const fileWithRelativePath = file as File & { webkitRelativePath?: string };
  return fileWithRelativePath.webkitRelativePath || file.name;
}

function isAudioFile(file: File) {
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.has(getExtension(file.name));
}

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'));
  });

  return databasePromise;
}

async function replaceStoredRecords(records: StoredTrackRecord[]) {
  revokePlayableUrls();

  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TRACK_STORE, 'readwrite');
    const store = transaction.objectStore(TRACK_STORE);
    store.clear();

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

function rememberScan(count: number, source: 'folder' | 'files') {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(
    LAST_SCAN_KEY,
    JSON.stringify({
      count,
      source,
      scannedAt: new Date().toISOString()
    })
  );
}

function stableHash(input: string) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}
