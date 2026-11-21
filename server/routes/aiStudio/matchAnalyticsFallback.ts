export interface MatchInsightRequestInput {
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: string;
  awayScore?: string;
  statusState?: 'live' | 'upcoming' | 'finished';
  statusLabel?: string;
  competition?: string;
  venue?: string;
  shotsCount?: number;
  stats?: Array<{ label?: string; homeValue?: string; awayValue?: string }>;
  events?: Array<{ time?: string; type?: string; team?: string; player?: string; detail?: string }>;
  lang?: string;
}

export interface TelemetryMatchInsightsResult {
  ok: true;
  engineMode: 'telemetry';
  headline: string;
  momentum: {
    favoredTeam: 'home' | 'away' | 'balanced';
    intensity: number;
    summary: string;
  };
  cards: Array<{
    category: 'tactical' | 'danger' | 'efficiency' | 'trend' | 'projection';
    label: string;
    metric: string;
    teamFocus: 'home' | 'away' | 'both';
    insight: string;
  }>;
  watchNext: string;
  sources: Array<{ title: string; uri: string }>;
  generatedAt: number;
}

function parseNum(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/%/g, '').replace(',', '.').trim();
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function findStat(
  stats: Array<{ label?: string; homeValue?: string; awayValue?: string }>,
  rx: RegExp
): { label: string; homeRaw: string; awayRaw: string; homeNum: number | null; awayNum: number | null } | null {
  for (const s of stats) {
    const label = String(s.label || '').trim();
    if (!label || !rx.test(label)) continue;
    const homeRaw = String(s.homeValue ?? '').trim();
    const awayRaw = String(s.awayValue ?? '').trim();
    return {
      label,
      homeRaw,
      awayRaw,
      homeNum: parseNum(homeRaw),
      awayNum: parseNum(awayRaw),
    };
  }
  return null;
}

function localizedText(
  lang: string | undefined,
  copy: { es: string; ca: string; en: string }
): string {
  if (lang === 'en') return copy.en;
  if (lang === 'ca') return copy.ca;
  return copy.es;
}

export function buildTelemetryMatchInsights(input: MatchInsightRequestInput): TelemetryMatchInsightsResult {
  const lang = input.lang || 'es';
  const homeTeam = String(input.homeTeam || 'Local').trim();
  const awayTeam = String(input.awayTeam || 'Visitante').trim();
  const homeScoreNum = parseNum(input.homeScore);
  const awayScoreNum = parseNum(input.awayScore);
  const hasScore = homeScoreNum !== null && awayScoreNum !== null;
  const statusState =
    input.statusState === 'live' || input.statusState === 'finished' ? input.statusState : 'upcoming';
  const statusLabel = String(input.statusLabel || '').trim();
  const competition = String(input.competition || '').trim();
  const stats = Array.isArray(input.stats) ? input.stats : [];
  const events = Array.isArray(input.events) ? input.events : [];

  const poss = findStat(stats, /pos(es|ses)i[oó]n|possession/i);
  const shots = findStat(stats, /^(remates|tiros|shots)(\s+totales)?$|^total\s+shots$/i) ||
    findStat(stats, /remates|tiros|shots/i);
  const onTarget = findStat(stats, /a\s+puerta|on\s+target|arc[o]?|porter[ií]a/i);
  const xg = findStat(stats, /\bxg\b|goles\s+esperados|expected\s+goals/i);
  const corners = findStat(stats, /c[oó]rner|esquina|corner/i);
  const fouls = findStat(stats, /faltas|fouls/i);
  const cardsStat = findStat(stats, /amarillas|yellow|tarjetas/i);

  let homeWeight = 50;
  if (poss && poss.homeNum !== null && poss.awayNum !== null && poss.homeNum + poss.awayNum > 0) {
    homeWeight = (poss.homeNum / (poss.homeNum + poss.awayNum)) * 100;
  }
  if (shots && shots.homeNum !== null && shots.awayNum !== null && shots.homeNum + shots.awayNum > 0) {
    const shotShare = (shots.homeNum / (shots.homeNum + shots.awayNum)) * 100;
    homeWeight = homeWeight * 0.55 + shotShare * 0.45;
  }
  if (onTarget && onTarget.homeNum !== null && onTarget.awayNum !== null && onTarget.homeNum + onTarget.awayNum > 0) {
    const otShare = (onTarget.homeNum / (onTarget.homeNum + onTarget.awayNum)) * 100;
    homeWeight = homeWeight * 0.7 + otShare * 0.3;
  }
  if (hasScore && homeScoreNum !== awayScoreNum) {
    homeWeight += homeScoreNum! > awayScoreNum! ? 6 : -6;
  }

  const favoredTeam: 'home' | 'away' | 'balanced' =
    homeWeight >= 54 ? 'home' : homeWeight <= 46 ? 'away' : 'balanced';
  const intensity = Math.max(38, Math.min(92, Math.round(52 + Math.abs(homeWeight - 50) * 1.15)));
  const dominantTeamName =
    favoredTeam === 'home' ? homeTeam : favoredTeam === 'away' ? awayTeam : '';

  const goalEvents = events.filter((e) => /gol|goal/i.test(`${e.type || ''} ${e.detail || ''}`));
  const latestEvent = events[events.length - 1];

  let headline = '';
  if (statusState === 'upcoming') {
    headline = localizedText(lang, {
      es: `${homeTeam} vs ${awayTeam}: lectura táctica previa y zonas de control`,
      ca: `${homeTeam} vs ${awayTeam}: lectura tàctica prèvia i zones de control`,
      en: `${homeTeam} vs ${awayTeam}: pre-match tactical breakdown & key zones`,
    });
  } else if (favoredTeam !== 'balanced') {
    headline = localizedText(lang, {
      es: `${dominantTeamName} inclina el ritmo del partido${hasScore ? ` (${homeScoreNum}-${awayScoreNum})` : ''}`,
      ca: `${dominantTeamName} inclina el ritme del partit${hasScore ? ` (${homeScoreNum}-${awayScoreNum})` : ''}`,
      en: `${dominantTeamName} sets the tempo${hasScore ? ` (${homeScoreNum}-${awayScoreNum})` : ''}`,
    });
  } else {
    headline = localizedText(lang, {
      es: `Pulso táctico equilibrado entre ${homeTeam} y ${awayTeam}${statusLabel ? ` · ${statusLabel}` : ''}`,
      ca: `Pols tàctic equilibrat entre ${homeTeam} i ${awayTeam}${statusLabel ? ` · ${statusLabel}` : ''}`,
      en: `Balanced tactical battle between ${homeTeam} and ${awayTeam}${statusLabel ? ` · ${statusLabel}` : ''}`,
    });
  }

  const momentumSummary =
    poss && poss.homeNum !== null && poss.awayNum !== null
      ? localizedText(lang, {
          es: `Control repartido ${poss.homeNum}%-${poss.awayNum}% con ${
            shots && shots.homeNum !== null && shots.awayNum !== null
              ? `${shots.homeNum} vs ${shots.awayNum} remates totales`
              : 'presión alta en campo rival'
          }.`,
          ca: `Control repartit ${poss.homeNum}%-${poss.awayNum}% amb ${
            shots && shots.homeNum !== null && shots.awayNum !== null
              ? `${shots.homeNum} vs ${shots.awayNum} xuts totals`
              : 'pressió alta en camp rival'
          }.`,
          en: `Possession stands at ${poss.homeNum}%-${poss.awayNum}% with ${
            shots && shots.homeNum !== null && shots.awayNum !== null
              ? `${shots.homeNum} vs ${shots.awayNum} total shots`
              : 'high territorial pressure'
          }.`,
        })
      : hasScore && homeScoreNum !== awayScoreNum
      ? localizedText(lang, {
          es: `${homeScoreNum! > awayScoreNum! ? homeTeam : awayTeam} administra ventaja mientras ${
            homeScoreNum! > awayScoreNum! ? awayTeam : homeTeam
          } acelera líneas en transición.`,
          ca: `${homeScoreNum! > awayScoreNum! ? homeTeam : awayTeam} administra avantatge mentre ${
            homeScoreNum! > awayScoreNum! ? awayTeam : homeTeam
          } accelera línies en transició.`,
          en: `${homeScoreNum! > awayScoreNum! ? homeTeam : awayTeam} manages the lead while ${
            homeScoreNum! > awayScoreNum! ? awayTeam : homeTeam
          } pushes numbers forward.`,
        })
      : localizedText(lang, {
          es: 'Bloques compactos en zona media esperando rupturas al espacio y juego exterior.',
          ca: 'Blocs compactes a zona mitjana esperant ruptures a l’espai i joc exterior.',
          en: 'Compact midfield blocks waiting for line-breaking passes and wide overloads.',
        });

  const cards: TelemetryMatchInsightsResult['cards'] = [];

  if (poss && poss.homeNum !== null && poss.awayNum !== null) {
    const focus: 'home' | 'away' | 'both' =
      poss.homeNum >= poss.awayNum + 6 ? 'home' : poss.awayNum >= poss.homeNum + 6 ? 'away' : 'both';
    cards.push({
      category: 'tactical',
      label: localizedText(lang, { es: 'Dominio del balón', ca: 'Domini de la pilota', en: 'Ball control' }),
      metric: `${poss.homeNum}% · ${poss.awayNum}%`,
      teamFocus: focus,
      insight: localizedText(lang, {
        es:
          focus === 'both'
            ? 'Alternancia constante en la salida; ninguno logra someter largos tramos al rival.'
            : `${focus === 'home' ? homeTeam : awayTeam} monopoliza la circulación para hundir al bloque rival.`,
        ca:
          focus === 'both'
            ? 'Alternança constant en la sortida; cap dels dos sotmet llargs trams al rival.'
            : `${focus === 'home' ? homeTeam : awayTeam} monopolitza la circulació per enfonsar el bloc rival.`,
        en:
          focus === 'both'
            ? 'Shared build-up phase with neither side pinning the opponent back for long spells.'
            : `${focus === 'home' ? homeTeam : awayTeam} dictates tempo through sustained possession spells.`,
      }),
    });
  }

  if (shots && shots.homeNum !== null && shots.awayNum !== null) {
    const hOt = onTarget?.homeNum ?? null;
    const aOt = onTarget?.awayNum ?? null;
    const focus: 'home' | 'away' | 'both' =
      shots.homeNum > shots.awayNum + 1 ? 'home' : shots.awayNum > shots.homeNum + 1 ? 'away' : 'both';
    cards.push({
      category: 'danger',
      label: localizedText(lang, { es: 'Volumen ofensivo', ca: 'Volum ofensiu', en: 'Attacking volume' }),
      metric:
        hOt !== null && aOt !== null
          ? `${shots.homeNum} (${hOt}) vs ${shots.awayNum} (${aOt})`
          : `${shots.homeNum} vs ${shots.awayNum}`,
      teamFocus: focus,
      insight: localizedText(lang, {
        es:
          hOt !== null && aOt !== null
            ? `Puntería entre tres palos: ${hOt} de ${homeTeam} y ${aOt} de ${awayTeam}${xg ? ` · xG ${xg.homeRaw}-${xg.awayRaw}` : ''}.`
            : `${homeTeam} suma ${shots.homeNum} finalizaciones frente a ${shots.awayNum} de ${awayTeam}.`,
        ca:
          hOt !== null && aOt !== null
            ? `Punteria entre els tres pals: ${hOt} de ${homeTeam} i ${aOt} de ${awayTeam}${xg ? ` · xG ${xg.homeRaw}-${xg.awayRaw}` : ''}.`
            : `${homeTeam} suma ${shots.homeNum} rematades davant ${shots.awayNum} de ${awayTeam}.`,
        en:
          hOt !== null && aOt !== null
            ? `Shots on target: ${hOt} for ${homeTeam} vs ${aOt} for ${awayTeam}${xg ? ` · xG ${xg.homeRaw}-${xg.awayRaw}` : ''}.`
            : `${homeTeam} has registered ${shots.homeNum} attempts compared to ${shots.awayNum} from ${awayTeam}.`,
      }),
    });
  }

  if (xg && xg.homeNum !== null && xg.awayNum !== null && !shots) {
    cards.push({
      category: 'efficiency',
      label: localizedText(lang, { es: 'Calidad de ocasión', ca: 'Qualitat d’ocasió', en: 'Chance quality' }),
      metric: `${xg.homeRaw} vs ${xg.awayRaw} xG`,
      teamFocus: xg.homeNum > xg.awayNum ? 'home' : xg.awayNum > xg.homeNum ? 'away' : 'both',
      insight: localizedText(lang, {
        es: 'Índice de goles esperados calculado según ubicación y claridad de cada disparo.',
        ca: 'Índex de gols esperats calculat segons ubicació i claredat de cada xut.',
        en: 'Expected goals value reflects shot location and defensive pressure.',
      }),
    });
  }

  if (corners && corners.homeNum !== null && corners.awayNum !== null) {
    const focus: 'home' | 'away' | 'both' =
      corners.homeNum > corners.awayNum + 1 ? 'home' : corners.awayNum > corners.homeNum + 1 ? 'away' : 'both';
    cards.push({
      category: 'trend',
      label: localizedText(lang, { es: 'Balón parado y banda', ca: 'Pilota aturada i banda', en: 'Set-piece threat' }),
      metric: `${corners.homeNum} - ${corners.awayNum} Córners`,
      teamFocus: focus,
      insight: localizedText(lang, {
        es: 'La carga por bandas está generando segundas jugadas y saques de esquina en campo contrario.',
        ca: 'La càrrega per bandes genera segones jugades i serveis de cantonada en camp contrari.',
        en: 'Wide overloads are producing corners and second-ball danger around the box.',
      }),
    });
  }

  if (latestEvent || goalEvents.length > 0) {
    const targetEv = goalEvents[goalEvents.length - 1] || latestEvent;
    cards.push({
      category: 'efficiency',
      label: localizedText(lang, { es: 'Último punto de giro', ca: 'Últim punt de gir', en: 'Key turning point' }),
      metric: `${targetEv.time || statusLabel || 'En vivo'}`,
      teamFocus: targetEv.team === 'home' ? 'home' : targetEv.team === 'away' ? 'away' : 'both',
      insight: localizedText(lang, {
        es: `${targetEv.type || 'Acción clave'}${targetEv.player ? ` · ${targetEv.player}` : ''}${targetEv.detail ? ` (${targetEv.detail})` : ''}.`,
        ca: `${targetEv.type || 'Acció clau'}${targetEv.player ? ` · ${targetEv.player}` : ''}${targetEv.detail ? ` (${targetEv.detail})` : ''}.`,
        en: `${targetEv.type || 'Key action'}${targetEv.player ? ` · ${targetEv.player}` : ''}${targetEv.detail ? ` (${targetEv.detail})` : ''}.`,
      }),
    });
  }

  if (fouls && fouls.homeNum !== null && fouls.awayNum !== null && cards.length < 4) {
    cards.push({
      category: 'projection',
      label: localizedText(lang, { es: 'Fricción y faltas', ca: 'Fricció i faltes', en: 'Physical intensity' }),
      metric: `${fouls.homeNum} vs ${fouls.awayNum}${
        cardsStat && cardsStat.homeNum !== null && cardsStat.awayNum !== null
          ? ` · ${cardsStat.homeNum}/${cardsStat.awayNum} TA`
          : ''
      }`,
      teamFocus: fouls.homeNum > fouls.awayNum + 2 ? 'home' : fouls.awayNum > fouls.homeNum + 2 ? 'away' : 'both',
      insight: localizedText(lang, {
        es: 'El ritmo de interrupciones en mediocampo marca el margen de tarjetas y faltas tácticas.',
        ca: 'El ritme d’interrupcions al mig del camp marca el marge de targetes i faltes tàctiques.',
        en: 'Midfield duel intensity dictates tactical fouls and card risk.',
      }),
    });
  }

  // Ensure at least 3 rich cards even on pre-match or minimal telemetry feeds
  if (cards.length < 3) {
    cards.push({
      category: 'tactical',
      label: localizedText(lang, { es: 'Escenario del marcador', ca: 'Escenari del marcador', en: 'Scoreline state' }),
      metric: hasScore ? `${homeScoreNum} - ${awayScoreNum}` : statusLabel || (competition || 'Directo'),
      teamFocus: favoredTeam === 'balanced' ? 'both' : favoredTeam,
      insight: localizedText(lang, {
        es:
          statusState === 'upcoming'
            ? `Duelo ${competition ? `de ${competition} ` : ''}con foco en la presión tras pérdida durante los primeros 15 minutos.`
            : hasScore && homeScoreNum === awayScoreNum
            ? 'Igualdad en el marcador: el primer equipo que rompa entre líneas tomará ventaja psicológica.'
            : 'La ventaja obliga al rival a adelantar centrales, abriendo carriles para transiciones verticales.',
        ca:
          statusState === 'upcoming'
            ? `Duel ${competition ? `de ${competition} ` : ''}amb focus en la pressió rere pèrdua als primers 15 minuts.`
            : hasScore && homeScoreNum === awayScoreNum
            ? 'Igualtat al marcador: el primer equip que trenqui entre línies prendrà avantatge psicològic.'
            : 'L’avantatge obliga el rival a avançar centrals, obrint carrils per a transicions verticals.',
        en:
          statusState === 'upcoming'
            ? `Key opening 15-minute duel will hinge on counter-pressing efficiency and midfield spacing.`
            : hasScore && homeScoreNum === awayScoreNum
            ? 'Level scoreline increases value of half-space combinations and fresh bench legs.'
            : 'Trailing side pushing its back line creates direct counter-attacking lanes.',
      }),
    });
  }

  if (cards.length < 3) {
    cards.push({
      category: 'projection',
      label: localizedText(lang, { es: 'Lectura de ritmo', ca: 'Lectura de ritme', en: 'Tempo projection' }),
      metric: statusLabel || `${intensity}/100`,
      teamFocus: favoredTeam === 'balanced' ? 'both' : favoredTeam,
      insight: localizedText(lang, {
        es:
          typeof input.shotsCount === 'number' && input.shotsCount > 0
            ? `${input.shotsCount} secuencias de tiro geolocalizadas ayudan a detectar la banda de mayor peligro.`
            : 'Las bandas y la profundidad de los laterales serán determinantes para generar superioridades.',
        ca:
          typeof input.shotsCount === 'number' && input.shotsCount > 0
            ? `${input.shotsCount} seqüències de xut geolocalitzades detecten la banda de més perill.`
            : 'Les bandes i la profunditat dels laterals seran determinants per generar superioritats.',
        en:
          typeof input.shotsCount === 'number' && input.shotsCount > 0
            ? `${input.shotsCount} tracked shot sequences highlight the highest-threat attacking corridors.`
            : 'Full-back overlaps and wide half-space runs remain the primary route to unlock the box.',
      }),
    });
  }

  const watchNext =
    hasScore && homeScoreNum !== awayScoreNum
      ? localizedText(lang, {
          es: `Vigila los espacios a la espalda de los laterales de ${
            homeScoreNum! > awayScoreNum! ? awayTeam : homeTeam
          } si adelanta líneas en busca del empate.`,
          ca: `Vigila els espais a l’esquena dels laterals de ${
            homeScoreNum! > awayScoreNum! ? awayTeam : homeTeam
          } si avança línies cercant l’empat.`,
          en: `Watch the space behind ${
            homeScoreNum! > awayScoreNum! ? awayTeam : homeTeam
          }'s full-backs as they push higher chasing an equalizer.`,
        })
      : localizedText(lang, {
          es: `Observa quién gana las segundas jugadas en la frontal del área y los cambios de ritmo por banda.`,
          ca: `Observa qui guanya les segones jugades a la frontal de l’àrea i els canvis de ritme per banda.`,
          en: `Watch second-ball recoveries at the edge of the box and wing switches in the next 15 minutes.`,
        });

  return {
    ok: true,
    engineMode: 'telemetry',
    headline,
    momentum: {
      favoredTeam,
      intensity,
      summary: momentumSummary,
    },
    cards: cards.slice(0, 4),
    watchNext,
    sources: [],
    generatedAt: Date.now(),
  };
}
