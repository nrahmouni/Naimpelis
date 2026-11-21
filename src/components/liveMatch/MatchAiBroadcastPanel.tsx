import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, ExternalLink, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
import type { AppLanguage, FootballMatchDetails } from '../../types';
import { studioFetch } from '../../utils/studioApi';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';

export interface MatchAiInsightCard {
  category: string;
  label: string;
  metric: string;
  teamFocus: 'home' | 'away' | 'both';
  insight: string;
}

export interface MatchAiInsightsPayload {
  ok: boolean;
  engineMode?: 'gemini' | 'telemetry';
  headline: string;
  momentum: {
    favoredTeam: 'home' | 'away' | 'balanced';
    intensity: number;
    summary: string;
  };
  cards: MatchAiInsightCard[];
  watchNext: string;
  sources?: Array<{ title: string; uri: string }>;
  generatedAt: number;
}

interface MatchAiBroadcastPanelProps {
  lang: AppLanguage;
  homeTeam: string;
  awayTeam: string;
  homeScore?: string;
  awayScore?: string;
  statusState: 'live' | 'upcoming' | 'finished';
  statusLabel?: string;
  competition?: string;
  details: FootballMatchDetails | null;
}

const INSIGHTS_CACHE = new Map<string, MatchAiInsightsPayload>();
const AUTO_REFRESH_INTERVAL_MS = 75_000;

function formatCategoryLabel(category: string, lang: AppLanguage): string {
  switch (category) {
    case 'danger':
      return pickLang(lang, { es: 'Peligro real', ca: 'Perill real', en: 'Threat' });
    case 'efficiency':
      return pickLang(lang, { es: 'Eficacia', ca: 'Eficàcia', en: 'Efficiency' });
    case 'trend':
      return pickLang(lang, { es: 'Ritmo', ca: 'Ritme', en: 'Momentum' });
    case 'projection':
      return pickLang(lang, { es: 'Clave táctica', ca: 'Clau tàctica', en: 'Tactical key' });
    default:
      return pickLang(lang, { es: 'Análisis', ca: 'Anàlisi', en: 'Tactical' });
  }
}

function buildClientTelemetryFallback(params: {
  lang: AppLanguage;
  homeTeam: string;
  awayTeam: string;
  homeScore: string;
  awayScore: string;
  statusState: 'live' | 'upcoming' | 'finished';
  statusLabel: string;
  competition: string;
  details: FootballMatchDetails | null;
}): MatchAiInsightsPayload {
  const { lang, homeTeam, awayTeam, homeScore, awayScore, statusState, statusLabel, competition, details } = params;
  const stats = details?.statsByPeriod?.all?.length ? details.statsByPeriod.all : details?.stats || [];
  const possStat = stats.find((s) => /pos(es|ses)i[oó]n|possession/i.test(s.label || ''));
  const shotsStat = stats.find((s) => /remates|tiros|shots/i.test(s.label || ''));

  const hPoss = possStat ? parseFloat(String(possStat.homeValue || '').replace(/[^\d.]/g, '')) : NaN;
  const aPoss = possStat ? parseFloat(String(possStat.awayValue || '').replace(/[^\d.]/g, '')) : NaN;
  const hScore = parseFloat(homeScore);
  const aScore = parseFloat(awayScore);

  let favoredTeam: 'home' | 'away' | 'balanced' = 'balanced';
  let intensity = 58;
  if (Number.isFinite(hPoss) && Number.isFinite(aPoss) && hPoss + aPoss > 0) {
    const share = (hPoss / (hPoss + aPoss)) * 100;
    if (share >= 54) favoredTeam = 'home';
    else if (share <= 46) favoredTeam = 'away';
    intensity = Math.max(42, Math.min(90, Math.round(52 + Math.abs(share - 50) * 1.1)));
  } else if (Number.isFinite(hScore) && Number.isFinite(aScore) && hScore !== aScore) {
    favoredTeam = hScore > aScore ? 'home' : 'away';
    intensity = 68;
  }

  const cards: MatchAiInsightCard[] = [];
  if (possStat && Number.isFinite(hPoss) && Number.isFinite(aPoss)) {
    cards.push({
      category: 'tactical',
      label: pickLang(lang, { es: 'Dominio del balón', ca: 'Domini de la pilota', en: 'Ball control' }),
      metric: `${Math.round(hPoss)}% · ${Math.round(aPoss)}%`,
      teamFocus: hPoss >= aPoss + 5 ? 'home' : aPoss >= hPoss + 5 ? 'away' : 'both',
      insight: pickLang(lang, {
        es: 'Distribución en vivo de la posesión y control del ritmo de circulación.',
        ca: 'Distribució en directe de la possessió i control del ritme de joc.',
        en: 'Live ball control split measuring tempo dominance.',
      }),
    });
  }

  if (shotsStat) {
    cards.push({
      category: 'danger',
      label: pickLang(lang, { es: 'Finalizaciones', ca: 'Rematades', en: 'Shot volume' }),
      metric: `${shotsStat.homeValue} vs ${shotsStat.awayValue}`,
      teamFocus: 'both',
      insight: pickLang(lang, {
        es: 'Volumen ofensivo registrado en tiempo real sobre ambas porterías.',
        ca: 'Volum ofensiu registrat en temps real sobre totes dues porteries.',
        en: 'Attacking volume recorded across both penalty areas.',
      }),
    });
  }

  const lastEv = details?.events?.[details.events.length - 1];
  if (lastEv) {
    cards.push({
      category: 'efficiency',
      label: pickLang(lang, { es: 'Última acción clave', ca: 'Última acció clau', en: 'Latest key event' }),
      metric: lastEv.clock || statusLabel || 'En vivo',
      teamFocus: lastEv.side === 'home' ? 'home' : lastEv.side === 'away' ? 'away' : 'both',
      insight: `${lastEv.typeLabel || lastEv.type}${lastEv.playerName ? ` · ${lastEv.playerName}` : ''}`,
    });
  }

  while (cards.length < 3) {
    cards.push({
      category: cards.length === 0 ? 'tactical' : 'projection',
      label:
        cards.length === 0
          ? pickLang(lang, { es: 'Marcador y pulso', ca: 'Marcador i pols', en: 'Match pulse' })
          : pickLang(lang, { es: 'Lectura de fase', ca: 'Lectura de fase', en: 'Tactical phase' }),
      metric:
        cards.length === 0 && Number.isFinite(hScore) && Number.isFinite(aScore)
          ? `${hScore} - ${aScore}`
          : statusLabel || competition || 'Directo',
      teamFocus: favoredTeam === 'balanced' ? 'both' : favoredTeam,
      insight: pickLang(lang, {
        es:
          statusState === 'upcoming'
            ? 'Lectura previa lista: la batalla inicial en mediocampo marcará las primeras ocasiones.'
            : 'Motor estadístico local sincronizado con el marcador y los eventos del partido.',
        ca:
          statusState === 'upcoming'
            ? 'Lectura prèvia llesta: la batalla inicial al mig del camp marcarà les primeres ocasions.'
            : 'Motor estadístic local sincronitzat amb el marcador i els esdeveniments del partit.',
        en:
          statusState === 'upcoming'
            ? 'Pre-match brief synced: early midfield control will shape the opening chances.'
            : 'Local statistical engine synced with live match state and events.',
      }),
    });
  }

  return {
    ok: true,
    engineMode: 'telemetry',
    headline: pickLang(lang, {
      es: `${homeTeam} vs ${awayTeam}${Number.isFinite(hScore) && Number.isFinite(aScore) ? ` (${hScore}-${aScore})` : ''} · Telemetría en directo`,
      ca: `${homeTeam} vs ${awayTeam}${Number.isFinite(hScore) && Number.isFinite(aScore) ? ` (${hScore}-${aScore})` : ''} · Telemetria en directe`,
      en: `${homeTeam} vs ${awayTeam}${Number.isFinite(hScore) && Number.isFinite(aScore) ? ` (${hScore}-${aScore})` : ''} · Live Telemetry`,
    }),
    momentum: {
      favoredTeam,
      intensity,
      summary: pickLang(lang, {
        es: 'Índice de inercia calculado automáticamente con estadísticas oficiales y flujo de eventos.',
        ca: 'Índex d’inèrcia calculat automàticament amb estadístiques oficials i flux d’esdeveniments.',
        en: 'Momentum index computed from official match stats and live event flow.',
      }),
    },
    cards: cards.slice(0, 4),
    watchNext: pickLang(lang, {
      es: 'Vigila las transiciones por banda y la presión tras pérdida en el último tercio.',
      ca: 'Vigila les transicions per banda i la pressió rere pèrdua a l’últim terç.',
      en: 'Watch wide transitions and counter-pressing intensity in the final third.',
    }),
    sources: [],
    generatedAt: Date.now(),
  };
}

export const MatchAiBroadcastPanel: React.FC<MatchAiBroadcastPanelProps> = ({
  lang,
  homeTeam,
  awayTeam,
  homeScore = '-',
  awayScore = '-',
  statusState,
  statusLabel = '',
  competition = '',
  details,
}) => {
  const [insights, setInsights] = useState<MatchAiInsightsPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(true);
  const previousHeadlinesRef = useRef<string[]>([]);
  const lastFetchedSignatureRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const matchIdentity = useMemo(
    () => `${homeTeam.trim().toLowerCase()}|${awayTeam.trim().toLowerCase()}|${lang}`,
    [homeTeam, awayTeam, lang]
  );

  const telemetrySignature = useMemo(() => {
    const statsCount = details?.statsByPeriod?.all?.length || details?.stats?.length || 0;
    const eventsCount = details?.events?.length || 0;
    const lastEvent = details?.events?.[eventsCount - 1];
    return `${matchIdentity}|${statusState}|${homeScore}-${awayScore}|${eventsCount}|${
      lastEvent?.clock || ''
    }|${statsCount > 0 ? 'stats' : 'nostats'}`;
  }, [matchIdentity, statusState, homeScore, awayScore, details]);

  const fetchInsights = useCallback(
    async (forceRefresh = false) => {
      if (!homeTeam.trim() || !awayTeam.trim()) return;

      const cacheKey = `${telemetrySignature}`;
      if (!forceRefresh) {
        const cached = INSIGHTS_CACHE.get(cacheKey);
        if (cached && Date.now() - cached.generatedAt < 90_000) {
          setInsights(cached);
          return;
        }
      }

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);

      try {
        const statsSource =
          details?.statsByPeriod?.all?.length
            ? details.statsByPeriod.all
            : details?.stats || [];
        const data = await studioFetch<MatchAiInsightsPayload>('/api/ai/match-insights', {
          method: 'POST',
          signal: ctrl.signal,
          body: JSON.stringify({
            homeTeam,
            awayTeam,
            homeScore,
            awayScore,
            statusState,
            statusLabel,
            competition: details?.tournamentName || competition,
            venue: details?.venue,
            shotsCount: details?.shotsMap?.length || 0,
            stats: statsSource.slice(0, 14).map((s) => ({
              label: s.label,
              homeValue: s.homeValue,
              awayValue: s.awayValue,
            })),
            events: (details?.events || []).slice(-10).map((ev) => ({
              time: ev.clock,
              type: ev.typeLabel || ev.type,
              team: ev.side,
              player: ev.playerName,
              detail: ev.detailText || ev.assistOrSubName,
            })),
            previousHeadlines: forceRefresh ? previousHeadlinesRef.current.slice(-4) : [],
            lang,
          }),
        });

        if (ctrl.signal.aborted) return;
        if (data?.headline) {
          previousHeadlinesRef.current = [
            ...previousHeadlinesRef.current.slice(-4),
            data.headline,
          ];
        }
        INSIGHTS_CACHE.set(cacheKey, data);
        setInsights(data);
        lastFetchedSignatureRef.current = cacheKey;
      } catch {
        if (ctrl.signal.aborted) return;
        const localData = buildClientTelemetryFallback({
          lang,
          homeTeam,
          awayTeam,
          homeScore,
          awayScore,
          statusState,
          statusLabel,
          competition: details?.tournamentName || competition,
          details,
        });
        setInsights(localData);
        lastFetchedSignatureRef.current = cacheKey;
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [
      telemetrySignature,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      statusState,
      statusLabel,
      competition,
      details,
      lang,
    ]
  );

  // Automatic initial fetch & smart updates when score/events arrive
  useEffect(() => {
    if (!homeTeam.trim() || !awayTeam.trim()) return;
    if (lastFetchedSignatureRef.current !== telemetrySignature) {
      void fetchInsights(false);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [telemetrySignature, fetchInsights, homeTeam, awayTeam]);

  // Periodic live tactical refresh every 75s when match is live and auto-update is enabled
  useEffect(() => {
    if (!autoUpdateEnabled || statusState !== 'live') return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void fetchInsights(true);
      }
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoUpdateEnabled, statusState, fetchInsights]);

  const momentumHomePct = useMemo(() => {
    if (!insights?.momentum) return 50;
    const rawIntensity = Math.max(10, Math.min(100, insights.momentum.intensity || 50));
    if (insights.momentum.favoredTeam === 'home') {
      return Math.round(50 + (rawIntensity - 50) * 0.48 + 8);
    }
    if (insights.momentum.favoredTeam === 'away') {
      return Math.round(50 - (rawIntensity - 50) * 0.48 - 8);
    }
    return 50;
  }, [insights]);

  const formattedUpdatedTime = useMemo(() => {
    if (!insights?.generatedAt) return '';
    return new Date(insights.generatedAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [insights?.generatedAt]);

  const isTelemetryEngine = insights?.engineMode === 'telemetry';

  return (
    <section
      aria-label={pickLang(lang, {
        es: 'Estadísticas avanzadas con IA',
        ca: 'Estadístiques avançades amb IA',
        en: 'AI Pro Match Analytics',
      })}
      className="rounded-2xl bg-[#131722] border border-white/[0.08] p-3.5 sm:p-4 space-y-3.5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            {isTelemetryEngine ? (
              <Cpu className="w-4 h-4 text-[#00F593] shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-[#00F593] shrink-0" />
            )}
            <h3 className="font-display font-bold text-sm sm:text-base text-white tracking-tight truncate">
              {pickLang(lang, {
                es: 'Estadísticas IA del Partido',
                ca: 'Estadístiques IA del Partit',
                en: 'AI Match Broadcast Insights',
              })}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
            <span>
              {statusState === 'live'
                ? pickLang(lang, { es: 'Lectura en directo', ca: 'Lectura en directe', en: 'Live feed' })
                : statusState === 'finished'
                ? pickLang(lang, { es: 'Postpartido', ca: 'Postpartit', en: 'Full-time analysis' })
                : pickLang(lang, { es: 'Previa táctica', ca: 'Prèvia tàctica', en: 'Pre-match brief' })}
            </span>
            {isTelemetryEngine && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#00F593]">
                  {pickLang(lang, {
                    es: 'Motor táctico local',
                    ca: 'Motor tàctic local',
                    en: 'Local tactical engine',
                  })}
                </span>
              </>
            )}
            {statusLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-zinc-300">{statusLabel}</span>
              </>
            )}
            {formattedUpdatedTime && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {pickLang(lang, { es: 'Act.', ca: 'Act.', en: 'Upd.' })} {formattedUpdatedTime}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {statusState === 'live' && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setAutoUpdateEnabled((prev) => !prev);
              }}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                autoUpdateEnabled
                  ? 'bg-[#00F593]/12 border-[#00F593]/35 text-[#00F593]'
                  : 'bg-white/[0.04] border-white/[0.1] text-zinc-400 hover:text-white'
              }`}
            >
              {autoUpdateEnabled
                ? pickLang(lang, { es: 'Auto IA', ca: 'Auto IA', en: 'Auto AI' })
                : pickLang(lang, { es: 'Pausado', ca: 'Pausat', en: 'Paused' })}
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              triggerHaptic('light');
              void fetchInsights(true);
            }}
            className="min-h-[36px] px-3 rounded-lg bg-[#9146FF]/18 hover:bg-[#9146FF]/30 border border-[#9146FF]/40 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>
              {pickLang(lang, { es: 'Actualizar', ca: 'Actualitzar', en: 'Refresh' })}
            </span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton on initial boot */}
      {loading && !insights && (
        <div className="space-y-3 py-1" aria-live="polite">
          <div className="h-4 w-3/4 rounded bg-white/[0.07] animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="rounded-xl bg-[#181D2B] border border-white/[0.06] p-3.5 space-y-2"
              >
                <div className="h-3 w-24 rounded bg-white/[0.07] animate-pulse" />
                <div className="h-5 w-32 rounded bg-white/[0.1] animate-pulse" />
                <div className="h-3 w-full rounded bg-white/[0.05] animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Broadcast Analytics Content */}
      {insights && (
        <div className="space-y-3.5">
          {insights.headline && (
            <p className="font-display font-semibold text-sm sm:text-[15px] text-white leading-snug text-balance">
              {insights.headline}
            </p>
          )}

          {/* Momentum Meter */}
          {insights.momentum && (
            <div className="rounded-xl bg-[#181D2B] border border-white/[0.07] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-emerald-400 truncate max-w-[38%]">
                  {homeTeam}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-zinc-300 shrink-0">
                  {pickLang(lang, { es: 'Inercia', ca: 'Inèrcia', en: 'Momentum' })} ·{' '}
                  {insights.momentum.intensity}/100
                </span>
                <span className="font-semibold text-[#BF94FF] truncate max-w-[38%] text-right">
                  {awayTeam}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden flex gap-0.5">
                <div
                  style={{ width: `${Math.max(18, Math.min(82, momentumHomePct))}%` }}
                  className="bg-emerald-400 h-full transition-all duration-500"
                />
                <div
                  style={{ width: `${Math.max(18, Math.min(82, 100 - momentumHomePct))}%` }}
                  className="bg-[#9146FF] h-full transition-all duration-500"
                />
              </div>
              {insights.momentum.summary && (
                <p className="text-[11px] text-zinc-300 leading-snug">
                  {insights.momentum.summary}
                </p>
              )}
            </div>
          )}

          {/* 3-4 Pro Stat Insight Cards */}
          {insights.cards && insights.cards.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.cards.map((card, idx) => {
                const focusTeamName =
                  card.teamFocus === 'home'
                    ? homeTeam
                    : card.teamFocus === 'away'
                    ? awayTeam
                    : pickLang(lang, { es: 'Global', ca: 'Global', en: 'Match' });

                return (
                  <article
                    key={`${card.label}-${idx}`}
                    className="rounded-xl bg-[#181D2B] border border-white/[0.07] p-3.5 flex flex-col justify-between gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                        <span className="font-semibold text-zinc-300 truncate">
                          {card.label}
                        </span>
                        <span className="shrink-0 text-zinc-400">
                          {formatCategoryLabel(card.category, lang)} · {focusTeamName}
                        </span>
                      </div>
                      <div className="font-mono font-bold tabular-nums text-lg sm:text-xl text-white leading-tight">
                        {card.metric}
                      </div>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">{card.insight}</p>
                  </article>
                );
              })}
            </div>
          )}

          {/* Watch Next Callout */}
          {insights.watchNext && (
            <div className="rounded-xl bg-[#151A27] border border-white/[0.08] px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-zinc-200">
              <TrendingUp className="w-4 h-4 text-[#00F593] shrink-0 mt-0.5" />
              <div className="min-w-0 leading-relaxed">
                <span className="font-semibold text-white mr-1.5">
                  {pickLang(lang, {
                    es: 'Qué vigilar:',
                    ca: 'Què vigilar:',
                    en: 'Watch next:',
                  })}
                </span>
                <span className="text-zinc-300">{insights.watchNext}</span>
              </div>
            </div>
          )}

          {insights.sources && insights.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400 pt-0.5">
              <span>{pickLang(lang, { es: 'Fuentes:', ca: 'Fonts:', en: 'Sources:' })}</span>
              {insights.sources.map((src, i) => (
                <a
                  key={i}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#00F593] hover:underline"
                >
                  <span className="max-w-[170px] truncate">{src.title}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
