export function decodeBasicHtmlEntities(raw: string): string {
  return String(raw || '')
    .replace(/&#0*38;|&amp;|&#x0*26;/gi, '&')
    .replace(/&#0*39;|&#8217;|&apos;/gi, "'")
    .replace(/&#8211;|&ndash;/gi, '-')
    .replace(/&#8212;|&mdash;/gi, '-')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const n = Number(dec);
      return Number.isFinite(n) && n >= 32 && n <= 65535 ? String.fromCharCode(n) : ' ';
    });
}

export function normalizeTitleForMatch(raw: string): string {
  return decodeBasicHtmlEntities(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function unpackDeanEdwards(html: string): string | null {
  const m = html.match(
    /eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([^'"]*)\5\.split\(['"]\|['"]\)/
  );
  if (!m) return null;

  let [, , payload, radixStr, countStr, , dictStr] = m;
  const radix = parseInt(radixStr, 10);
  let count = parseInt(countStr, 10);
  const dict = dictStr.split('|');

  const toBase = (num: number, base: number): string => {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return num < base ? chars[num] : toBase(Math.floor(num / base), base) + chars[num % base];
  };

  while (count--) {
    if (dict[count]) {
      const token = toBase(count, radix);
      payload = payload.replace(new RegExp(`\\b${token}\\b`, 'g'), dict[count]);
    }
  }
  return payload;
}

export function extractTitleMatchVariants(raw: string): string[] {
  const str = decodeBasicHtmlEntities(raw).trim();
  if (!str) return [];
  const full = normalizeTitleForMatch(str);
  const outside = normalizeTitleForMatch(str.replace(/\s*\([^)]*\)/g, ''));
  const variants = new Set<string>();
  if (full.length >= 2) variants.add(full);
  if (outside.length >= 2) variants.add(outside);
  const parenRe = /\(([^)]+)\)/g;
  let pm: RegExpExecArray | null;
  while ((pm = parenRe.exec(str)) !== null) {
    const insideRaw = String(pm[1] || '').trim();
    // Ignore pure release-year parentheses like "(2024)" unless the main title matches too
    if (/^(?:19|20)\d{2}$/.test(insideRaw)) continue;
    const insideNorm = normalizeTitleForMatch(insideRaw);
    if (insideNorm.length >= 2) variants.add(insideNorm);
  }
  // Handle dual-title separators used by Movidy/Gnula (e.g. "Deadpool y Lobezno - Deadpool 3", "Title A / Title B")
  const splitParts = str
    .replace(/\s*\([^)]*\)/g, '')
    .split(/\s+(?:-|–|—|\/|\|)\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);
  if (splitParts.length > 1) {
    for (const part of splitParts) {
      const normPart = normalizeTitleForMatch(part);
      if (normPart.length >= 3) variants.add(normPart);
    }
  }
  return Array.from(variants);
}

export function areTitlesStrictlyEqual(candidateTitle: string, targetHints: string[]): boolean {
  const candVariants = extractTitleMatchVariants(candidateTitle);
  if (candVariants.length === 0) return false;
  const targetVariants = new Set(targetHints.flatMap((h) => extractTitleMatchVariants(h)));
  if (targetVariants.size === 0) return false;
  return candVariants.some((cv) => targetVariants.has(cv));
}

export function parseDurationTextToMinutes(rawDuration?: string | null): number {
  const txt = String(rawDuration || '').trim();
  if (!txt) return 0;
  // ISO-8601 e.g. PT2H6M or PT118M
  const isoMatch = txt.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (isoMatch) {
    const h = Number(isoMatch[1] || 0);
    const m = Number(isoMatch[2] || 0);
    return h * 60 + m;
  }
  const hmMatch = txt.match(
    /(\d+)\s*(?:hours?|hrs?\.?|h\.?)\s*(?:(\d+)\s*(?:minutos?|mins?\.?|m\.?)?)?/i
  );
  if (hmMatch) {
    return Number(hmMatch[1] || 0) * 60 + Number(hmMatch[2] || 0);
  }
  const minMatch = txt.match(/(\d+)\s*(?:minutos?|mins?\.?|m\.?)(?!\w)/i);
  if (minMatch) {
    return Number(minMatch[1] || 0);
  }
  return 0;
}

export function directorsMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeTitleForMatch(a || '');
  const nb = normalizeTitleForMatch(b || '');
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aTokens = na.split(/\s+/).filter((t) => t.length >= 4);
  const bTokens = nb.split(/\s+/).filter((t) => t.length >= 4);
  return aTokens.some((tok) => bTokens.includes(tok));
}

export function isMetadataCompatibleForMedia(opts: {
  candidateTitle?: string;
  targetTitleHints: string[];
  candidateYear?: string | number | null;
  expectedYear?: string | number | null;
  candidateDirector?: string | null;
  expectedDirector?: string | null;
  candidateRuntimeMin?: number | null;
  expectedRuntimeMin?: number | null;
  allowAdjacentYearWithoutProof?: boolean;
}): { ok: boolean; exactYear: boolean; reason?: string } {
  if (opts.candidateTitle && opts.targetTitleHints.length > 0) {
    if (!areTitlesStrictlyEqual(opts.candidateTitle, opts.targetTitleHints)) {
      return { ok: false, exactYear: false, reason: 'title_mismatch' };
    }
  }

  const expYear = Number(String(opts.expectedYear || '').replace(/\D/g, '')) || 0;
  const candYear = Number(String(opts.candidateYear || '').replace(/\D/g, '')) || 0;
  const exactYear = candYear > 1900 && expYear > 1900 && candYear === expYear;
  const hasDirPair = Boolean(
    normalizeTitleForMatch(opts.candidateDirector || '') &&
      normalizeTitleForMatch(opts.expectedDirector || '')
  );
  const dirOk = hasDirPair && directorsMatch(opts.candidateDirector, opts.expectedDirector);

  const expRun = Number(opts.expectedRuntimeMin || 0);
  const candRun = Number(opts.candidateRuntimeMin || 0);
  const hasRunPair = expRun >= 30 && candRun >= 30;
  if (hasRunPair && Math.abs(expRun - candRun) > 25) {
    return { ok: false, exactYear: false, reason: 'runtime_mismatch' };
  }
  const tightRuntimeOk = hasRunPair && Math.abs(expRun - candRun) <= 5;

  if (hasDirPair && !dirOk && !exactYear && !tightRuntimeOk) {
    return { ok: false, exactYear: false, reason: 'director_mismatch' };
  }

  if (expYear > 1900) {
    if (candYear > 1900) {
      const yearDiff = Math.abs(candYear - expYear);
      if (yearDiff > 1) {
        return { ok: false, exactYear: false, reason: 'year_mismatch' };
      }
      if (yearDiff === 1 && !dirOk && !tightRuntimeOk && !opts.allowAdjacentYearWithoutProof) {
        return { ok: false, exactYear: false, reason: 'adjacent_year_unverified' };
      }
      return { ok: true, exactYear: yearDiff === 0 };
    }
    // Candidate has no year: require corroborating director or tight runtime match
    if (!dirOk && !tightRuntimeOk) {
      return { ok: false, exactYear: false, reason: 'missing_candidate_year' };
    }
  }

  return { ok: true, exactYear: candYear > 1900 && expYear > 1900 && candYear === expYear };
}

const YOUTUBE_TITLE_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'you',
  'can',
  'see',
  'her',
  'his',
  'she',
  'its',
  'that',
  'this',
  'are',
  'not',
  'but',
  'out',
  'all',
  'one',
  'two',
  'los',
  'las',
  'una',
  'uno',
  'unos',
  'unas',
  'del',
  'con',
  'por',
  'para',
  'que',
  'sin',
  'mas',
  'sobre',
]);

export function matchesYouTubeFallbackTitle(movieTitle: string, videoTitle: string): boolean {
  const normMovie = normalizeTitleForMatch(
    String(movieTitle || '').replace(/\s*\([^)]*\)/g, '')
  );
  const normVideo = normalizeTitleForMatch(videoTitle);
  if (!normMovie || !normVideo) return false;

  const allTokens = normMovie.split(/\s+/).filter(Boolean);
  const meaningfulTokens = allTokens.filter(
    (tok) => tok.length >= 3 && !YOUTUBE_TITLE_STOPWORDS.has(tok)
  );
  const requiredTokens =
    meaningfulTokens.length >= 1 && meaningfulTokens.length * 2 >= allTokens.length
      ? meaningfulTokens
      : allTokens.filter((tok) => tok.length >= 2);
  if (requiredTokens.length === 0) return false;

  const videoWords = new Set(normVideo.split(/\s+/).filter(Boolean));
  return requiredTokens.every((tok) => videoWords.has(tok));
}

export function generateSpanishTitleHints(title: string): string[] {
  const t = String(title || '');
  const variants: string[] = [t];
  const lower = t.toLowerCase();

  const subs: Record<string, string[]> = {
    'brand new day': ['un nuevo dia', 'un nuevo día'],
    'no way home': ['sin camino a casa'],
    'homecoming': ['regreso a casa', 'de regreso a casa'],
    'far from home': ['lejos de casa'],
    'across the spider-verse': ['a traves del spider-verso', 'atraves del spiderverso'],
    'into the spider-verse': ['un nuevo universo', 'dentro del spider-verso'],
    'multiverse of madness': ['multiverso de la locura'],
    'love and thunder': ['amor y trueno'],
    'wakanda forever': ['wakanda por siempre'],
  };

  for (const [enSub, esSubs] of Object.entries(subs)) {
    if (lower.includes(enSub)) {
      const base = t.replace(new RegExp(enSub, 'i'), '').replace(/[:\-\u2013\s]+$/, '').trim();
      for (const esSub of esSubs) {
        variants.push(`${base}: ${esSub}`);
        variants.push(`${base} ${esSub}`);
      }
    }
  }
  return variants;
}
