# My Music

My Music is a SvelteKit + Tauri music app for local playback and official music discovery. It can import local audio into a browser IndexedDB library, search configured provider APIs, play officially exposed previews or embeds, and store playlists, favorites, queue state, and recent history locally.

The app does not scrape websites, bypass DRM, download copyrighted music, or extract audio from Spotify, Apple Music, YouTube, or any other provider.

## Features

- Local music import with files, folders where the browser supports them, and drag/drop.
- IndexedDB storage for local metadata, local file handles/files, playlists, favorites, recently played, and provider track references.
- Unified search architecture for Spotify, Apple Music, YouTube, and local metadata.
- Official provider handling:
  - Spotify Web API search through OAuth PKCE.
  - Apple Music catalog search through a safe developer-token endpoint.
  - YouTube Data API metadata search with official embed/open links.
- Bottom player with queue, previous/next, play/pause, shuffle, repeat, seek, volume, mute, favorites, and immersive mode.
- Premium glass UI with first-visit intro, subtle 3D album depth, ambient visualizer, touch ripples, and reduced-motion support.
- Responsive desktop sidebar and mobile bottom navigation.
- Static Vercel deployment with Tauri desktop scaffold preserved.

## Architecture

Music provider logic lives in `src/lib/music`:

- `types.ts` defines normalized tracks, artists, albums, provider status, and provider interfaces.
- `providers/spotify.ts` uses official Spotify OAuth PKCE and Web API search, including refresh-token handling when the access token expires.
- `providers/appleMusic.ts` uses the Apple Music catalog API through a server-side token endpoint.
- `providers/youtube.ts` uses the official YouTube Data API and YouTube embed URLs.
- `search.ts` runs providers with `Promise.allSettled`, caches search results, supports cancellation, and isolates provider failures.
- `normalizer.ts` converts provider results into player tracks without storing or downloading protected audio.

Local music logic stays in `src/lib/local/localLibrary.ts`. Player state and playlist/favorite/recent behavior live in `src/lib/stores/player.ts`.

## Tech Stack

- SvelteKit
- Svelte 5
- TypeScript
- Vite
- Tailwind CSS
- IndexedDB
- Tauri 2
- Static Vercel deployment

## Local Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5174/`.

For the Tauri desktop shell:

```bash
npm run tauri dev
```

Rust is required for Tauri desktop builds.

## Environment Variables

Create `.env` from `.env.example`.

Browser-safe public values:

```bash
PUBLIC_SPOTIFY_CLIENT_ID=
PUBLIC_SPOTIFY_REDIRECT_URI=
PUBLIC_YOUTUBE_API_KEY=
PUBLIC_APPLE_MUSIC_TOKEN_ENDPOINT=
PUBLIC_APPLE_MUSIC_STOREFRONT=us
```

Server-only Apple Music signing values:

```bash
APPLE_MUSIC_TEAM_ID=
APPLE_MUSIC_KEY_ID=
APPLE_MUSIC_PRIVATE_KEY=
```

Never expose Apple private keys, Spotify client secrets, OAuth secrets, server credentials, passwords, or tokens in client-side JavaScript. `.env` and `.env.*` are ignored by Git. `.env.example` is safe to commit.

## Spotify Setup

1. Create a Spotify app in the Spotify Developer Dashboard.
2. Add the local and production redirect URLs.
3. Set `PUBLIC_SPOTIFY_CLIENT_ID`.
4. Optionally set `PUBLIC_SPOTIFY_REDIRECT_URI`; otherwise the app uses the current page URL.

Spotify search requires the user to connect with OAuth PKCE. The app refreshes an expired access token when Spotify provides a refresh token. Full Spotify playback still depends on Spotify account, subscription, device, and Spotify playback rules. The app only plays official preview URLs when Spotify exposes them.

## Apple Music Setup

Apple Music catalog search requires a developer token signed server-side. Do not put Apple private keys in frontend code.

Set `PUBLIC_APPLE_MUSIC_TOKEN_ENDPOINT` to a secure endpoint that returns a short-lived Apple Music developer token as plain text or JSON:

```json
{ "developerToken": "..." }
```

Apple Music full playback may require MusicKit and a valid Apple Music subscription. This app plays official previews when available and otherwise links users to Apple Music.

## YouTube Setup

1. Create or use a Google Cloud project.
2. Enable the YouTube Data API.
3. Set `PUBLIC_YOUTUBE_API_KEY`.
4. Restrict the key to the production domain and only the APIs this app needs.

The app uses YouTube metadata search and official embed/open links. It does not download or extract YouTube audio.

## Vercel Deployment

This project is configured for static SvelteKit output.

Vercel settings:

- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `build`

`vercel.json` includes the static output directory and SPA fallback rewrite.

For manual deployment, connect the GitHub repository to a Vercel project and set the production environment variables there. The repository also contains `.github/workflows/vercel-deploy.yml` for optional GitHub Actions deployment. That workflow requires a `VERCEL_TOKEN` repository secret and a Vercel project/account that the token can access.

Add only public environment variables to Vercel's frontend environment. Keep Apple signing keys in a separate secure token service or serverless endpoint.

## GitHub Actions

`.github/workflows/ci.yml` runs `npm ci`, `npm run check`, and `npm run build` for pushes to `main` and pull requests.

`.github/workflows/vercel-deploy.yml` can deploy the production build from `main` after a `VERCEL_TOKEN` secret is configured. If the Vercel account requires an organization/project scope, configure that project in Vercel before enabling the workflow.

## Provider Limitations

- If a provider is not configured, the UI shows `Provider not configured`.
- If Spotify is configured but not connected, search is disabled until OAuth completes.
- If one provider fails, the others can still return results.
- Online provider tracks store only provider IDs and metadata in IndexedDB.
- Local music works offline. Online providers show unavailable/offline states when network or credentials are missing.
- Audio analysis is used only when browser playback exposes audio data. Provider restrictions are respected.

## Security Notes

- No scraping.
- No DRM bypass.
- No unauthorized downloading.
- No copyrighted music extraction.
- No private keys or secrets in GitHub.
- No passwords stored by the app.
- Spotify uses PKCE, state validation, and access-token refresh handling.
- YouTube API keys should be restricted by API and production domain.
- Apple Music signing keys remain outside the frontend and should only be used by a secure token service.

## Verification

```bash
npm run check
npm run build
git diff --check
```
