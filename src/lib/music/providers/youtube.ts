import { env } from '$env/dynamic/public';
import {
  ProviderUnavailableError,
  type MusicAlbum,
  type MusicArtist,
  type MusicProvider,
  type MusicTrack,
  type ProviderSearchOptions,
  type ProviderStatus
} from '../types';

type YouTubeThumbnail = {
  url: string;
  width?: number;
  height?: number;
};

type YouTubeSearchItem = {
  id?: {
    videoId?: string;
    channelId?: string;
  };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: Record<string, YouTubeThumbnail>;
  };
};

type YouTubeSearchResponse = {
  items?: YouTubeSearchItem[];
};

type YouTubeVideoDetailsResponse = {
  items?: Array<{
    id: string;
    contentDetails?: {
      duration?: string;
    };
  }>;
};

const API_KEY = env.PUBLIC_YOUTUBE_API_KEY || '';
const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

export const youtubeProvider: MusicProvider = {
  id: 'youtube',
  name: 'YouTube',
  getStatus,
  searchTracks,
  searchArtists,
  searchAlbums
};

export function getStatus(): ProviderStatus {
  if (!API_KEY) {
    return {
      id: 'youtube',
      name: 'YouTube',
      state: 'not_configured',
      message: 'Provider not configured',
      connectLabel: 'Add API key'
    };
  }

  return {
    id: 'youtube',
    name: 'YouTube',
    state: 'configured',
    message: 'Official Data API metadata search enabled'
  };
}

async function searchTracks(query: string, options: ProviderSearchOptions = {}) {
  const items = await searchYouTube(query, 'video', options);
  const videoIds = items.map((item) => item.id?.videoId).filter(Boolean) as string[];
  const durations = await getVideoDurations(videoIds, options.signal);

  return items
    .filter((item) => item.id?.videoId)
    .map((item) => normalizeVideo(item, durations.get(item.id?.videoId ?? '') ?? 0));
}

async function searchArtists(query: string, options: ProviderSearchOptions = {}) {
  const items = await searchYouTube(`${query} official artist music`, 'channel', options);

  return items
    .filter((item) => item.id?.channelId)
    .map((item): MusicArtist => {
      const channelId = item.id?.channelId ?? '';

      return {
        id: channelId,
        provider: 'youtube',
        name: cleanTitle(item.snippet?.title ?? 'YouTube Artist'),
        artwork: bestThumbnail(item.snippet?.thumbnails),
        externalUrl: `https://www.youtube.com/channel/${channelId}`,
        providerBadge: 'YouTube'
      };
    });
}

async function searchAlbums(query: string, options: ProviderSearchOptions = {}) {
  const items = await searchYouTube(`${query} album official music`, 'video', options);

  return items
    .filter((item) => item.id?.videoId)
    .map((item): MusicAlbum => {
      const videoId = item.id?.videoId ?? '';

      return {
        id: videoId,
        provider: 'youtube',
        title: cleanTitle(item.snippet?.title ?? 'YouTube Album'),
        artist: item.snippet?.channelTitle ?? 'YouTube',
        artwork: bestThumbnail(item.snippet?.thumbnails),
        trackCount: 0,
        externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        providerBadge: 'YouTube'
      };
    });
}

async function searchYouTube(
  query: string,
  type: 'video' | 'channel',
  options: ProviderSearchOptions = {}
) {
  const status = getStatus();

  if (status.state === 'not_configured') {
    throw new ProviderUnavailableError('YouTube provider is not configured.', status);
  }

  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type,
    maxResults: String(options.limit ?? 10),
    key: API_KEY
  });

  if (type === 'video') {
    params.set('videoCategoryId', '10');
  }

  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, { signal: options.signal });

  if (!response.ok) {
    throw new ProviderUnavailableError('YouTube unavailable.', {
      ...status,
      state: 'unavailable',
      message: 'YouTube unavailable'
    });
  }

  const data = (await response.json()) as YouTubeSearchResponse;
  return data.items ?? [];
}

async function getVideoDurations(videoIds: string[], signal?: AbortSignal) {
  const durations = new Map<string, number>();

  if (videoIds.length === 0) {
    return durations;
  }

  const params = new URLSearchParams({
    part: 'contentDetails',
    id: videoIds.join(','),
    key: API_KEY
  });

  const response = await fetch(`${VIDEOS_URL}?${params.toString()}`, { signal });

  if (!response.ok) {
    return durations;
  }

  const data = (await response.json()) as YouTubeVideoDetailsResponse;

  for (const item of data.items ?? []) {
    durations.set(item.id, parseIsoDuration(item.contentDetails?.duration ?? 'PT0S'));
  }

  return durations;
}

function normalizeVideo(item: YouTubeSearchItem, duration: number): MusicTrack {
  const videoId = item.id?.videoId ?? '';

  return {
    id: videoId,
    provider: 'youtube',
    title: cleanTitle(item.snippet?.title ?? 'YouTube video'),
    artist: item.snippet?.channelTitle ?? 'YouTube',
    album: 'YouTube',
    artwork: bestThumbnail(item.snippet?.thumbnails),
    duration,
    externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`,
    playable: true,
    playbackMode: 'YOUTUBE',
    providerBadge: 'YouTube'
  };
}

function bestThumbnail(thumbnails: Record<string, YouTubeThumbnail> | undefined) {
  return thumbnails?.maxres?.url ?? thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url;
}

function cleanTitle(title: string) {
  const parser = typeof document === 'undefined' ? null : document.createElement('textarea');
  if (!parser) return title;
  parser.innerHTML = title;
  return parser.value;
}

function parseIsoDuration(value: string) {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number.parseInt(match[1] ?? '0', 10);
  const minutes = Number.parseInt(match[2] ?? '0', 10);
  const seconds = Number.parseInt(match[3] ?? '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}
