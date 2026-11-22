import type { Express, Request, Response } from 'express';
import { Type } from '@google/genai';
import {
  generateContentWithResilience,
  getGenAiClient,
  isAiFallbackEligibleError,
  parseGeminiJson,
  sendAiEndpointError,
} from './shared.ts';

function resolveChatLangLabel(lang?: string): string {
  if (lang === 'en') return 'English';
  if (lang === 'ca') return 'Catalan';
  if (lang === 'zh') return 'Simplified Chinese';
  return 'Spanish';
}

const VALID_PHASES = new Set([
  'dangerous_attack',
  'attack',
  'possession',
  'counter',
  'corner',
  'free_kick',
  'shot_threat',
  'goal_kick',
]);

const VALID_ZONES = new Set([
  'home_box',
  'home_third',
  'midfield',
  'away_third',
  'away_box',
]);

const VALID_CAMERAS = new Set([
  'wide_tactical',
  'attacking_third',
  'box_closeup',
  'replay_or_studio',
]);

export function registerTacticalVisionRoute(app: Express): void {
  app.post('/api/ai/tactical-vision', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        imageBase64?: string;
        mimeType?: string;
        homeTeam?: string;
        awayTeam?: string;
        homeShort?: string;
        awayShort?: string;
        homeScore?: string;
        awayScore?: string;
        statusLabel?: string;
        competition?: string;
        homeColor?: string;
        awayColor?: string;
        homeRoster?: Array<{ jersey?: string; name?: string; shortName?: string; position?: string }>;
        awayRoster?: Array<{ jersey?: string; name?: string; shortName?: string; position?: string }>;
        liveStats?: Array<{ label?: string; homeValue?: string; awayValue?: string }>;
        lang?: string;
      };

      let rawBase64 = String(body.imageBase64 || '').trim();
      let mimeType = String(body.mimeType || 'image/jpeg').trim().toLowerCase();
      const dataUrlMatch = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(rawBase64);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataUrlMatch[1].toLowerCase();
        rawBase64 = dataUrlMatch[2];
      }
      if (!rawBase64 || rawBase64.length < 120) {
        res.status(400).json({ ok: false, error: 'Se requiere un fotograma válido del partido.' });
        return;
      }
      if (rawBase64.length > 3_500_000) {
        res.status(400).json({ ok: false, error: 'El fotograma excede el tamaño máximo permitido.' });
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        mimeType = 'image/jpeg';
      }

      const langLabel = resolveChatLangLabel(body.lang);
      const homeTeam = String(body.homeTeam || 'Local').trim();
      const awayTeam = String(body.awayTeam || 'Visitante').trim();
      const homeShort = String(body.homeShort || homeTeam.slice(0, 3).toUpperCase()).trim();
      const awayShort = String(body.awayShort || awayTeam.slice(0, 3).toUpperCase()).trim();
      const homeScore = String(body.homeScore ?? '-').trim();
      const awayScore = String(body.awayScore ?? '-').trim();
      const statusLabel = String(body.statusLabel || '').trim();
      const competition = String(body.competition || '').trim();

      const formatRoster = (
        list?: Array<{ jersey?: string; name?: string; shortName?: string; position?: string }>
      ) =>
        (Array.isArray(list) ? list : [])
          .slice(0, 11)
          .map((p) => {
            const num = String(p.jersey || '').trim();
            const pname = String(p.shortName || p.name || '').trim();
            const pos = String(p.position || '').trim();
            return [num ? `#${num}` : '', pname, pos ? `(${pos})` : ''].filter(Boolean).join(' ');
          })
          .filter(Boolean)
          .join(', ');

      const homeRosterText = formatRoster(body.homeRoster);
      const awayRosterText = formatRoster(body.awayRoster);
      const statsText = (Array.isArray(body.liveStats) ? body.liveStats : [])
        .slice(0, 8)
        .map((s) => `${String(s.label || '').trim()}: ${String(s.homeValue || '-')} vs ${String(s.awayValue || '-')}`)
        .filter(Boolean)
        .join(' · ');

      const promptParts = [
        `Analiza este fotograma real de fútbol: ${homeTeam} (${homeShort}, LOCAL) vs ${awayTeam} (${awayShort}, VISITANTE).`,
        competition ? `Competición: ${competition}` : '',
        statusLabel ? `Minuto/Estado API: ${statusLabel} · Marcador ${homeScore}-${awayScore}` : '',
        body.homeColor ? `Color oficial local: ${body.homeColor}` : '',
        body.awayColor ? `Color oficial visitante: ${body.awayColor}` : '',
        homeRosterText ? `XI Local (${homeShort}): ${homeRosterText}` : '',
        awayRosterText ? `XI Visitante (${awayShort}): ${awayRosterText}` : '',
        statsText ? `Estadísticas en vivo de referencia: ${statsText}` : '',
        `Reglas CRÍTICAS de precisión espacial y sincronización (sistema tipo Bet365 / Opta Live Tracker):`,
        `1. Lee el reloj visible en el marcador de TV (arriba izquierda/derecha) y devuélvelo en tvClock (ej. "59:59"). Si no se ve claro, deja "".`,
        `2. Determina hacia qué lado ataca ${homeShort} (LOCAL) en la imagen de TV en esta parte: si es 2ª parte o el portero local está a la derecha, homeAttacksRightToLeftOnTv=true.`,
        `3. Proyecta SIEMPRE sobre el CAMPO COMPLETO 2D canónico (x=0 portería que defiende ${homeShort}, x=500 mediocampo, x=1000 portería que defiende ${awayShort}; y=0 banda superior, y=1000 banda inferior).`,
        `4. Identifica qué color real de camiseta ves en cada equipo (observedHomeKitColor / observedAwayKitColor) y fíjate en QUIÉN lleva el balón o presiona en la jugada actual para fijar attackDirection ("home", "away" o "neutral") y possession.team.`,
        `5. Si es primer plano de un jugador conduciendo o plano corto, sigue identificando por el color de camiseta qué equipo lleva el balón y su tercio probable; marca isMatchPitchVisible=false si no se ven líneas de campo.`,
        `6. Indica altura táctica del bloque (homeLineHeight 0..100; awayLineHeight 0..100).`,
        `7. Todos los textos en ${langLabel}.`,
      ]
        .filter(Boolean)
        .join('\n');

      const ai = getGenAiClient();
      const visionResponse = await generateContentWithResilience(ai, {
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType, data: rawBase64 } },
            { text: promptParts },
          ],
        },
        config: {
          systemInstruction: `Eres el motor de visión táctica en tiempo real estilo Bet365 / Opta Live Match Tracker para RiffanTV. Proyectas la acción de un fotograma de TV sobre un campo 2D completo de 105x68m (x=0 portería local, x=1000 portería visitante). Devuelve exclusivamente JSON válido en ${langLabel}.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isMatchPitchVisible: { type: Type.BOOLEAN },
              cameraAngle: {
                type: Type.STRING,
                description: 'wide_tactical, attacking_third, box_closeup o replay_or_studio.',
              },
              tvClock: {
                type: Type.STRING,
                description: 'Reloj exacto visible en el marcador TV (ej. 59:59) o cadena vacía si no se distingue.',
              },
              homeAttacksRightToLeftOnTv: {
                type: Type.BOOLEAN,
                description: 'true si el equipo local ataca de derecha a izquierda en pantalla TV (típico 2ª parte).',
              },
              homeKitColor: { type: Type.STRING },
              awayKitColor: { type: Type.STRING },
              observedHomeKitColor: {
                type: Type.STRING,
                description: 'Hex exacto (#RRGGBB) de la camiseta real que lleva el equipo local en la imagen TV.',
              },
              observedAwayKitColor: {
                type: Type.STRING,
                description: 'Hex exacto (#RRGGBB) de la camiseta real que lleva el equipo visitante en la imagen TV.',
              },
              ballPitch: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.INTEGER, description: '0 (portería local) .. 1000 (portería visitante).' },
                  y: { type: Type.INTEGER, description: '0 (banda superior) .. 1000 (banda inferior).' },
                },
                required: ['x', 'y'],
              },
              attackDirection: { type: Type.STRING, description: 'home, away o neutral.' },
              attackIntensity: { type: Type.INTEGER, description: '0..100 intensidad de peligro/empuje actual.' },
              dangerZone: {
                type: Type.STRING,
                description: 'home_box, home_third, midfield, away_third o away_box.',
              },
              phaseType: {
                type: Type.STRING,
                description: 'dangerous_attack, attack, possession, counter, corner, free_kick, shot_threat o goal_kick.',
              },
              homeLineHeight: { type: Type.INTEGER, description: '15..85 altura del bloque local hacia la portería rival.' },
              awayLineHeight: { type: Type.INTEGER, description: '15..85 altura del bloque visitante hacia la portería rival.' },
              possession: {
                type: Type.OBJECT,
                properties: {
                  team: { type: Type.STRING, description: 'home, away o contested.' },
                  homePct: { type: Type.INTEGER },
                  awayPct: { type: Type.INTEGER },
                  zoneLabel: { type: Type.STRING },
                  summary: { type: Type.STRING },
                },
                required: ['team', 'homePct', 'awayPct', 'zoneLabel', 'summary'],
              },
              attacksSummary: {
                type: Type.OBJECT,
                properties: {
                  homeAttacks: { type: Type.INTEGER },
                  awayAttacks: { type: Type.INTEGER },
                  homeDangerousAttacks: { type: Type.INTEGER },
                  awayDangerousAttacks: { type: Type.INTEGER },
                  phaseLabel: { type: Type.STRING },
                },
                required: ['homeAttacks', 'awayAttacks', 'phaseLabel'],
              },
              tacticalNote: { type: Type.STRING },
            },
            required: [
              'isMatchPitchVisible',
              'cameraAngle',
              'homeKitColor',
              'awayKitColor',
              'ballPitch',
              'attackDirection',
              'attackIntensity',
              'dangerZone',
              'phaseType',
              'possession',
              'attacksSummary',
              'tacticalNote',
            ],
          },
        },
      });

      const clampCoord = (val: unknown, min = 40, max = 960) =>
        Math.max(min, Math.min(max, Math.round(Number(val) || 500)));
      const normalizeHex = (val: unknown, fallback: string) => {
        const raw = String(val || '').trim();
        return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
      };

      const parsed = parseGeminiJson<Record<string, any>>(String(visionResponse.text || '{}'), {});
      const rawTvClock = String(parsed.tvClock || '').trim();
      const cleanTvClock = /^\d{1,3}:\d{2}$/.test(rawTvClock) || /^\d{1,3}(?:\+\d{1,2})?'$/.test(rawTvClock)
        ? rawTvClock
        : undefined;
      const ballX = clampCoord(parsed.ballPitch?.x, 30, 970);
      const ballY = clampCoord(parsed.ballPitch?.y, 60, 940);
      const attackDirection: 'home' | 'away' | 'neutral' =
        parsed.attackDirection === 'home' || parsed.attackDirection === 'away'
          ? parsed.attackDirection
          : 'neutral';
      const attackIntensity = Math.max(0, Math.min(100, Math.round(Number(parsed.attackIntensity) || 42)));
      const homePctRaw = Math.max(15, Math.min(85, Math.round(Number(parsed.possession?.homePct) || 50)));

      const dangerZone = VALID_ZONES.has(parsed.dangerZone)
        ? parsed.dangerZone
        : ballX > 820
          ? 'away_box'
          : ballX > 620
            ? 'away_third'
            : ballX < 180
              ? 'home_box'
              : ballX < 380
                ? 'home_third'
                : 'midfield';

      const phaseType = VALID_PHASES.has(parsed.phaseType) ? parsed.phaseType : 'possession';
      const cameraAngle = VALID_CAMERAS.has(parsed.cameraAngle) ? parsed.cameraAngle : 'wide_tactical';

      const atkTargetX = attackDirection === 'home' ? Math.min(965, ballX + 165) : Math.max(35, ballX - 165);
      const attacks =
        attackDirection === 'neutral'
          ? []
          : [
              {
                id: 'gem-atk-1',
                team: attackDirection,
                fromX: ballX,
                fromY: ballY,
                toX: atkTargetX,
                toY: Math.max(180, Math.min(820, ballY < 500 ? ballY + 55 : ballY - 55)),
                type:
                  phaseType === 'shot_threat' || dangerZone === 'home_box' || dangerZone === 'away_box'
                    ? ('shot_threat' as const)
                    : ballY < 300 || ballY > 700
                      ? ('wing_attack' as const)
                      : phaseType === 'counter'
                        ? ('counter' as const)
                        : ('through_ball' as const),
                label: String(parsed.attacksSummary?.phaseLabel || '').trim().slice(0, 32),
              },
            ];

      res.json({
        ok: true,
        engineMode: 'gemini',
        analysis: {
          engineMode: 'gemini',
          isMatchPitchVisible: Boolean(parsed.isMatchPitchVisible),
          cameraAngle,
          tvClock: cleanTvClock,
          homeAttacksRightToLeftOnTv:
            typeof parsed.homeAttacksRightToLeftOnTv === 'boolean'
              ? parsed.homeAttacksRightToLeftOnTv
              : undefined,
          homeKitColor: normalizeHex(parsed.homeKitColor, body.homeColor || '#00F593'),
          awayKitColor: normalizeHex(parsed.awayKitColor, body.awayColor || '#9146FF'),
          observedHomeKitHex: normalizeHex(parsed.observedHomeKitColor, body.homeColor || '#00F593'),
          observedAwayKitHex: normalizeHex(parsed.observedAwayKitColor, body.awayColor || '#9146FF'),
          ballZone: { x: ballX, y: ballY },
          attackDirection,
          attackIntensity,
          dangerZone,
          phaseType,
          homeLineHeight: Math.max(20, Math.min(82, Math.round(Number(parsed.homeLineHeight) || 48))),
          awayLineHeight: Math.max(20, Math.min(82, Math.round(Number(parsed.awayLineHeight) || 48))),
          possession: {
            team:
              parsed.possession?.team === 'home' || parsed.possession?.team === 'away'
                ? parsed.possession.team
                : 'contested',
            homePct: homePctRaw,
            awayPct: 100 - homePctRaw,
            zoneLabel: String(parsed.possession?.zoneLabel || '').trim(),
            summary: String(parsed.possession?.summary || '').trim(),
          },
          players: [],
          passingLines: [],
          attacks,
          attacksSummary: {
            homeAttacks: Math.max(0, Math.round(Number(parsed.attacksSummary?.homeAttacks) || 0)),
            awayAttacks: Math.max(0, Math.round(Number(parsed.attacksSummary?.awayAttacks) || 0)),
            homeDangerousAttacks: Math.max(
              0,
              Math.round(Number(parsed.attacksSummary?.homeDangerousAttacks) || 0)
            ),
            awayDangerousAttacks: Math.max(
              0,
              Math.round(Number(parsed.attacksSummary?.awayDangerousAttacks) || 0)
            ),
            phaseLabel: String(parsed.attacksSummary?.phaseLabel || '').trim(),
          },
          tacticalNote: String(parsed.tacticalNote || '').trim(),
        },
        analyzedAt: Date.now(),
      });
    } catch (err) {
      if (isAiFallbackEligibleError(err)) {
        res.json({
          ok: true,
          engineMode: 'use_local_optical',
          fallbackSuggested: true,
          retryAfterMs: 65_000,
        });
        return;
      }
      sendAiEndpointError(res, 'ai_tactical_vision', err);
    }
  });
}
