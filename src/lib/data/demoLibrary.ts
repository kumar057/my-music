import type { Playlist, Track } from '$lib/types/music';

export const demoTracks: Track[] = [
  {
    id: 'phase-shift',
    title: 'Phase Shift',
    artist: 'Mira Vale',
    album: 'Late Night Circuits',
    duration: 255,
    genre: 'Electronic',
    year: 2026,
    fileType: 'FLAC',
    bitrate: '24-bit',
    favorite: true,
    source: 'demo',
    cover: { from: '#d7ff73', via: '#4ab5a4', to: '#1e4b5f' }
  },
  {
    id: 'glass-harbor',
    title: 'Glass Harbor',
    artist: 'North Pier',
    album: 'Tide Tables',
    duration: 203,
    genre: 'Indie',
    year: 2025,
    fileType: 'ALAC',
    bitrate: '16-bit',
    favorite: false,
    source: 'demo',
    cover: { from: '#8bd3ff', via: '#4578c8', to: '#28314f' }
  },
  {
    id: 'paper-sun',
    title: 'Paper Sun',
    artist: 'June Arcade',
    album: 'Room Tone',
    duration: 188,
    genre: 'Pop',
    year: 2024,
    fileType: 'AAC',
    bitrate: '320 kbps',
    favorite: true,
    source: 'demo',
    cover: { from: '#ffd166', via: '#ef7b45', to: '#3b2d4f' }
  },
  {
    id: 'static-bloom',
    title: 'Static Bloom',
    artist: 'Vanta Fields',
    album: 'Green Room Sessions',
    duration: 309,
    genre: 'Ambient',
    year: 2026,
    fileType: 'OPUS',
    bitrate: '256 kbps',
    favorite: false,
    source: 'demo',
    cover: { from: '#b8f2e6', via: '#5e6472', to: '#292f36' }
  },
  {
    id: 'metro-blue',
    title: 'Metro Blue',
    artist: 'The After Hours',
    album: 'Last Train Home',
    duration: 231,
    genre: 'Jazz',
    year: 2023,
    fileType: 'WAV',
    bitrate: '1411 kbps',
    favorite: false,
    source: 'demo',
    cover: { from: '#f7a072', via: '#7d4f50', to: '#2d232e' }
  },
  {
    id: 'signal-house',
    title: 'Signal House',
    artist: 'Caldera Unit',
    album: 'Signal House',
    duration: 274,
    genre: 'Rock',
    year: 2025,
    fileType: 'MP3',
    bitrate: '320 kbps',
    favorite: true,
    source: 'demo',
    cover: { from: '#fbf8cc', via: '#f07167', to: '#175676' }
  },
  {
    id: 'soft-reset',
    title: 'Soft Reset',
    artist: 'Kairo Lane',
    album: 'Temporary Memory',
    duration: 217,
    genre: 'R&B',
    year: 2024,
    fileType: 'FLAC',
    bitrate: '24-bit',
    favorite: false,
    source: 'demo',
    cover: { from: '#cdb4db', via: '#ffafcc', to: '#4f518c' }
  },
  {
    id: 'small-hours',
    title: 'Small Hours',
    artist: 'Leela Park',
    album: 'Kitchen Light',
    duration: 196,
    genre: 'Folk',
    year: 2022,
    fileType: 'VORBIS',
    bitrate: '192 kbps',
    favorite: false,
    source: 'demo',
    cover: { from: '#ccd5ae', via: '#e9edc9', to: '#6c584c' }
  }
];

export const demoPlaylists: Playlist[] = [
  { id: 'favorites', name: 'Favorites', count: 3 },
  { id: 'late-night', name: 'Late Night', count: 18 },
  { id: 'lossless', name: 'Lossless Finds', count: 42 },
  { id: 'recent', name: 'Recently Added', count: 31 }
];
