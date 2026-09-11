import { dedupeTracks } from './normalizer';
import { appleMusicProvider } from './providers/appleMusic';
import { indianMusicProvider } from './providers/indianMusic';
import { spotifyProvider } from './providers/spotify';
import { youtubeProvider } from './providers/youtube';
import {
  ProviderUnavailableError,
  type MusicAlbum,
  type MusicArtist,
  type MusicProvider,
  type MusicTrack,
  type ProviderSearchResult,
  type ProviderStatus,
  type UnifiedSearchResult
} from './types';

const providers: MusicProvider[] = [spotifyProvider, appleMusicProvider, youtubeProvider, indianMusicProvider];
const cache = new Map<string, UnifiedSearchResult>();
const CACHE_TTL_MS = 2 * 60 * 1000;

export function getMusicProviders() {
  return providers;
}

export function getProviderStatuses(): ProviderStatus[] {
  return providers.map((provider) => provider.getStatus());
}

export function clearSearchCache() {
  cache.clear();
}

export async function searchMusic(
  query: string,
  options: { signal?: AbortSignal; limit?: number } = {}
): Promise<UnifiedSearchResult> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return {
      query: '',
      tracks: [],
      artists: [],
      albums: [],
      providerResults: providers.map(createEmptyProviderResult),
      generatedAt: Date.now()
    };
  }

  const cacheKey = `${normalizedQuery.toLowerCase()}::${options.limit ?? 10}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
    return cached;
  }

  const settled = await Promise.allSettled(
    providers.map((provider) => searchProvider(provider, normalizedQuery, options))
  );

  const providerResults = settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    return createFailedProviderResult(providers[index], result.reason);
  });

  const unified: UnifiedSearchResult = {
    query: normalizedQuery,
    tracks: dedupeTracks(providerResults.flatMap((result) => result.tracks)),
    artists: dedupeByProviderId(providerResults.flatMap((result) => result.artists)),
    albums: dedupeByProviderId(providerResults.flatMap((result) => result.albums)),
    providerResults,
    generatedAt: Date.now()
  };

  cache.set(cacheKey, unified);
  return unified;
}

async function searchProvider(
  provider: MusicProvider,
  query: string,
  options: { signal?: AbortSignal; limit?: number }
): Promise<ProviderSearchResult> {
  const status = provider.getStatus();

  if (status.state === 'not_configured' || status.state === 'not_connected') {
    return {
      provider: provider.id,
      status,
      tracks: [],
      artists: [],
      albums: []
    };
  }

  const [tracks, artists, albums] = await Promise.all([
    provider.searchTracks(query, options),
    provider.searchArtists(query, options),
    provider.searchAlbums(query, options)
  ]);

  return {
    provider: provider.id,
    status: provider.getStatus(),
    tracks,
    artists,
    albums
  };
}

function createEmptyProviderResult(provider: MusicProvider): ProviderSearchResult {
  return {
    provider: provider.id,
    status: provider.getStatus(),
    tracks: [],
    artists: [],
    albums: []
  };
}

function createFailedProviderResult(provider: MusicProvider, reason: unknown): ProviderSearchResult {
  if (reason instanceof DOMException && reason.name === 'AbortError') {
    return createEmptyProviderResult(provider);
  }

  if (reason instanceof ProviderUnavailableError) {
    return {
      provider: provider.id,
      status: reason.status,
      tracks: [],
      artists: [],
      albums: []
    };
  }

  return {
    provider: provider.id,
    status: {
      ...provider.getStatus(),
      state: 'unavailable',
      message: reason instanceof Error ? reason.message : `${provider.name} unavailable`
    },
    tracks: [],
    artists: [],
    albums: []
  };
}

function dedupeByProviderId<T extends MusicTrack | MusicArtist | MusicAlbum>(items: T[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.provider}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
