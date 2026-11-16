import { AppLanguage } from '../types';
import { pickLang } from './i18n';

/**
 * Normalizes live football status strings from external APIs (Fotmob, ESPN, Roja)
 * into standard clean Spanish terms:
 * "Half-Time" / "HT" -> "Descanso"
 * "Full-Time" / "FT" -> "Final"
 * "Not started" / "NS" / "Upcoming" -> "Por empezar"
 */
export function normalizeMatchStatus(raw?: string, state?: 'live' | 'upcoming' | 'finished'): string {
  const trimmed = String(raw || '').trim();
  if (state === 'upcoming' && (!trimmed || /^(not started|ns|scheduled|por empezar|per començar|upcoming)$/i.test(trimmed))) {
    return 'Por empezar';
  }
  if (state === 'finished' && (!trimmed || /^(ft|full-time|full time|finished|finalizado|final)$/i.test(trimmed))) {
    return 'Final';
  }
  if (!trimmed) {
    return state === 'live' ? 'EN VIVO' : 'Por empezar';
  }

  // Common translations
  if (/^(ht|half-time|half time|half_time|descanso|mitja part)$/i.test(trimmed)) {
    return 'Descanso';
  }
  if (/^(ft|full-time|full time|full_time|final|finalizado|finished)$/i.test(trimmed)) {
    return 'Final';
  }
  if (/^(not started|ns|por empezar|per començar|upcoming|scheduled)$/i.test(trimmed)) {
    return 'Por empezar';
  }
  if (/^penal/i.test(trimmed)) {
    return 'Penaltis';
  }
  if (/^pr[oó]rroga|^extra|^aet/i.test(trimmed)) {
    return 'Prórroga';
  }
  return trimmed;
}

/**
 * Generates a clean 1-line league header with country/federation name and icon type.
 * Examples: "CONCACAF · Liga de Naciones", "Uruguay · Liga AUF", "España · LaLiga"
 */
export function formatLeagueHeader(
  regionName: string,
  leagueName: string,
  groupTitle: string
): {
  iconType: 'flag' | 'trophy';
  title: string;
} {
  const raw = groupTitle || `${regionName}: ${leagueName}`;
  let clean = raw.replace(/^[A-Z]{2,4}:\s*/i, '').replace(/:\s*/, ' · ').trim();

  // Fix specific leagues to ensure proper Spanish naming with country
  if (/concacaf/i.test(clean)) {
    clean = 'CONCACAF · Liga de Naciones';
  } else if (/auf/i.test(clean) && !/uruguay/i.test(clean)) {
    clean = 'Uruguay · Liga AUF';
  } else if (regionName && !clean.toLowerCase().includes(regionName.toLowerCase())) {
    clean = `${regionName} · ${clean}`;
  }

  // Remove overly verbose tags like Jornada / Temporada from list header
  clean = clean
    .replace(/\s*-\s*Jornada\s*\d+/i, '')
    .replace(/\s*-\s*Temporada\s*\d+/i, '')
    .replace(/\s*-\s*Grupo\s*[A-Z0-9]+/i, '')
    .replace(/\s*-\s*Fase de grupos/i, '')
    .trim();

  const lower = clean.toLowerCase();
  const isCupOrInternational =
    /trophy|copa|cup|champions|europa league|conference|libertadores|sudamericana|nations|naciones|concacaf|afcon|eurocopa|mundial|supercopa/i.test(
      lower
    ) || /internacional|europa|sudam[eé]rica/i.test(regionName.toLowerCase());

  return {
    iconType: isCupOrInternational ? 'trophy' : 'flag',
    title: clean,
  };
}
