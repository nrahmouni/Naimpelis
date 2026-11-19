import type { Express, Request, Response } from 'express';
import { CHROME_UA } from '../extractors/httpHelpers.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';
import type { CatalogMovie } from '../../src/types.ts';
import {
  KIDS_LIVE_CHANNELS,
  kidsChannelToCatalogMovie,
  normalizeKidsLang,
  type KidsAgeGroup,
  type KidsLanguageCode,
} from './kidsData.ts';

const KIDS_YT_CATEGORY_QUERIES: Record<
  KidsLanguageCode,
  Record<KidsAgeGroup, Record<string, string>>
> = {
  es: {
    '3-5': {
      all: 'Pocoyó Español Oficial Peppa Pig CantaJuego infantil',
      cartoons: 'Pocoyó Español Oficial capítulos completos preescolar',
      songs: 'CantaJuego canciones infantiles bebés preescolar español',
      animals: 'animales granja selva canciones cuentos infantil español',
      dinosaurs: 'dinosaurios bebé dibujos animados preescolar español',
      space: 'planetas canciones para bebés preescolar español',
      magic: 'cuentos cortos para dormir niños preescolar español',
      educational: 'aprender colores números vocales Pocoyó español',
    },
    '6-8': {
      all: 'Bluey Español Oficial dibujos animados capítulos completos',
      cartoons: 'Bluey Peppa Pig SpongeBob español capítulos oficiales',
      songs: 'CantaJuego música infantil baile niños español',
      animals: 'documental animales salvajes para niños español',
      dinosaurs: 'dinosaurios mundo jurásico educativo niños español',
      space: 'sistema solar planetas para niños español educativo',
      magic: 'cuentos clásicos animados infantiles español',
      educational: 'sumas restas ciencias divertidas niños primaria español',
    },
    '9-12': {
      all: 'ciencia divertida espacio aventuras animación juvenil español',
      cartoons: 'series animadas aventuras comedia familiar español',
      songs: 'bandas sonoras disney canciones películas animación español',
      animals: 'National Geographic Kids animales asombrosos español',
      dinosaurs: 'paleontología fósiles dinosaurios documental infantil español',
      space: 'universo agujeros negros NASA para niños español',
      magic: 'leyendas mitología aventuras animadas niños español',
      educational: 'experimentos ciencia robótica historia para niños español',
    },
  },
  ca: {
    '3-5': {
      all: 'Mic SX3 Super3 en català dibuixos petits',
      cartoons: 'Mic Titó SX3 capítols català infantil',
      songs: 'El Pot Petit Dàmaris Gelabert cançons català',
      animals: 'animals per a petits en català Mic SX3',
      dinosaurs: 'dinosaures dibuixos petits en català',
      space: 'estrelles lluna contes petits català',
      magic: 'contes curts en català per dormir',
      educational: 'colors números cançons en català infantil',
    },
    '6-8': {
      all: 'SX3 Super3 dibuixos animats català capítols complets',
      cartoons: 'Doraemon Shin-chan SX3 dibuixos català',
      songs: 'El Pot Petit Xiula cançons infantils català',
      animals: 'animals per a nens en català educatiu',
      dinosaurs: 'dinosaures per a nens en català',
      space: 'sistema solar planetes en català per a nens',
      magic: 'rondalles contes animats en català',
      educational: 'aprendre ciència natura en català infantil',
    },
    '9-12': {
      all: 'documentals natura ciència espai SX3 català',
      cartoons: 'Bola de Drac Detectiu Conan anime en català',
      songs: 'música juvenil bandes sonores català',
      animals: 'món animal documentals en català',
      dinosaurs: 'fòssils i dinosaures documental en català',
      space: 'astronomia espai per a joves en català',
      magic: 'llegendes catalanes aventures animades',
      educational: 'experiments ciència robòtica català',
    },
  },
  en: {
    '3-5': {
      all: 'Bluey Super Simple Songs Peppa Pig toddler official',
      cartoons: 'Bluey Peppa Pig Hey Duggee official full episodes',
      songs: 'Super Simple Songs nursery rhymes preschool',
      animals: 'farm wild animals for toddlers educational',
      dinosaurs: 'friendly dinosaurs songs cartoons preschool',
      space: 'planets solar system song for toddlers',
      magic: 'short bedtime fairy tale toddler animation',
      educational: 'phonics ABC numbers colors for toddlers',
    },
    '6-8': {
      all: 'Bluey Wild Kratts cartoons full episodes kids',
      cartoons: 'Bluey Arthur Paddington official cartoons english',
      songs: 'kids action songs sing along family',
      animals: 'National Geographic Kids wild animals episodes',
      dinosaurs: 'dinosaurs facts cartoon kids science',
      space: 'solar system planets kids educational science',
      magic: 'animated fairy tales stories for kids',
      educational: 'science experiments math kids learning video',
    },
    '9-12': {
      all: 'NASA kids space science wildlife documentary youth',
      cartoons: 'family animated adventure episodes english',
      songs: 'animated movie soundtracks sing along',
      animals: 'ocean wildlife documentary National Geographic Kids',
      dinosaurs: 'prehistoric dinosaurs documentary for kids',
      space: 'space exploration cosmos for kids NASA',
      magic: 'world mythology animated stories kids',
      educational: 'STEM robotics engineering explained for kids',
    },
  },
  nl: {
    '3-5': {
      all: 'Ketnet Junior Bumba Nijntje peuters vlaams',
      cartoons: 'Bumba Nijntje Kaatje Ketnet Junior',
      songs: 'K3 kinderliedjes kleuters vlaams',
      animals: 'dieren voor peuters nederlands vlaams',
      dinosaurs: 'dinosaurus liedje tekenen kleuters nederlands',
      space: 'maan sterren voor peuters nederlands',
      magic: 'korte sprookjes kleuters nederlands',
      educational: 'leren tellen kleuren voor peuters nederlands',
    },
    '6-8': {
      all: 'Ketnet Samson Studio 100 kinderen vlaams',
      cartoons: 'Maya de Bij Wickie de Viking nederlands vlaams',
      songs: 'K3 Studio 100 kinderliedjes vlaams',
      animals: 'dieren voor kinderen educatief nederlands',
      dinosaurs: 'dinosaurus voor kinderen nederlands',
      space: 'heelal planeten voor kinderen nederlands',
      magic: 'sprookjes voor kinderen nederlands animatie',
      educational: 'wetenschap natuur voor kinderen nederlands',
    },
    '9-12': {
      all: 'Karrewiet Klokhuis wetenschap natuur jeugd vlaams',
      cartoons: 'jeugd animatie avontuur nederlands',
      songs: 'vlaamse jeugd muziek hits Studio 100',
      animals: 'natuur documentaire voor kinderen nederlands',
      dinosaurs: 'prehistorie dinosaurussen documentaire nederlands',
      space: 'ruimtevaart planeten voor kinderen nederlands',
      magic: 'volksverhalen legenden voor kinderen nederlands',
      educational: 'techniek wetenschap proefjes kinderen nederlands',
    },
  },
  fr: {
    '3-5': {
      all: 'Tchoupi Petit Ours Brun comptines maternelle français',
      cartoons: 'Tchoupi Petit Ours Brun épisodes complets',
      songs: 'comptines pour bébés maternelle français',
      animals: 'les animaux de la ferme pour les petits français',
      dinosaurs: 'dinosaures dessin animé petits français',
      space: 'lune étoiles chansons petits français',
      magic: 'petits contes pour dormir enfant français',
      educational: 'apprendre couleurs chiffres alphabet petits français',
    },
    '6-8': {
      all: 'Il était une fois dessins animés enfants français',
      cartoons: 'Miraculous Tchoupi dessins animés français',
      songs: 'chansons joyeuses pour enfants français',
      animals: 'animaux sauvages documentaire enfant français',
      dinosaurs: 'dinosaures pour les enfants français',
      space: 'système solaire pour enfants français',
      magic: 'contes merveilleux animés français',
      educational: 'C est pas sorcier juniors sciences français',
    },
    '9-12': {
      all: 'C est pas sorcier sciences espace nature jeunes français',
      cartoons: 'séries animées aventure famille français',
      songs: 'chansons films d animation français',
      animals: 'documentaire océans animaux jeunesse français',
      dinosaurs: 'documentaire dinosaures paléontologie enfants français',
      space: 'astronomie conquête spatiale jeunes français',
      magic: 'mythologie légendes animées français',
      educational: 'expériences scientifiques histoire enfants français',
    },
  },
  ar: {
    '3-5': {
      all: 'أناشيد أطفال روضة تعليمية بدون موسيقى عربي',
      cartoons: 'كرتون للأطفال الصغار تعليمي عربي',
      songs: 'أناشيد الحروف والأرقام للأطفال عربي',
      animals: 'أصوات الحيوانات للأطفال بالعربية',
      dinosaurs: 'الديناصورات للأطفال الصغار بالعربية',
      space: 'القمر والنجوم للأطفال الصغار عربي',
      magic: 'قصص قصيرة قبل النوم للأطفال بالعربية',
      educational: 'تعليم الألوان والحروف والأرقام للأطفال عربي',
    },
    '6-8': {
      all: 'سبيستون كرتون أطفال عربي حلقات كاملة',
      cartoons: 'أفلام كرتون للأطفال بالعربية حلقات كاملة',
      songs: 'أناشيد أطفال تربوية عربية',
      animals: 'عالم الحيوانات للأطفال بالعربية',
      dinosaurs: 'الديناصورات للأطفال بالعربية',
      space: 'الفضاء والكواكب للأطفال بالعربية',
      magic: 'قصص الأطفال والحكايات بالعربية',
      educational: 'العلوم والرياضيات للأطفال بالعربية',
    },
    '9-12': {
      all: 'مغامرات كرتون وثائقي الفضاء والعلوم للناشئة عربي',
      cartoons: 'المحقق كونان كرتون مغامرات عربي',
      songs: 'شارات سبيستون الكلاسيكية عربي',
      animals: 'وثائقي الطبيعة والحيوانات للأطفال عربي',
      dinosaurs: 'وثائقي الديناصورات والأحافير بالعربية',
      space: 'أسرار الفضاء والكواكب للناشئة عربي',
      magic: 'حكايات وأساطير عالمية بالعربية',
      educational: 'تجارب علمية واختراعات للناشئة بالعربية',
    },
  },
  rif: {
    '3-5': {
      all: 'Tarifit Arrif children songs tamazight kids',
      cartoons: 'Tarifit Arrif tamazight animated stories children',
      songs: 'izran arrac n arrif tamazight kids songs',
      animals: 'animals cartoon visual kids no talking',
      dinosaurs: 'dinosaurs animation visual preschoolers',
      space: 'planets moon stars animation for toddlers',
      magic: 'tiḥuja n arrif tamazight bedtime stories',
      educational: 'tamazight tarifit numbers animals learning kids',
    },
    '6-8': {
      all: 'Tarifit Arrif kids cartoons tamazight songs',
      cartoons: 'Tamazight Rif kids animated adventures',
      songs: 'chansons rifaines enfants tarifit arrif',
      animals: 'wildlife nature documentary simple visual kids',
      dinosaurs: 'dinosaurs educational animation kids',
      space: 'solar system planets animation kids',
      magic: 'tiḥuja tamazight folk stories children',
      educational: 'learn tarifit tamazight words kids',
    },
    '9-12': {
      all: 'Atlas Rif mountains culture nature documentary kids',
      cartoons: 'Tamazight animated adventures youth',
      songs: 'Rif traditional melodies youth cultural',
      animals: 'Atlas wildlife nature documentary',
      dinosaurs: 'prehistoric earth science documentary kids',
      space: 'space exploration cosmos documentary kids',
      magic: 'North African folk legends animation',
      educational: 'science geography nature exploration kids',
    },
  },
  zh: {
    '3-5': {
      all: '宝宝巴士 超级宝贝JOJO 幼儿启蒙 中文',
      cartoons: '小猪佩奇 宝宝巴士 幼儿动画片 中文',
      songs: '宝宝巴士 欢乐儿歌 中文',
      animals: '幼儿认识小动物 宝宝巴士 中文',
      dinosaurs: '恐龙儿歌 宝宝巴士 幼儿中文',
      space: '太阳月亮星星 幼儿科普动画 中文',
      magic: '中文睡前绘本故事 幼儿',
      educational: '幼儿学颜色数字汉字 宝宝巴士',
    },
    '6-8': {
      all: '熊出没 经典儿童动画片 完整版 中文',
      cartoons: '中文经典儿童动画片 完整版',
      songs: '经典少儿歌曲 童谣 中文',
      animals: '儿童动物科普 动画 中文',
      dinosaurs: '恐龙儿童动画片 中文科普',
      space: '太阳系宇宙科普 儿童动画 中文',
      magic: '中文童话故事 动画',
      educational: '小学趣味数学科学启蒙动画 中文',
    },
    '9-12': {
      all: '少儿科学实验 宇宙探索 纪录片 中文',
      cartoons: '少年冒险动画 国产经典 中文',
      songs: '经典动画电影主题曲 中文',
      animals: '神奇动物世界 少儿自然纪录片 中文',
      dinosaurs: '恐龙化石古生物 少儿纪录片 中文',
      space: '天文宇宙航天科普 少儿中文',
      magic: '中国传统神话故事 动画 中文',
      educational: '少儿编程科学发明探索 中文',
    },
  },
};

async function searchYouTubeKidsRaw(searchQuery: string, hl: string): Promise<CatalogMovie[]> {
  const ytRes = await fetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&hl=${encodeURIComponent(hl)}&sp=EgIQAQ%253D%253D`,
    {
      headers: {
        'User-Agent': CHROME_UA,
        'Accept-Language': `${hl},en;q=0.8`,
      },
      signal: AbortSignal.timeout(6500),
    }
  );
  if (!ytRes.ok) return [];
  const html = await ytRes.text();
  const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
  if (!initMatch) return [];

  const data = JSON.parse(initMatch[1]);
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
      ?.contents || [];

  const collected: CatalogMovie[] = [];
  const seen = new Set<string>();
  const blockedPattern =
    /\b(horror|gore|18\+|nsfw|blood|kill|murder|scary|creepypasta|roblox|prision|prison|escapa|skibidi|huggy|poppy\s*playtime|fnaf|granny|banban|screamer|prank|broma|zombie|terror|miedo|muerte|asesino|exe|sprunki|brainrot|gta|shooter|gun|weapon|fight)\b/i;

  for (const sec of sections) {
    const items = sec?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const vr = item?.videoRenderer;
      if (!vr?.videoId || seen.has(vr.videoId)) continue;
      const title = (vr.title?.runs?.map((r: { text?: string }) => r.text).join('') || '').trim();
      const channel =
        vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || 'YouTube Kids';
      if (!title || blockedPattern.test(title) || blockedPattern.test(channel)) continue;
      const duration = vr.lengthText?.simpleText || '';
      seen.add(vr.videoId);
      collected.push({
        id: `yt-${vr.videoId}`,
        mediaType: 'movie',
        title,
        originalTitle: title,
        year: duration || 'YouTube',
        rating: '9.5',
        overview: channel,
        poster: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
        backdrop: `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`,
        languages: [hl.toUpperCase()],
        genres: ['YouTube Kids'],
        platform: 'YouTube Kids',
        quality: duration || 'HD',
        bingetrixUrl: vr.videoId,
      });
      if (collected.length >= 20) break;
    }
    if (collected.length >= 20) break;
  }
  return collected;
}

export function registerKidsYoutubeRoutes(app: Express): void {
  const kidsYtCache = new LruTtlCache<string, { items: CatalogMovie[]; ts: number }>(160, 5 * 60_000);

  app.get('/api/kids/youtube', async (req: Request, res: Response) => {
    const kidsLang = normalizeKidsLang(req.query.lang);
    const category = String(req.query.category || 'all').trim().toLowerCase();
    const rawQuery = String(req.query.q || '').trim();
    const rawAge = String(req.query.ageGroup || '6-8').trim();
    const ageGroup: KidsAgeGroup =
      rawAge === '3-5' || rawAge === '9-12' ? rawAge : '6-8';

    if (category === 'live' || category === 'canales') {
      const sortedChannels = [...KIDS_LIVE_CHANNELS].sort((a, b) => {
        if (a.langCode === kidsLang && b.langCode !== kidsLang) return -1;
        if (b.langCode === kidsLang && a.langCode !== kidsLang) return 1;
        return a.dial - b.dial;
      });
      return res.json({
        ok: true,
        lang: kidsLang,
        category: 'live',
        ageGroup,
        items: sortedChannels.map(kidsChannelToCatalogMovie),
      });
    }

    const langAgeDict =
      KIDS_YT_CATEGORY_QUERIES[kidsLang]?.[ageGroup] ||
      KIDS_YT_CATEGORY_QUERIES[kidsLang]?.['6-8'] ||
      KIDS_YT_CATEGORY_QUERIES.es['6-8'];

    const langWord =
      kidsLang === 'en'
        ? 'kids'
        : kidsLang === 'es'
        ? 'niños infantil español'
        : kidsLang === 'fr'
        ? 'enfants français'
        : kidsLang === 'ar'
        ? 'أطفال عربي'
        : kidsLang === 'zh'
        ? '儿童动画 中文'
        : kidsLang === 'nl'
        ? 'kinderen vlaams'
        : kidsLang === 'ca'
        ? 'infantil català'
        : 'tarifit kids';

    const ageWord =
      ageGroup === '3-5'
        ? 'preschool toddler'
        : ageGroup === '9-12'
        ? 'science adventure youth'
        : 'kids';

    const finalQuery = rawQuery
      ? `${rawQuery} ${langWord} ${ageWord}`.trim()
      : langAgeDict[category] || langAgeDict.all;

    const cacheKey = `${kidsLang}:${category}:${ageGroup}:${finalQuery.toLowerCase()}`;
    const cached = kidsYtCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60_000) {
      return res.json({ ok: true, lang: kidsLang, category, ageGroup, items: cached.items });
    }

    const hlMap: Record<KidsLanguageCode, string> = {
      es: 'es',
      ca: 'ca',
      en: 'en',
      nl: 'nl',
      fr: 'fr',
      ar: 'ar',
      rif: 'es',
      zh: 'zh-CN',
    };

    try {
      let items = await searchYouTubeKidsRaw(finalQuery, hlMap[kidsLang] || 'es');
      if (items.length === 0 && rawQuery) {
        items = await searchYouTubeKidsRaw(`${rawQuery} kids`, 'en');
      }
      if (items.length === 0) {
        const fallbackDict =
          KIDS_YT_CATEGORY_QUERIES.en[ageGroup] || KIDS_YT_CATEGORY_QUERIES.en['6-8'];
        items = await searchYouTubeKidsRaw(fallbackDict[category] || fallbackDict.all, 'en');
      }
      kidsYtCache.set(cacheKey, { items, ts: Date.now() });
      res.setHeader('Cache-Control', 'public, max-age=180');
      return res.json({ ok: true, lang: kidsLang, category, ageGroup, items });
    } catch (err) {
      logger.warn({ err, kidsLang, category, ageGroup }, 'kids_youtube_search_error');
      return res.json({ ok: true, lang: kidsLang, category, ageGroup, items: [] });
    }
  });

  app.post('/api/kids/youtube-resolve', async (req: Request, res: Response) => {
    const rawUrl = String(req.body?.url || '').trim().slice(0, 300);
    const kidsLang = normalizeKidsLang(req.body?.lang);
    if (!rawUrl) {
      return res.status(400).json({ ok: false, error: 'URL o ID de YouTube requerido.' });
    }

    let videoId = '';
    const directMatch = rawUrl.match(/^[a-zA-Z0-9_-]{8,16}$/);
    if (directMatch) {
      videoId = directMatch[0];
    } else {
      try {
        const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
        if (parsed.hostname.includes('youtu.be')) {
          videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
        } else if (parsed.searchParams.get('v')) {
          videoId = parsed.searchParams.get('v') || '';
        } else {
          const pathMatch = parsed.pathname.match(/\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{8,16})/);
          if (pathMatch) videoId = pathMatch[1];
        }
      } catch {
        videoId = '';
      }
    }

    if (!/^[a-zA-Z0-9_-]{8,16}$/.test(videoId)) {
      return res.status(400).json({ ok: false, error: 'No se pudo extraer un ID de vídeo válido.' });
    }

    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (!oembedRes.ok) {
        return res.status(404).json({ ok: false, error: 'Vídeo no disponible o no insertable.' });
      }
      const meta = (await oembedRes.json()) as { title?: string; author_name?: string };
      const title = String(meta?.title || '').trim() || `YouTube Kids (${videoId})`;
      const author = String(meta?.author_name || 'YouTube Kids').trim();

      const item: CatalogMovie = {
        id: `yt-${videoId}`,
        mediaType: 'movie',
        title,
        originalTitle: title,
        year: 'YouTube Kids',
        rating: '9.5',
        overview: author,
        poster: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        backdrop: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        languages: [kidsLang.toUpperCase()],
        genres: ['YouTube Kids'],
        platform: 'YouTube Kids',
        quality: 'HD',
        bingetrixUrl: videoId,
      };
      return res.json({ ok: true, item });
    } catch {
      return res.status(502).json({ ok: false, error: 'No se pudo verificar el enlace ahora.' });
    }
  });
}
