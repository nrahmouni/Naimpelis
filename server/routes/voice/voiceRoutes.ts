import type { Express, Request, Response } from 'express';
import type { SpanishTdtChannel, WatchHistoryItem } from '../../../src/types.ts';
import { logger } from '../../utils/logger.ts';
import type {
  RegisterVoiceAssistantDeps,
  VoiceAssistantCandidateItem,
  VoiceChatHistoryTurn,
} from './types.ts';
import { detectOrdinalSelection, normalizeSearchStr } from './parsers.ts';
import { getGeminiClient, parseIntentWithGemini } from './geminiPlanner.ts';
import { searchMusicCatalog } from '../../services/riffanMusicService.ts';
import { findUpcomingMatchInFotmob, resolveTmdbRecommendations } from './tmdbSearch.ts';

export function matchChannelsByKeywords(
  channels: Array<SpanishTdtChannel & { logoUrl?: string }>,
  keywords: string[],
  categoryHint: string,
  limit = 8
): Array<SpanishTdtChannel & { logoUrl?: string }> {
  const compiledKeywords = keywords
    .map((k) => normalizeSearchStr(k))
    .filter((k) => k.length >= 2)
    .map((kw) => ({
      kw,
      regex: new RegExp(`(?:^|\\s)${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`),
    }));
  const hintNorm = normalizeSearchStr(categoryHint);

  const scored: Array<{ ch: SpanishTdtChannel & { logoUrl?: string }; score: number }> = [];

  for (const ch of channels) {
    const chNameNorm = normalizeSearchStr(ch.name);
    const chMetaHaystack = normalizeSearchStr(
      `${ch.name} ${ch.shortMark || ''} ${ch.network || ''} ${ch.category || ''}`
    );
    let score = 0;

    if (hintNorm && ch.category) {
      const chCatNorm = normalizeSearchStr(ch.category);
      if (chCatNorm === hintNorm || chCatNorm.includes(hintNorm)) {
        score += 25;
      }
    }

    for (const { kw, regex } of compiledKeywords) {
      if (chNameNorm === kw) {
        score += 65;
      } else if (regex.test(chNameNorm)) {
        score += 42;
      } else if (regex.test(chMetaHaystack)) {
        score += 22;
      }
    }

    if (score > 0) {
      scored.push({ ch, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.ch);
}

export function registerVoiceAssistantRoutes(app: Express, deps: RegisterVoiceAssistantDeps): void {
  app.post('/api/ai/voice-assistant', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        query?: unknown;
        userName?: unknown;
        lang?: unknown;
        previousItems?: unknown;
        watchHistory?: unknown;
        history?: unknown;
        activeMediaTitle?: unknown;
      };

      const query = String(body.query || '').trim().slice(0, 600);
      const userName = String(body.userName || '').trim().slice(0, 40) || 'amigo';
      const lang = String(body.lang || 'es').toLowerCase().slice(0, 2);
      const previousItems = Array.isArray(body.previousItems)
        ? (body.previousItems as VoiceAssistantCandidateItem[])
        : [];
      const watchHistory = Array.isArray(body.watchHistory)
        ? (body.watchHistory as WatchHistoryItem[])
        : [];
      const history: VoiceChatHistoryTurn[] = Array.isArray(body.history)
        ? body.history
            .filter(
              (h): h is VoiceChatHistoryTurn =>
                Boolean(h) &&
                typeof h === 'object' &&
                (h.role === 'user' || h.role === 'assistant') &&
                typeof h.text === 'string'
            )
            .slice(-10)
        : [];
      const activeMediaTitle = String(body.activeMediaTitle || '').trim().slice(0, 140);

      if (!query) {
        return res.json({
          success: true,
          intent: 'chat',
          autoPlay: false,
          spokenReply:
            lang === 'en'
              ? `Hi ${userName}, how can I help you today?`
              : lang === 'ca'
              ? `Hola ${userName}, com et puc ajudar avui?`
              : lang === 'zh'
              ? `你好 ${userName}，今天有什么我可以帮你的吗？`
              : `Hola ${userName}, ¿qué te apetece hacer o hablar hoy?`,
          items: [],
        });
      }

      const ordinalIdx = detectOrdinalSelection(query);
      if (ordinalIdx !== null && previousItems[ordinalIdx]) {
        const chosen = previousItems[ordinalIdx];
        return res.json({
          success: true,
          intent: 'select_ordinal',
          autoPlay: true,
          spokenReply:
            lang === 'en'
              ? `Playing ${chosen.title} now.`
              : lang === 'ca'
              ? `Posant ${chosen.title} ara mateix.`
              : lang === 'zh'
              ? `正在为你播放 ${chosen.title}。`
              : `Te pongo ${chosen.title} ahora mismo.`,
          items: [chosen],
        });
      }

      const norm = normalizeSearchStr(query);

      const isHistoryResumeRequest =
        /\b(ultima serie|ultimo capitulo|ultima peli|ultima pelicula|continuar|seguir viendo|lo ultimo que estaba viendo|donde lo deje|retomar|la serie que estaba viendo)\b/i.test(
          norm
        );
      if (isHistoryResumeRequest) {
        let matchedHistoryItem: WatchHistoryItem | undefined;
        if (/\b(serie|capitulo)\b/i.test(norm)) {
          matchedHistoryItem = watchHistory.find((h) => h.mediaType === 'tv') || watchHistory[0];
        } else if (/\b(peli|pelicula)\b/i.test(norm)) {
          matchedHistoryItem = watchHistory.find((h) => h.mediaType === 'movie') || watchHistory[0];
        } else {
          matchedHistoryItem = watchHistory[0];
        }

        if (matchedHistoryItem) {
          const epStr =
            matchedHistoryItem.season && matchedHistoryItem.episode
              ? ` (Temporada ${matchedHistoryItem.season}, Capítulo ${matchedHistoryItem.episode})`
              : '';
          const reply =
            lang === 'en'
              ? `Resuming ${matchedHistoryItem.title}${epStr} right where you left off!`
              : lang === 'ca'
              ? `Reprenem ${matchedHistoryItem.title}${epStr} per on anaves!`
              : lang === 'zh'
              ? `正在从你上次看到的地方继续播放 ${matchedHistoryItem.title}！`
              : `¡Retomamos ${matchedHistoryItem.title}${epStr} por donde ibas!`;

          return res.json({
            success: true,
            intent: matchedHistoryItem.mediaType === 'tv' ? 'play_series' : 'play_movie',
            autoPlay: true,
            spokenReply: reply,
            items: [
              {
                kind: matchedHistoryItem.mediaType === 'tv' ? 'series' : 'movie',
                id: matchedHistoryItem.id,
                title: matchedHistoryItem.title,
                subtitle:
                  matchedHistoryItem.subtitle ||
                  (matchedHistoryItem.mediaType === 'tv'
                    ? `Temporada ${matchedHistoryItem.season || 1} · Capítulo ${matchedHistoryItem.episode || 1}`
                    : 'Película'),
                imageUrl: matchedHistoryItem.poster || matchedHistoryItem.backdrop,
                badge: matchedHistoryItem.mediaType === 'tv' ? 'SERIE' : 'CINE',
                targetSeason: matchedHistoryItem.season || 1,
                targetEpisode: matchedHistoryItem.episode || 1,
                media: {
                  id: matchedHistoryItem.id,
                  title: matchedHistoryItem.title,
                  originalTitle: matchedHistoryItem.title,
                  year: matchedHistoryItem.year || '',
                  rating: '8.0',
                  overview: '',
                  poster: matchedHistoryItem.poster || '',
                  backdrop: matchedHistoryItem.backdrop || '',
                  languages: ['ES', 'LAT', 'VOSE', 'EN'],
                  mediaType: matchedHistoryItem.mediaType,
                  tmdbId: matchedHistoryItem.tmdbId,
                  seasonNumber: matchedHistoryItem.season || 1,
                },
              },
            ],
          });
        } else {
          const noHistoryMsg =
            lang === 'en'
              ? `You don't have recent playback history yet. What would you like to watch?`
              : lang === 'ca'
              ? `Encara no tens historial recent. Què et ve de gust començar a veure?`
              : lang === 'zh'
              ? `你还没有最近的观看记录。想看点什么吗？`
              : `Aún no tienes nada en tu historial reciente. Dime qué te apetece ver y te lo pongo al momento.`;
          return res.json({
            success: true,
            intent: 'chat',
            autoPlay: false,
            spokenReply: noHistoryMsg,
            items: [],
          });
        }
      }

      const isScheduleAsk =
        /\b(cuando juega|a que hora juega|que dia juega|proximo partido|siguiente partido|partido del barca|partido del madrid|cuando es el partido)\b/i.test(
          norm
        );
      if (isScheduleAsk || (/\b(cuando|hora|dia)\b/i.test(norm) && /\b(barca|barcelona|madrid|champions|laliga)\b/i.test(norm))) {
        const upcomingFotmob = await findUpcomingMatchInFotmob(query);
        const allChannels = deps.getChannels();
        const footballChannels = matchChannelsByKeywords(allChannels, ['dazn', 'laliga', 'movistar', 'bein'], 'dazn', 3);

        if (upcomingFotmob) {
          const items: VoiceAssistantCandidateItem[] = [
            {
              kind: 'match',
              id: `match-sched-${normalizeSearchStr(upcomingFotmob.match.homeTeam)}`,
              title: `${upcomingFotmob.match.homeTeam} vs ${upcomingFotmob.match.awayTeam}`,
              subtitle: `${upcomingFotmob.match.competition} · ${upcomingFotmob.match.kickoffTime}h`,
              imageUrl: upcomingFotmob.match.homeLogo || upcomingFotmob.match.awayLogo || '',
              badge: 'PRÓXIMO',
              match: {
                id: `sched-${Date.now()}`,
                title: `${upcomingFotmob.match.homeTeam} vs ${upcomingFotmob.match.awayTeam}`,
                competition: upcomingFotmob.match.competition,
                sport: 'soccer',
                time: upcomingFotmob.match.kickoffTime,
                isLive: false,
                channels: [],
                matchMeta: {
                  homeTeam: upcomingFotmob.match.homeTeam,
                  awayTeam: upcomingFotmob.match.awayTeam,
                  homeLogo: upcomingFotmob.match.homeLogo,
                  awayLogo: upcomingFotmob.match.awayLogo,
                  statusLabel: `Hora: ${upcomingFotmob.match.kickoffTime}h`,
                },
              },
            },
          ];

          for (const ch of footballChannels) {
            const logo = ch.logoUrl || deps.resolveLogoUrl(ch) || undefined;
            items.push({
              kind: 'channel',
              id: ch.id,
              title: ch.name,
              subtitle: `${ch.network || 'Fútbol'} · Dial ${ch.dial || '--'}`,
              imageUrl: logo,
              badge: 'CANAL EMISOR',
              channel: { ...ch, logoUrl: logo },
            });
          }

          return res.json({
            success: true,
            intent: 'sports_info',
            autoPlay: false,
            spokenReply: upcomingFotmob.spokenReply,
            items,
          });
        }
      }

      const plan = await parseIntentWithGemini(query, userName, lang, history, activeMediaTitle);

      // Fast path for fluid open-domain conversation & app/player controls
      if (plan.intent === 'open_world' || plan.intent === 'player_control') {
        return res.json({
          success: true,
          intent: plan.intent,
          autoPlay: false,
          action: plan.action,
          spokenReply: plan.spokenReply,
          items: [],
        });
      }

      if (plan.intent === 'chat') {
        return res.json({
          success: true,
          intent: 'chat',
          autoPlay: false,
          spokenReply: plan.spokenReply,
          items: [],
        });
      }

      const allChannels = deps.getChannels();
      const items: VoiceAssistantCandidateItem[] = [];

      if (
        (plan.intent === 'play_channel' || plan.intent === 'browse_channels') ||
        (plan.intent !== 'play_movie' &&
          plan.intent !== 'play_series' &&
          plan.intent !== 'recommend_movies' &&
          plan.intent !== 'recommend_series' &&
          !plan.tmdbQuery?.titleSearch &&
          !plan.tmdbQuery?.personSearch &&
          (plan.channelKeywords.length > 0 || Boolean(plan.categoryHint)))
      ) {
        const chMatches = matchChannelsByKeywords(
          allChannels,
          plan.channelKeywords.length ? plan.channelKeywords : [query],
          plan.categoryHint,
          plan.intent === 'browse_channels' ? 10 : 6
        );

        for (const ch of chMatches) {
          const resolvedLogo = ch.logoUrl || deps.resolveLogoUrl(ch) || undefined;
          items.push({
            kind: 'channel',
            id: ch.id,
            title: ch.name,
            subtitle: `${ch.network || 'TV Directo'} · Dial ${ch.dial || '--'}`,
            imageUrl: resolvedLogo,
            badge: ch.quality || 'HD LIVE',
            channel: {
              ...ch,
              logoUrl: resolvedLogo,
            },
          });
        }
      }

      if (plan.intent === 'play_match' || plan.intent === 'sports_info') {
        const matches = await deps.getSportsMatches().catch(() => []);
        const kws = (plan.matchKeywords.length ? plan.matchKeywords : query.split(' '))
          .map((w) => normalizeSearchStr(w))
          .filter((w) => w.length >= 3);

        const matchedGames = matches
          .filter((m) => {
            const hay = normalizeSearchStr(
              `${m.title} ${m.competition || ''} ${m.matchMeta?.homeTeam || ''} ${m.matchMeta?.awayTeam || ''}`
            );
            return kws.length === 0 || kws.some((k) => hay.includes(k));
          })
          .slice(0, 6);

        for (const m of matchedGames) {
          items.push({
            kind: 'match',
            id: m.id,
            title: m.title,
            subtitle: `${m.competition || 'Fútbol'} · ${m.matchMeta?.statusLabel || m.time || 'En Directo'}`,
            imageUrl: m.matchMeta?.homeLogo || m.matchMeta?.awayLogo || '',
            badge: m.isLive ? 'EN VIVO' : m.matchMeta?.statusLabel || 'PRÓXIMO',
            match: m,
          });
        }

        if (plan.intent === 'sports_info' && items.length === 0) {
          const footballChannels = matchChannelsByKeywords(allChannels, ['dazn', 'laliga', 'movistar', 'bein'], 'dazn', 3);
          for (const ch of footballChannels) {
            const logo = ch.logoUrl || deps.resolveLogoUrl(ch) || undefined;
            items.push({
              kind: 'channel',
              id: ch.id,
              title: ch.name,
              subtitle: `${ch.network || 'Fútbol'} · Dial ${ch.dial || '--'}`,
              imageUrl: logo,
              badge: 'CANAL DEPORTES',
              channel: { ...ch, logoUrl: logo },
            });
          }
        }
      }

      if (
        plan.intent === 'recommend_movies' ||
        plan.intent === 'recommend_series' ||
        plan.intent === 'play_movie' ||
        plan.intent === 'play_series'
      ) {
        const tmdbItems = await resolveTmdbRecommendations(plan.tmdbQuery, lang);
        for (const m of tmdbItems) {
          const isTv = m.mediaType === 'tv';
          const epInfo =
            plan.targetSeason && plan.targetEpisode
              ? `Temporada ${plan.targetSeason} · Capítulo ${plan.targetEpisode}`
              : isTv
              ? 'Serie'
              : 'Película';

          items.push({
            kind: isTv ? 'series' : 'movie',
            id: m.id,
            title: m.title,
            subtitle: `${epInfo} · ${m.year || 'HD'} · ★ ${m.rating || '7.5'}`,
            imageUrl: m.poster || m.backdrop || '',
            badge: isTv ? 'SERIE' : 'CINE',
            targetSeason: plan.targetSeason,
            targetEpisode: plan.targetEpisode,
            media: {
              ...m,
              seasonNumber: plan.targetSeason,
            },
          });
        }
      }

      if (plan.intent === 'play_music') {
        const musicQ = plan.tmdbQuery?.titleSearch || query;
        const musicRes = await searchMusicCatalog(musicQ, 'track').catch(() => ({ tracks: [] as any[] }));
        for (const tr of (musicRes.tracks || []).slice(0, 6)) {
          items.push({
            kind: 'music',
            id: tr.id,
            title: tr.title,
            subtitle: `${tr.artist?.name || 'Riffan Music'} · ${tr.album?.title || 'Single'}`,
            imageUrl: tr.album?.coverXl || tr.album?.cover || '',
            badge: 'MÚSICA',
            musicTrack: {
              id: tr.id,
              title: tr.title,
              artistName: tr.artist?.name || 'Riffan Music',
              cover: tr.album?.coverXl || tr.album?.cover || '',
              durationSec: tr.durationSec,
            },
          });
        }
      }

      const shouldAutoPlay =
        Boolean(plan.autoPlay) &&
        items.length > 0 &&
        (plan.intent === 'play_channel' ||
          plan.intent === 'play_movie' ||
          plan.intent === 'play_series' ||
          plan.intent === 'play_music' ||
          plan.intent === 'play_match');

      let finalReply = plan.spokenReply;

      if (items.length === 0 && (!finalReply || finalReply.startsWith('Searching') || finalReply.startsWith('Buscando'))) {
        finalReply =
          lang === 'en'
            ? `Sorry ${userName}, I could not find anything matching "${query}". Try asking for a channel like DAZN LaLiga, a sports fixture, or ask me anything else.`
            : lang === 'ca'
            ? `Ho sento ${userName}, no he trobat res per a "${query}". Prova demanant un canal com DAZN LaLiga, un partit o pregunta’m qualsevol cosa.`
            : lang === 'zh'
            ? `抱歉 ${userName}，我没有找到匹配“${query}”的内容。你可以试试点播电影、直播频道，或者和我聊任何话题。`
            : `No encontré nada exacto para "${query}", ${userName}. Prueba pidiendo un canal como DAZN LaLiga, una película o pregúntame lo que quieras.`;
      } else if (shouldAutoPlay && items.length > 0) {
        if (plan.targetEpisode) {
          finalReply = `¡Marchando! Te pongo el capítulo ${plan.targetEpisode} de la temporada ${plan.targetSeason || 1} de ${items[0].title}.`;
        } else {
          finalReply =
            lang === 'en'
              ? `Tuning ${items[0].title} right now.`
              : lang === 'ca'
              ? `Posant ${items[0].title} ara mateix.`
              : lang === 'zh'
              ? `马上为你播放 ${items[0].title}。`
              : `¡Marchando! Te pongo ${items[0].title}.`;
        }
      }

      return res.json({
        success: true,
        intent: plan.intent,
        autoPlay: shouldAutoPlay,
        action: plan.action,
        spokenReply: finalReply,
        items,
      });
    } catch (err) {
      logger.error({ err }, 'voice_assistant_route_error');
      return res.status(500).json({
        success: false,
        intent: 'chat',
        autoPlay: false,
        spokenReply: 'Vaya, ha fallado un momento el asistente de voz. Inténtalo de nuevo.',
        items: [],
      });
    }
  });

  // High-accuracy server-side audio transcription via Gemini (works in all browsers & iframes)
  app.post('/api/ai/transcribe', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        audioBase64?: unknown;
        mimeType?: unknown;
        lang?: unknown;
      };
      const rawAudio = String(body.audioBase64 || '').trim();
      if (!rawAudio) {
        return res.status(400).json({ success: false, transcript: '', error: 'Missing audioBase64' });
      }
      const cleanBase64 = rawAudio.replace(/^data:[^;]+;base64,/, '');
      const mimeType = String(body.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
      const lang = String(body.lang || 'es').toLowerCase().slice(0, 2);

      const ai = getGeminiClient();
      if (!ai) {
        return res.json({ success: false, transcript: '', reason: 'no_api_key' });
      }

      const hintLang =
        lang === 'en'
          ? 'English'
          : lang === 'ca'
          ? 'Catalan or Spanish'
          : lang === 'zh'
          ? 'Mandarin Chinese'
          : 'Spanish';

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Transcribe the spoken audio accurately in the language spoken (default hint: ${hintLang}). Return ONLY the plain spoken words with natural punctuation and no quotes, labels, or explanations. If the audio is silent or unintelligible, return an empty string.`,
              },
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
      });

      const transcript = String(response.text || '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
      return res.json({
        success: Boolean(transcript),
        transcript,
      });
    } catch (err) {
      logger.warn({ err }, 'voice_transcribe_error');
      return res.json({ success: false, transcript: '', reason: 'transcribe_failed' });
    }
  });

  // Natural neural Text-to-Speech via Gemini TTS (returns base64 24kHz WAV binary)
  app.post('/api/ai/tts', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        text?: unknown;
        lang?: unknown;
        voiceName?: unknown;
      };
      const rawText = String(body.text || '')
        .replace(/[*_`#>]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600);
      if (!rawText) {
        return res.status(400).json({ success: false, error: 'Missing text' });
      }
      const lang = String(body.lang || 'es').toLowerCase().slice(0, 2);
      const voiceName = String(
        body.voiceName ||
          (lang === 'en' ? 'Kore' : lang === 'zh' ? 'Aoede' : lang === 'ca' ? 'Leda' : 'Zephyr')
      ).trim();

      const ai = getGeminiClient();
      if (!ai) {
        return res.json({ success: false, reason: 'no_api_key' });
      }

      const synthesizeWithModel = async (modelId: string) => {
        const response = await ai.models.generateContent({
          model: modelId,
          contents: [
            {
              role: 'user',
              parts: [{ text: rawText }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
        });
        const parts = response.candidates?.[0]?.content?.parts || [];
        const audioPart = parts.find((p) => Boolean(p?.inlineData?.data));
        return {
          base64Audio: audioPart?.inlineData?.data || '',
          mimeType: audioPart?.inlineData?.mimeType || 'audio/wav',
        };
      };

      let synthesized = { base64Audio: '', mimeType: 'audio/wav' };
      try {
        synthesized = await synthesizeWithModel('gemini-3.8-flash-lite-tts');
      } catch (firstErr) {
        logger.debug({ firstErr }, 'tts_primary_model_retry');
        synthesized = await synthesizeWithModel('gemini-3.8-flash-tts');
      }

      if (!synthesized.base64Audio) {
        return res.json({ success: false, reason: 'empty_audio' });
      }

      return res.json({
        success: true,
        audioBase64: synthesized.base64Audio,
        mimeType: synthesized.mimeType,
      });
    } catch (err) {
      logger.warn({ err }, 'voice_tts_error');
      return res.json({ success: false, reason: 'tts_failed' });
    }
  });
}
