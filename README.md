# Local Music Player

A local-first music player scaffold built around the requested 2026 stack:
Tauri 2, SvelteKit, TypeScript, Tailwind CSS, Lucide icons, and a Rust backend
layout for audio, library scanning, metadata, and future plugins.

## Current Slice

- Responsive SvelteKit player UI with library views, search, genre filters, queue,
  favorites, playback controls, repeat/shuffle state, and simulated progress.
- Static PWA manifest for browser installs.
- Tauri 2 project scaffold with Rust command boundaries:
  - `get_library_overview`
  - `scan_library`
  - `get_playback_devices`
  - `read_track_metadata`
- Backend modules prepared for:
  - `audio`
  - `library`
  - `metadata`
  - `commands`
  - `plugins`

## Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5174/`, then use **Scan Folder** to choose a local
music folder. Chrome and Edge can keep folder/file handles in browser storage on
localhost. Use **Files** as the fallback import path in browsers that do not
support folder scanning.

For the desktop shell:

```bash
npm run tauri dev
```

Rust is required for Tauri desktop builds. Install it from rustup before running
desktop commands.

## Next Backend Milestones

1. Replace demo frontend data with `scan_library` results persisted in SQLite.
2. Implement metadata extraction with `lofty`.
3. Wire decoding/playback through Symphonia, Rodio, and CPAL.
4. Add folder watching with `notify`.
5. Add media key, tray, lyrics, equalizer, and mobile-specific capabilities.
