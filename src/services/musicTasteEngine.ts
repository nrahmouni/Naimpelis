import type {
  ListeningStats,
  MusicTrack,
  TasteProfile,
  UserMusicPlaylist,
} from '../types/music';

export interface TasteScoreInput {
  likedTracks: MusicTrack[];
  recentTracks: MusicTrack[];
  userPlaylists: UserMusicPlaylist[];
  tasteProfile: TasteProfile;
  listeningStats: ListeningStats;
}

export interface ComputedTasteSummary {
  topArtists: Array<{ name: string; weight: number }>;
  favoriteGenres: string[];
  likedSeeds: Array<{ id?: string; title: string; artist: string }>;
  recentSeeds: Array<{ id?: string; title: string; artist: string }>;
  skippedArtists: string[];
  shelfHeadline: string;
  secondaryHeadline: string;
}

function norm(s: string): string {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function primaryArtist(name: string): string {
  return String(name || '').split(/,|&|\bfeat\.?\b|\bft\.?\b/i)[0].trim();
}

export function computeUserTasteSummary(input: TasteScoreInput): ComputedTasteSummary {
  const artistScores = new Map<string, { name: string; score: number }>();
  const addArtistScore = (rawName: string, delta: number) => {
    const clean = primaryArtist(rawName);
    const key = norm(clean);
    if (!key || key === 'artista' || key === 'various artists') return;
    const prev = artistScores.get(key);
    artistScores.set(key, {
      name: prev?.name || clean,
      score: (prev?.score || 0) + delta,
    });
  };

  // Explicit favorite artists carry strong weight
  input.tasteProfile.favoriteArtists.forEach((art, idx) => {
    addArtistScore(art, Math.max(4, 10 - idx * 0.4));
  });

  // Liked tracks carry high affinity
  input.likedTracks.slice(0, 80).forEach((t, idx) => {
    addArtistScore(t.artist.name, Math.max(3, 7 - idx * 0.05));
  });

  // Saved playlist tracks carry moderate affinity
  input.userPlaylists.slice(0, 12).forEach((pl) => {
    pl.tracks.slice(0, 40).forEach((t) => addArtistScore(t.artist.name, 2.2));
  });

  // Recent listening carries recency boost
  input.recentTracks.slice(0, 25).forEach((t, idx) => {
    addArtistScore(t.artist.name, Math.max(1.5, 4.5 - idx * 0.12));
  });

  // Play counts + completions/skips fine-tune affinity
  Object.values(input.listeningStats.artistPlayCounts || {}).forEach((st) => {
    addArtistScore(st.name, Math.min(12, st.count * 1.4));
  });

  const skippedCountByArtist = new Map<string, number>();
  const completionByArtist = new Map<string, number>();

  Object.entries(input.listeningStats.trackSignals || {}).forEach(([trackId, sig]) => {
    const trackMeta = input.listeningStats.trackPlayCounts?.[trackId];
    const artName = sig.artist || trackMeta?.artist || '';
    const key = norm(primaryArtist(artName));
    if (!key) return;
    const comp = Number(sig.completions || 0);
    const skips = Number(sig.skips || 0);
    if (comp > 0) {
      addArtistScore(artName, comp * 3.5);
      completionByArtist.set(key, (completionByArtist.get(key) || 0) + comp);
    }
    if (skips > 0) {
      addArtistScore(artName, -skips * 2.5);
      skippedCountByArtist.set(key, (skippedCountByArtist.get(key) || 0) + skips);
    }
  });

  const skippedArtists: string[] = [];
  for (const [k, skips] of skippedCountByArtist.entries()) {
    const comps = completionByArtist.get(k) || 0;
    if (skips >= 2 && comps === 0) {
      skippedArtists.push(k);
    }
  }

  const rankedArtists = Array.from(artistScores.values())
    .filter((a) => a.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((a) => ({ name: a.name, weight: Number(a.score.toFixed(1)) }));

  const likedSeeds = input.likedTracks.slice(0, 4).map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist.name,
  }));

  const recentSeeds = input.recentTracks.slice(0, 4).map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist.name,
  }));

  const favoriteGenres = input.tasteProfile.favoriteGenres.slice(0, 5);
  const topTwo = rankedArtists.slice(0, 2).map((a) => a.name);
  const shelfHeadline =
    topTwo.length >= 2
      ? `Para ti según ${topTwo[0]} y ${topTwo[1]}`
      : topTwo.length === 1
      ? `Para ti según ${topTwo[0]}`
      : favoriteGenres.length > 0
      ? `Para ti · ${favoriteGenres.slice(0, 2).join(' · ')}`
      : 'Para ti según tus gustos';

  const seedForSub = input.likedTracks[0] || input.recentTracks[0];
  const secondaryHeadline = seedForSub
    ? `Porque escuchaste ${seedForSub.artist.name}`
    : 'Descubrimiento personalizado';

  return {
    topArtists: rankedArtists,
    favoriteGenres,
    likedSeeds,
    recentSeeds,
    skippedArtists,
    shelfHeadline,
    secondaryHeadline,
  };
}

function canonicalVariantKey(t: MusicTrack): string {
  const cleanTitle = String(t.title || '')
    .replace(/\((clean|explicit|radio edit|album version|remaster(?:ed)?(?:\s+\d{4})?|original mix|official(?:\s+(?:audio|video|lyric video))?|visualizer|feat\.?[^)]+)\)/gi, '')
    .replace(/\[(clean|explicit|radio edit|remaster(?:ed)?(?:\s+\d{4})?|official(?:\s+audio)?)\]/gi, '');
  return `${norm(cleanTitle)}|${norm(primaryArtist(t.artist?.name || ''))}`;
}

export function rankTracksByTaste(tracks: MusicTrack[], input: TasteScoreInput): MusicTrack[] {
  const summary = computeUserTasteSummary(input);
  const artistWeightMap = new Map<string, number>();
  summary.topArtists.forEach((a) => artistWeightMap.set(norm(a.name), a.weight));
  const likedIds = new Set(input.likedTracks.map((t) => t.id));
  const playlistIds = new Set(input.userPlaylists.flatMap((p) => p.tracks.map((t) => t.id)));
  const skippedSet = new Set(summary.skippedArtists);

  const sorted = [...tracks].sort((a, b) => {
    const scoreOf = (t: MusicTrack): number => {
      const artKey = norm(primaryArtist(t.artist.name));
      if (skippedSet.has(artKey)) return -50;
      let s = artistWeightMap.get(artKey) || 0;
      if (likedIds.has(t.id)) s += 4;
      if (playlistIds.has(t.id)) s += 3;
      const sig = input.listeningStats.trackSignals?.[t.id];
      if (sig?.completions) s += sig.completions * 2.5;
      if (sig?.skips) s -= sig.skips * 4;
      return s;
    };
    return scoreOf(b) - scoreOf(a);
  });

  const seenVariants = new Set<string>();
  return sorted.filter((t) => {
    const vk = canonicalVariantKey(t);
    if (seenVariants.has(vk)) return false;
    seenVariants.add(vk);
    return true;
  });
}

export async function fetchTasteRecommendationsFromServer(
  input: TasteScoreInput,
  excludeIds: string[] = [],
  limit = 26
): Promise<{
  tracks: MusicTrack[];
  reasonLabel: string;
  shelfHeadline: string;
  secondaryHeadline: string;
  hasPersonalSignals: boolean;
}> {
  const summary = computeUserTasteSummary(input);
  const hasPersonalSignals =
    summary.topArtists.length > 0 ||
    summary.favoriteGenres.length > 0 ||
    summary.likedSeeds.length > 0 ||
    summary.recentSeeds.length > 0;

  if (!hasPersonalSignals) {
    return {
      tracks: [],
      reasonLabel: '',
      shelfHeadline: summary.shelfHeadline,
      secondaryHeadline: summary.secondaryHeadline,
      hasPersonalSignals: false,
    };
  }

  const res = await fetch('/api/music/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topArtists: summary.topArtists,
      favoriteGenres: summary.favoriteGenres,
      likedSeeds: summary.likedSeeds,
      recentSeeds: summary.recentSeeds,
      skippedArtists: summary.skippedArtists,
      excludeIds,
      clientHour: new Date().getHours(),
      limit,
    }),
  });
  if (!res.ok) {
    return {
      tracks: [],
      reasonLabel: '',
      shelfHeadline: summary.shelfHeadline,
      secondaryHeadline: summary.secondaryHeadline,
      hasPersonalSignals: true,
    };
  }
  const data = await res.json();
  const rawTracks: MusicTrack[] = Array.isArray(data?.tracks) ? data.tracks : [];
  return {
    tracks: rankTracksByTaste(rawTracks, input),
    reasonLabel: String(data?.reasonLabel || summary.shelfHeadline),
    shelfHeadline: summary.shelfHeadline,
    secondaryHeadline: summary.secondaryHeadline,
    hasPersonalSignals: true,
  };
}
