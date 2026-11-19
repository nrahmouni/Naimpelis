export function normalizeSearchStr(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectOrdinalSelection(query: string): number | null {
  const norm = normalizeSearchStr(query);
  if (!norm || norm.length > 48) return null;
  const prefix = '(?:(?:ponme|ponle|pon|abre|reproduce|dame|ver|quiero ver|quiero)\\s+)?(?:(?:el|la|numero|n)\\s+)?';
  if (new RegExp(`^${prefix}(primera|primero|uno|1a|1o|1)$`).test(norm)) {
    return 0;
  }
  if (new RegExp(`^${prefix}(segunda|segundo|dos|2a|2o|2)$`).test(norm)) {
    return 1;
  }
  if (new RegExp(`^${prefix}(tercera|tercero|tres|3a|3o|3)$`).test(norm)) {
    return 2;
  }
  if (new RegExp(`^${prefix}(cuarta|cuarto|cuatro|4a|4o|4)$`).test(norm)) {
    return 3;
  }
  if (new RegExp(`^${prefix}(quinta|quinto|cinco|5a|5o|5)$`).test(norm)) {
    return 4;
  }
  return null;
}

export const WORD_TO_NUMBER: Record<string, number> = {
  primera: 1,
  primer: 1,
  primero: 1,
  uno: 1,
  '1a': 1,
  '1o': 1,
  '1': 1,
  segunda: 2,
  segundo: 2,
  dos: 2,
  '2a': 2,
  '2o': 2,
  '2': 2,
  tercera: 3,
  tercer: 3,
  tercero: 3,
  tres: 3,
  '3a': 3,
  '3o': 3,
  '3': 3,
  cuarta: 4,
  cuarto: 4,
  cuatro: 4,
  '4a': 4,
  '4o': 4,
  '4': 4,
  quinta: 5,
  quinto: 5,
  cinco: 5,
  '5a': 5,
  '5o': 5,
  '5': 5,
  sexta: 6,
  sexto: 6,
  seis: 6,
  '6': 6,
  septima: 7,
  septimo: 7,
  siete: 7,
  '7': 7,
  octava: 8,
  octavo: 8,
  ocho: 8,
  '8': 8,
  novena: 9,
  noveno: 9,
  nueve: 9,
  '9': 9,
  decima: 10,
  decimo: 10,
  diez: 10,
  '10': 10,
};

export const NUM_WORDS_PATTERN =
  '\\d{1,3}|primera|primer|primero|uno|una|segunda|segundo|dos|tercera|tercer|tercero|tres|cuarta|cuarto|cuatro|quinta|quinto|cinco|sexta|sexto|seis|septima|septimo|siete|octava|octavo|ocho|novena|noveno|nueve|decima|decimo|diez';

export function parseNumToken(raw: string): number | undefined {
  const clean = raw.trim().toLowerCase();
  if (/^\d+$/.test(clean)) return Number(clean);
  if (clean === 'una') return 1;
  return WORD_TO_NUMBER[clean];
}

export function parseSeriesSeasonAndEpisode(rawQuery: string): {
  season?: number;
  episode?: number;
  cleanTitle: string;
  hasEpisodeRequest: boolean;
} {
  const norm = normalizeSearchStr(rawQuery);
  let season: number | undefined;
  let episode: number | undefined;
  let hasEpisodeRequest = false;

  // Compact SxxExx or 2x02 / t2e2 notation
  const compactMatch = norm.match(/\b(?:s|t)?(\d{1,2})\s*[xe]\s*(\d{1,3})\b/i);
  if (compactMatch) {
    season = Number(compactMatch[1]);
    episode = Number(compactMatch[2]);
    if (episode) hasEpisodeRequest = true;
  }

  const epWord = '(?:capitulo|cap|episodio|ep|episode)';
  const epMatch1 = norm.match(
    new RegExp(`\\b(?:el\\s+)?${epWord}\\s+(?:numero\\s+)?(${NUM_WORDS_PATTERN})\\b`, 'i')
  );
  const epMatch2 = norm.match(
    new RegExp(`\\b(?:el\\s+)?(${NUM_WORDS_PATTERN})\\s+${epWord}\\b`, 'i')
  );

  if (!episode && epMatch1) {
    episode = parseNumToken(epMatch1[1]);
    if (episode) hasEpisodeRequest = true;
  } else if (!episode && epMatch2) {
    episode = parseNumToken(epMatch2[1]);
    if (episode) hasEpisodeRequest = true;
  }

  const seasonWord = '(?:temporada|temp|t|season)';
  const seasonMatch1 = norm.match(
    new RegExp(`\\b(${NUM_WORDS_PATTERN})\\s+${seasonWord}\\b`, 'i')
  );
  const seasonMatch2 = norm.match(
    new RegExp(`\\b(?:la\\s+)?${seasonWord}\\s+(?:numero\\s+)?(${NUM_WORDS_PATTERN})\\b`, 'i')
  );

  if (!season && seasonMatch1) {
    season = parseNumToken(seasonMatch1[1]);
  } else if (!season && seasonMatch2) {
    season = parseNumToken(seasonMatch2[1]);
  }

  if (episode && !season) {
    season = 1;
  }

  let cleaned = norm
    .replace(/^(?:quiero ver|quiero|ponme|ponle|pon|ponnos|abre|reproduce|ver|busca|buscame|dame)\s+/g, '')
    .replace(/\b(?:s|t)?\d{1,2}\s*[xe]\s*\d{1,3}\b/gi, ' ')
    .replace(new RegExp(`\\b(?:el\\s+)?${epWord}\\s+(?:numero\\s+)?(?:${NUM_WORDS_PATTERN})\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b(?:el\\s+)?(?:${NUM_WORDS_PATTERN})\\s+${epWord}\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b(?:la\\s+)?${seasonWord}\\s+(?:numero\\s+)?(?:${NUM_WORDS_PATTERN})\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b(?:${NUM_WORDS_PATTERN})\\s+${seasonWord}\\b`, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip only leading/trailing connector words (preserving internal "de" e.g. "juego de tronos")
  for (let i = 0; i < 4; i += 1) {
    cleaned = cleaned
      .replace(/^(?:de la serie|de la|de el|del|de|la serie|el|la|en)\s+/i, '')
      .replace(/\s+(?:de la serie|de la|de el|del|de|en)$/i, '')
      .trim();
  }

  return {
    season,
    episode,
    cleanTitle: cleaned,
    hasEpisodeRequest,
  };
}
