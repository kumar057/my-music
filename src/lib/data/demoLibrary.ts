import type { Playlist, Track } from '$lib/types/music';

const youtubeTrack = (input: Omit<Track, 'source' | 'playbackMode' | 'playable' | 'playbackSupported' | 'embedUrl' | 'providerBadge'> & { videoId: string }): Track => ({
  ...input,
  source: 'youtube',
  provider: 'youtube',
  providerTrackId: input.videoId,
  providerBadge: 'Official YouTube',
  embedUrl: `https://www.youtube.com/embed/${input.videoId}?enablejsapi=1&rel=0`,
  playbackMode: 'YOUTUBE',
  playable: true,
  playbackSupported: true
});

export const demoTracks: Track[] = [
  youtubeTrack({ id: 'butta-bomma', title: 'Butta Bomma', artist: 'Armaan Malik', album: 'Ala Vaikunthapurramuloo', duration: 197, genre: 'Telugu', year: 2020, fileType: 'YouTube', bitrate: 'Official video', favorite: true, videoId: '2mDCVzruYzQ', cover: { from: '#ff9f43', via: '#e85d04', to: '#6a040f' } }),
  youtubeTrack({ id: 'kesariya', title: 'Kesariya', artist: 'Arijit Singh', album: 'Brahmāstra: Part One – Shiva', duration: 269, genre: 'Hindi', year: 2022, fileType: 'YouTube', bitrate: 'Official video', favorite: true, videoId: 'BddP6PYo2gs', cover: { from: '#ff7b54', via: '#d62828', to: '#3a0ca3' } }),
  youtubeTrack({ id: 'apna-bana-le', title: 'Apna Bana Le', artist: 'Arijit Singh, Sachin-Jigar', album: 'Bhediya', duration: 264, genre: 'Hindi', year: 2022, fileType: 'YouTube', bitrate: 'Official video', favorite: false, videoId: 'ElZfdU54Cp8', cover: { from: '#ffd166', via: '#ef476f', to: '#5a189a' } }),
  youtubeTrack({ id: 'arabic-kuthu', title: 'Arabic Kuthu', artist: 'Anirudh Ravichander, Jonita Gandhi', album: 'Beast', duration: 274, genre: 'Tamil', year: 2022, fileType: 'YouTube', bitrate: 'Official video', favorite: true, videoId: 'KUN5Uf9mObQ', cover: { from: '#00b4d8', via: '#0077b6', to: '#03045e' } }),
  youtubeTrack({ id: 'mersal-arasan', title: 'Mersal Arasan', artist: 'A.R. Rahman', album: 'Mersal', duration: 246, genre: 'Tamil', year: 2017, fileType: 'YouTube', bitrate: 'Official video', favorite: false, videoId: 'Wxqu1eVJ4Vs', cover: { from: '#f4a261', via: '#e76f51', to: '#264653' } }),
  youtubeTrack({ id: 'perfect', title: 'Perfect', artist: 'Ed Sheeran', album: '÷', duration: 263, genre: 'English', year: 2017, fileType: 'YouTube', bitrate: 'Official video', favorite: false, videoId: '2Vv-BfVoq4g', cover: { from: '#d8f3dc', via: '#74c69d', to: '#1b4332' } })
];

export const demoPlaylists: Playlist[] = [
  { id: 'favorites', name: 'Favorites', trackIds: ['butta-bomma', 'kesariya', 'arabic-kuthu'] },
  { id: 'indian-hits', name: 'Indian Hits', trackIds: ['butta-bomma', 'kesariya', 'apna-bana-le', 'arabic-kuthu', 'mersal-arasan'] },
  { id: 'english', name: 'English', trackIds: ['perfect'] },
  { id: 'recent', name: 'Recently Added', trackIds: ['butta-bomma', 'kesariya', 'apna-bana-le', 'arabic-kuthu', 'mersal-arasan', 'perfect'] }
];
