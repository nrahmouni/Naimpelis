/**
 * @module server/data/catalaRegistry
 * @description Curated Catalan anime archive packs (TV3/K3/3XL/TotsRucs) & live 3Cat/SX3 public TV channels.
 */

export interface CatalaPackSeasonDef {
  seasonNumber: number;
  name: string;
  archiveId?: string;
  ccmaProgramId?: string;
  audioNote?: string;
  customEpisodes?: any[];
}

export interface CatalaAnimeEntryDef {
  id: string;
  titleCat: string;
  originalTitle: string;
  aliases?: string;
  tmdbId?: number;
  tmdbType?: 'tv' | 'movie';
  category: 'classics' | 'shonen' | 'movies';
  eraTag: string;
  episodeHint: string;
  overviewCat: string;
  fallbackPoster?: string;
  seasons: CatalaPackSeasonDef[];
}

export const CATALA_ANIME_REGISTRY: CatalaAnimeEntryDef[] = [
  {
    id: 'combat-xiaolin',
    titleCat: 'Combat Xiaolin (Combat Xaolín)',
    originalTitle: 'Xiaolin Showdown',
    aliases: 'combat xaolin combat xiaolin duelo xiaolin xiaolin showdown k3 3xl omi raimundo kimiko clay shen gong wu',
    tmdbId: 679,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'K3 / 3XL · Arxiu + Sèrie',
    episodeHint: 'Arxiu Català K3 + 52 capítols MP4',
    overviewCat:
      "L'Omi, en Raimundo, la Kimiko i en Clay entrenant al Temple Xiaolin per protegir els Shen Gong Wu contra en Jack Spicer i la Wuya. Inclou l'arxiu conservat en català del K3 i els 52 capítols complets en reproducció directa MP4.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Arxiu K3 en Català (Openings i Clips)',
        customEpisodes: [
          {
            id: 'xiaolin-cat-op1',
            episodeNumber: 1,
            detectedNumber: 1,
            seasonNumber: 1,
            title: 'Opening 1 Oficial en Català (Emissió K3 / TV3)',
            overview: 'Careta d’entrada original en català emesa pel canal K3 / Super3.',
            still: 'https://i.ytimg.com/vi/oRvYwMsGAZQ/hqdefault.jpg',
            runtime: 1,
            youtubeVideoId: 'oRvYwMsGAZQ',
            streamUrl: 'oRvYwMsGAZQ',
            audioNote: 'Doblatge Original Català (K3)',
            sourceType: 'youtube',
          },
          {
            id: 'xiaolin-cat-intro2',
            episodeNumber: 2,
            detectedNumber: 2,
            seasonNumber: 1,
            title: 'Intro Televisió de Catalunya · Combat Xiaolin',
            overview: 'Versió televisiva conservada de la sintonia en català del canal K3.',
            still: 'https://i.ytimg.com/vi/RO7SwnPHKAk/hqdefault.jpg',
            runtime: 1,
            youtubeVideoId: 'RO7SwnPHKAk',
            streamUrl: 'RO7SwnPHKAk',
            audioNote: 'Doblatge Original Català (K3)',
            sourceType: 'youtube',
          },
          {
            id: 'xiaolin-cat-k3promo',
            episodeNumber: 3,
            detectedNumber: 3,
            seasonNumber: 1,
            title: 'Especial K3 Arts Marcials · Combat Xiaolin & Jackie Chan',
            overview: 'Fragment nostàlgic d’emissió de les sèries d’arts marcials en català al K3.',
            still: 'https://i.ytimg.com/vi/J9fNCr05ij8/hqdefault.jpg',
            runtime: 2,
            youtubeVideoId: 'J9fNCr05ij8',
            streamUrl: 'J9fNCr05ij8',
            audioNote: 'Arxiu Històric K3 Català',
            sourceType: 'youtube',
          },
          {
            id: 'xiaolin-cat-op-alt',
            episodeNumber: 4,
            detectedNumber: 4,
            seasonNumber: 1,
            title: 'Sintonia Clàssica · Combat Xiaolin (Remaster)',
            overview: ' Versió neta de l’opening de Combat Xiaolin.',
            still: 'https://i.ytimg.com/vi/v9URlfv_JDI/hqdefault.jpg',
            runtime: 1,
            youtubeVideoId: 'v9URlfv_JDI',
            streamUrl: 'v9URlfv_JDI',
            audioNote: 'Arxiu Català (K3)',
            sourceType: 'youtube',
          },
        ],
      },
      {
        seasonNumber: 2,
        name: 'Sèrie Completa · 52 Capítols (MP4 Directe)',
        archiveId: 'Dueloxiaolinlat',
        audioNote: 'Sèrie Completa MP4 (Àudio alternatiu · Rip K3 només a eMule TotsRucs)',
      },
    ],
  },
  {
    id: 'bola-de-drac',
    titleCat: 'Bola de Drac',
    originalTitle: 'Dragon Ball',
    tmdbId: 12609,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Clàssic Complet',
    episodeHint: '153 capítols en català',
    overviewCat:
      "Les aventures d'en Son Goku i la Bulma buscant les set Boles de Drac amb el doblatge històric en català de TV3.",
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–153)', archiveId: 'boladedrac-cat' }],
  },
  {
    id: 'bola-de-drac-z',
    titleCat: 'Bola de Drac Z',
    originalTitle: 'Dragon Ball Z',
    tmdbId: 12971,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'TV3 / 3XL · HD Català',
    episodeHint: '291 capítols en català',
    overviewCat:
      'Totes les sagues dels Saiyans, Freezer, Cèl·lula i Majin Buu íntegres amb àudio en català i valencià.',
    seasons: [
      { seasonNumber: 1, name: 'Temporada 1 · Saiyans i Namek', archiveId: 'boladedracz-1' },
      { seasonNumber: 2, name: 'Temporada 2 · Freezer i Androides', archiveId: 'boladedracz-2' },
      {
        seasonNumber: 3,
        name: 'Temporada 3 · Cèl·lula i Majin Buu (1080p)',
        archiveId: 'anime-en-valencia-bola-de-drac-z-hd-1080p-multi-214',
      },
    ],
  },
  {
    id: 'bola-de-drac-gt',
    titleCat: 'Bola de Drac GT',
    originalTitle: 'Dragon Ball GT',
    tmdbId: 12697,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'K3 / 3XL · Català',
    episodeHint: '64 capítols en català',
    overviewCat:
      'El gran viatge espacial d’en Son Goku, la Pan i en Trunks contra Baby i els Dracs Malignes en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–64)', archiveId: 'bola-de-drac-gt' }],
  },
  {
    id: 'bola-de-drac-super-sx3',
    titleCat: 'Bola de Drac Súper',
    originalTitle: 'Dragon Ball Super',
    tmdbId: 62715,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 / 3Cat · Català',
    episodeHint: '131 capítols en català',
    overviewCat:
      'La nova etapa oficial doblada en català pel SX3 (3Cat): el Torneig del Poder, Beerus, Goku Black i Ultra Instint.',
    seasons: [{ seasonNumber: 1, name: 'SX3 Català (Capítols Oficials)', ccmaProgramId: '73476' }],
  },
  {
    id: 'one-piece-sx3',
    titleCat: 'One Piece (Català)',
    originalTitle: 'One Piece',
    tmdbId: 37854,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 / K3 · Català',
    episodeHint: '+220 capítols en català',
    overviewCat:
      'En Monkey D. Ruffy i la tripulació del Barret de Palla en català (emissió oficial SX3 / 3Cat).',
    seasons: [
      { seasonNumber: 1, name: 'SX3 Català (Sagues en Emissió)', ccmaProgramId: '201374971' },
    ],
  },
  {
    id: 'dr-slump',
    titleCat: 'Dr. Slump',
    originalTitle: 'Dr. Slump Arale-chan',
    tmdbId: 30723,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Mític Català',
    episodeHint: '243 capítols en català',
    overviewCat:
      "L'Arale Norimaki, en Senbei i tota la Vila del Pingüí amb el llegendari doblatge català de TV3.",
    seasons: [
      { seasonNumber: 1, name: 'Pack 1 (Capítols 1–50)', archiveId: 'drslump-1' },
      { seasonNumber: 2, name: 'Pack 2 (Capítols 51–100)', archiveId: 'drslump-2' },
      { seasonNumber: 3, name: 'Pack 3 (Capítols 101–150)', archiveId: 'drslump-3' },
      { seasonNumber: 4, name: 'Pack 4 (Capítols 151–200)', archiveId: 'dr-slump-4' },
      { seasonNumber: 5, name: 'Pack 5 (Capítols 201–243)', archiveId: 'drslump-cat-5' },
    ],
  },
  {
    id: 'detectiu-conan',
    titleCat: 'El Detectiu Conan',
    originalTitle: 'Meitantei Conan',
    tmdbId: 30983,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / Super3 / SX3',
    episodeHint: '9 Temporades en català',
    overviewCat:
      'En Shinichi Kudo convertit en Conan Edogawa resolent els casos més complexos amb el mític doblatge català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Temporada 1',
        archiveId: 'episodi-1-el-detectiu-mes-famos-daquest-segle_202607',
      },
      {
        seasonNumber: 2,
        name: 'Temporada 2',
        archiveId: 'episodi-1-el-segrest-den-conan-edogawa',
      },
      { seasonNumber: 3, name: 'Temporada 3', archiveId: 'episodi-1-el-cas-del-segrest' },
      {
        seasonNumber: 4,
        name: 'Temporada 9',
        archiveId: 'episodi-14-el-petit-client-primera-part',
      },
      {
        seasonNumber: 5,
        name: 'Temporada 10',
        archiveId: 'episodi-1-lobjectiu-es-en-kogoro-mouri',
      },
      {
        seasonNumber: 6,
        name: 'Temporada 11 · Impacte Negre',
        archiveId: 'episodis-1-2-3-4-5-impacte-negre-a-labast-dels-bracos-de-la-organitzacio',
      },
      {
        seasonNumber: 7,
        name: 'Temporada 12',
        archiveId: 'episodi-1-la-gran-operacio-de-1r-b',
      },
      {
        seasonNumber: 8,
        name: 'Temporada 13 · Vermell i Negre',
        archiveId: 'episodi-1-el-xoc-entre-el-vermell-i-el-negre-lorigen',
      },
      {
        seasonNumber: 9,
        name: 'Temporada 14',
        archiveId: 'episodi-1-shinichi-kudo-lassassi-primera-part',
      },
    ],
  },
  {
    id: 'sakura-cacadora-cartes',
    titleCat: 'Sakura, la caçadora de cartes',
    originalTitle: 'Cardcaptor Sakura',
    tmdbId: 46261,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / SX3 · Sèrie Completa',
    episodeHint: '70 capítols en català',
    overviewCat:
      'La Sakura Kinomoto i en Keroberos reunint totes les cartes de Clow amb el doblatge íntegre en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (1–70)',
        archiveId: 'sakura-la-cacadora-de-cartes-episodi-1-sakura-i-el-misterios-llibre-magic',
      },
    ],
  },
  {
    id: 'guardians-de-la-nit',
    titleCat: 'Guardians de la Nit (Kimetsu no Yaiba)',
    originalTitle: 'Kimetsu no Yaiba',
    tmdbId: 85937,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 · Doblatge Català HD',
    episodeHint: 'Temporada 1 en català',
    overviewCat:
      'En Tanjiro Kamado i la Nezuko en la seva lluita contra els dimonis amb doblatge en català d’alta definició.',
    seasons: [{ seasonNumber: 1, name: 'Temporada 1 (Català HD)', archiveId: 'episodi-1-crueltat' }],
  },
  {
    id: 'death-note-cat',
    titleCat: 'Death Note',
    originalTitle: 'Death Note',
    tmdbId: 13916,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'Canal 3XL · Complet',
    episodeHint: '37 capítols en català',
    overviewCat:
      'El duel psicològic entre en Light Yagami (Kira) i L amb el doblatge oficial en català del mític Canal 3XL.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–37)', archiveId: 'Death-Note-cat' }],
  },
  {
    id: 'evangelion-cat',
    titleCat: 'Neon Genesis Evangelion',
    originalTitle: 'Shinseiki Evangelion',
    tmdbId: 890,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Obra Mestra',
    episodeHint: '26 capítols en català',
    overviewCat:
      'En Shinji Ikari, la Rei Ayanami i l’Asuka pilotant els EVA a Tòquio-3 amb el doblatge clàssic en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–26)', archiveId: 'ngecat-21' }],
  },
  {
    id: 'ranma-cat',
    titleCat: 'Ranma ½',
    originalTitle: 'Ranma ½',
    tmdbId: 42501,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / K3 · Complet',
    episodeHint: '161 capítols en català',
    overviewCat:
      'Arts marcials, humor i les fonts maleïdes de Jusenkyo amb en Ranma Saotome i l’Akane Tendo en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–161)', archiveId: 'ranma161cat' }],
  },
  {
    id: 'shin-chan-cat',
    titleCat: 'Shin-chan',
    originalTitle: 'Crayon Shin-chan',
    tmdbId: 54041,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / 3XL · Català',
    episodeHint: '458 capítols en català',
    overviewCat:
      'Les trapelleries d’en Shinnosuke Nohara, la Misae, l’Hiroshi i el Nevado amb el doblatge català més estimat.',
    seasons: [
      { seasonNumber: 1, name: 'Col·lecció Català (458 cap.)', archiveId: 'shin-chan-catala-japanese' },
    ],
  },
  {
    id: 'inuyasha-cat',
    titleCat: 'Musculman (Kinnikuman)',
    originalTitle: 'Kinnikuman',
    tmdbId: 44213,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / 33 · Clàssic',
    episodeHint: '136 capítols en català',
    overviewCat:
      'El superheroi més esbojarrat del ring i l’all amb arròs amb el doblatge llegendari en català.',
    seasons: [
      { seasonNumber: 1, name: 'Sèrie Completa (136 cap.)', archiveId: 'musculman-audio-catala' },
    ],
  },
  {
    id: 'yu-yu-hakusho-cat',
    titleCat: 'Yu Yu Hakusho · Els Defensors del Més Enllà',
    originalTitle: 'Yu Yu Hakusho',
    tmdbId: 30669,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'K3 / 3XL · Català',
    episodeHint: 'Sagues completes en català',
    overviewCat:
      'En Yusuke Urameshi, en Kuwabara, en Kurama i en Hiei al Torneig Fosc amb el doblatge mític en català.',
    seasons: [{ seasonNumber: 1, name: 'Episodis en Català', archiveId: 'yu-yu-hakusho-part-2' }],
  },
  {
    id: 'trigun-cat',
    titleCat: "Trigun '98",
    originalTitle: 'Trigun',
    tmdbId: 46896,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Sèrie Completa',
    episodeHint: '26 capítols en català',
    overviewCat:
      'En Vash l’Estampida travessant el desert de Gunsmoke amb l’emblemàtic doblatge en català del 3XL.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–26)', archiveId: '05-el-puny-mortal' }],
  },
  {
    id: 'bobobo-cat',
    titleCat: 'Bo-Bobo',
    originalTitle: 'Bobobo-bo Bo-bobo',
    tmdbId: 34857,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 · Humor Absurd',
    episodeHint: 'Sèrie en català',
    overviewCat:
      'El combat pels cabells i l’humor més surrealista amb un dels doblatges catalans més recordats del K3.',
    seasons: [{ seasonNumber: 1, name: 'Capítols en Català', archiveId: 'Bo-Bobo-cat' }],
  },
  {
    id: 'flcl-cat',
    titleCat: 'FLCL (Furi Kuri)',
    originalTitle: 'FLCL',
    tmdbId: 21437,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Gainax OVAs',
    episodeHint: '6 OVAs completes en català',
    overviewCat:
      'La Haruko Haruhara, en Naota i la música de The Pillows en l’obra de culte de Gainax doblada al català.',
    seasons: [{ seasonNumber: 1, name: 'OVAs Completes (1–6)', archiveId: 'flcl-cat' }],
  },
  {
    id: 'conan-noi-del-futur',
    titleCat: 'Conan, el noi del futur',
    originalTitle: 'Mirai Shonen Conan',
    tmdbId: 2004,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'Hayao Miyazaki · Català',
    episodeHint: '26 capítols en català',
    overviewCat:
      'La primera gran sèrie dirigida per Hayao Miyazaki, amb en Conan i la Lana en un món postapocalíptic en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–26)', archiveId: 'conan-el-noi-del-futur' }],
  },
  {
    id: 'capita-harlock-cat',
    titleCat: 'El Capità Harlock',
    originalTitle: 'Uchuu Kaizoku Captain Harlock',
    tmdbId: 20420,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Leiji Matsumoto',
    episodeHint: 'Sèrie clàssica en català',
    overviewCat:
      'El pirata espacial de l’Arcàdia lluitant per la llibertat de la Terra amb el doblatge clàssic català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie en Català', archiveId: 'el-capita-harlock-cat' }],
  },
  {
    id: 'lamu-urusei-yatsura',
    titleCat: 'Lamu (Urusei Yatsura)',
    originalTitle: 'Urusei Yatsura',
    tmdbId: 34005,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / 33 · Rumiko Takahashi',
    episodeHint: 'Capítols en català',
    overviewCat:
      "L'extraterrestre Lamu i el malaurat Ataru Moroboshi en la comèdia clàssica de Rumiko Takahashi en català.",
    seasons: [{ seasonNumber: 1, name: 'Episodis en Català', archiveId: 'urusei-yatsura-lamu' }],
  },
  {
    id: 'corrector-yui-cat',
    titleCat: 'Corrector Yui',
    originalTitle: 'Corrector Yui',
    tmdbId: 44903,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 · Sèrie Completa',
    episodeHint: '2 Temporades en català',
    overviewCat:
      'La Yui Kasuga viatjant per la xarxa ComNet per protegir el món digital amb el doblatge del K3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Box 1 (Temporada 1)',
        archiveId: 'corrector-yui-16-box-1-dvd-4-01-c-cat-jap-by-el-millor-anime',
      },
      {
        seasonNumber: 2,
        name: 'Box 2 (Temporada 2)',
        archiveId: 'corrector-yui-33-box-2-dvd-2-02-c-cat-jap-by-el-millor-anime',
      },
    ],
  },
  {
    id: 'magica-doremi-cat',
    titleCat: 'La Màgica DoReMi (+ Naisho i Pel·lícula)',
    originalTitle: 'Ojamajo Doremi',
    aliases: 'doremi naisho totsrucs buscant la magica doremi',
    tmdbId: 42705,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / TotsRucs · 1080p',
    episodeHint: 'Sèrie + 13 OVAs + Pel·lícula',
    overviewCat:
      'La Doremi, la Hazuki i l’Aiko convertides en aprenentes de bruixa en català, incloent les 13 OVAs de Naisho i la pel·lícula de TotsRucs.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Edició 1080p Català',
        archiveId: 'buscant-la-magica-doremi-bdmv-1080p-cat-jap-by-el-millor-anime',
      },
      {
        seasonNumber: 2,
        name: 'DoReMi Naisho · 13 OVAs en Català',
        archiveId: 'doreminaisho.cat',
      },
      {
        seasonNumber: 3,
        name: 'Pel·lícula · Buscant la Màgica DoReMi (TotsRucs)',
        archiveId: 'buscando-a-la-magica-doremi-adria-tots-rucs_202609',
      },
    ],
  },
  {
    id: 'fushigi-yuugi-cat',
    titleCat: 'Fushigi Yuugi · El Joc Misteriós',
    originalTitle: 'Fushigi Yuugi',
    tmdbId: 31687,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: '3XL / K3 · 2 Temporades',
    episodeHint: '52 capítols en català',
    overviewCat:
      'La Miaka i la Yui transportades a l’interior del llibre dels Quatre Déus amb doblatge íntegre en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Temporada 1 (Català)',
        archiveId: 'fushigi-yuugi-o-el-joc-misterios-01-dvd-raw-480cat-jap-by-taketokun-el-millor-anime',
      },
      {
        seasonNumber: 2,
        name: 'Temporada 2 (Català)',
        archiveId: 'fushigi-yuugi-o-el-joc-misterios-02-dvd-raw-480cat-jap-by-taketokun-el-millor-anime',
      },
    ],
  },
  {
    id: 'cinturo-negre-yawara',
    titleCat: 'Cinturó Negre (Yawara!)',
    originalTitle: 'Yawara! A Fashionable Judo Girl',
    tmdbId: 42992,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / Canal 9 · Judo',
    episodeHint: '117 capítols',
    overviewCat:
      "L'obra de Naoki Urasawa sobre el talent prodigiós de la jove judoka Yawara Inokuma.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (117 cap.)',
        archiveId: 'cinturo-negre-ginger-yawara-117-val-dvd-vhs-by-angelus-oriol-per-a-ficcioenvalencia',
      },
    ],
  },
  {
    id: 'street-fighter-2-v',
    titleCat: 'Street Fighter II V',
    originalTitle: 'Street Fighter II V',
    tmdbId: 19611,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Sèrie Completa',
    episodeHint: '29 capítols en català',
    overviewCat:
      'En Ryu i en Ken recorrent el món per perfeccionar el seu estil de lluita contra Shadaloo i M. Bison en català.',
    seasons: [
      { seasonNumber: 1, name: 'Sèrie Completa', archiveId: 'street-fighter-2-audio-catala' },
    ],
  },
  {
    id: 'haikyu-sx3',
    titleCat: 'Haikyu!! (Català)',
    originalTitle: 'Haikyu!!',
    tmdbId: 60863,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 · Voleibol HD',
    episodeHint: 'Emissió SX3 en català',
    overviewCat:
      'En Shoyo Hinata i en Tobio Kageyama portant l’institut Karasuno al cim del voleibol japonès en català.',
    seasons: [{ seasonNumber: 1, name: 'SX3 Català Oficial', ccmaProgramId: '64916' }],
  },
  // --- PEL·LÍCULES I ESPECIALS D'ANIME EN CATALÀ ---
  {
    id: 'bola-de-drac-especials',
    titleCat: 'Bola de Drac · Pel·lícules i Especials',
    originalTitle: 'Dragon Ball Movies',
    tmdbId: 39100,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Col·lecció Cinema · Català',
    episodeHint: 'Pel·lícules i Especials TV',
    overviewCat:
      'Col·lecció de pel·lícules clàssiques i especials de televisió de Bola de Drac i Bola de Drac Z en català.',
    seasons: [
      { seasonNumber: 1, name: 'Pel·lícules i Especials', archiveId: 'bola-de-drac-especials' },
    ],
  },
  {
    id: 'conan-black-iron-submarine',
    titleCat: 'Detectiu Conan: Black Iron Submarine',
    originalTitle: 'Detective Conan: Black Iron Submarine',
    tmdbId: 1056360,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Cinema en Català · HD',
    episodeHint: 'Pel·lícula en català',
    overviewCat:
      "En Conan i l'Ai Haibara s'enfronten a l'Organització dels Homes de Negre a la instal·lació submarina d'Interpol.",
    seasons: [{ seasonNumber: 1, name: 'Pel·lícula Completa', archiveId: '1744246284468' }],
  },
  {
    id: 'conan-million-dollar-pentagram',
    titleCat: 'Detectiu Conan: The Million-dollar Pentagram',
    originalTitle: 'Detective Conan: The Million-dollar Pentagram',
    tmdbId: 1211483,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Estrena en Català · HD',
    episodeHint: 'Pel·lícula en català',
    overviewCat:
      'En Kaito Kid, en Heiji Hattori i en Conan Edogawa a Hakodate darrere el misteri de les espases japoneses.',
    seasons: [{ seasonNumber: 1, name: 'Pel·lícula Completa', archiveId: '1766885273493_202602' }],
  },
  {
    id: 'vull-menjar-me-el-teu-pancrees',
    titleCat: 'Vull menjar-me el teu pàncrees',
    originalTitle: 'Kimi no Suizou wo Tabetai',
    tmdbId: 504253,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Cinema Anime · Català',
    episodeHint: 'Pel·lícula completa',
    overviewCat:
      'Una de les pel·lícules d’animació japonesa més emotives dels últims anys, íntegra doblada en català.',
    seasons: [{ seasonNumber: 1, name: 'Pel·lícula Completa', archiveId: '20200427_20200427_1958' }],
  },
  {
    id: 'tomba-de-les-lluernes-cat',
    titleCat: 'La tomba de les lluernes (Studio Ghibli)',
    originalTitle: 'Hotaru no Haka',
    tmdbId: 12477,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Studio Ghibli · Català',
    episodeHint: 'Pel·lícula completa',
    overviewCat:
      "L'obra mestra d'Isao Takahata i Studio Ghibli amb doblatge en català.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula Completa',
        archiveId: 'LaTumbaDeLasLuciernagasDVDripAC3EspCatJapwwwlokotorrentscom',
      },
    ],
  },
  {
    id: 'ghost-in-the-shell-2-cat',
    titleCat: 'Ghost in the Shell 2: Innocence',
    originalTitle: 'Ghost in the Shell 2: Innocence',
    tmdbId: 12244,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Mamoru Oshii · Català',
    episodeHint: 'Pel·lícula completa',
    overviewCat:
      'En Batou i en Togusa de la Secció 9 investigant ginoides rebels en el clàssic ciberpunk en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula Completa',
        archiveId: 'ghost-in-the-shell-2-innocence-cat',
      },
    ],
  },
  {
    id: 'alita-angel-combat-cat',
    titleCat: 'Alita, Àngel de Combat (OVA 1993)',
    originalTitle: 'Gunnm',
    tmdbId: 37933,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: '3XL · Cyberpunk Català',
    episodeHint: 'OVAs completes en català',
    overviewCat:
      'Les OVAs clàssiques de 1993 basades en el manga Gunnm amb el doblatge històric en català.',
    seasons: [
      { seasonNumber: 1, name: 'OVAs en Català', archiveId: 'alita-angel-de-combat-1993' },
    ],
  },
  {
    id: 'dr-slump-pelis-ovas',
    titleCat: 'Dr. Slump · Pel·lícules i OVAs',
    originalTitle: 'Dr. Slump Movies',
    tmdbId: 30723,
    tmdbType: 'tv',
    category: 'movies',
    eraTag: 'TV3 · Especials Català',
    episodeHint: 'Col·lecció Pel·lícules',
    overviewCat:
      "Totes les pel·lícules i OVAs clàssiques del Dr. Slump i l'Arale doblades al català.",
    seasons: [{ seasonNumber: 1, name: 'Pel·lícules i OVAs', archiveId: 'OVAS-PELIS-DR-SLUMP' }],
  },
  {
    id: 'wicked-city-cat',
    titleCat: 'La Ciutat Maldita (Wicked City · 1080p)',
    originalTitle: 'Youjuu Toshi',
    tmdbId: 20541,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Yoshiaki Kawajiri · 1080p',
    episodeHint: 'Blu-ray 1080p Català',
    overviewCat:
      'El clàssic fosc de Yoshiaki Kawajiri restaurat en Blu-ray 1080p amb àudio en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Blu-ray 1080p Català',
        archiveId: 'wicked-city-1987-blu-ray-1440x-1080-cat',
      },
    ],
  },
  {
    id: 'saint-seiya-santuari-cat',
    titleCat: 'Saint Seiya: La Llegenda del Santuari',
    originalTitle: 'Saint Seiya: Legend of Sanctuary',
    tmdbId: 227707,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Cavallers del Zodíac · Català',
    episodeHint: 'Pel·lícula en català',
    overviewCat:
      'La batalla de les Dotze Cases del Santuari amb en Seiya i els Cavallers de Bronze en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula Completa',
        archiveId: 'saint-seiya-la-llegenda-del-santuari',
      },
    ],
  },
  // --- COL·LECCIÓ TOTSRUCS / MECANOSCRIT / 3XL / K3 EN CATALÀ ---
  {
    id: 'serial-experiments-lain-cat',
    titleCat: 'Serial Experiments Lain',
    originalTitle: 'Serial Experiments Lain',
    aliases: 'lain 3xl ciberpunk totsrucs',
    tmdbId: 1087,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'Canal 3XL · Obra de Culte',
    episodeHint: '13 capítols HD en català',
    overviewCat:
      'La Lain Iwakura endinsant-se al Wired en una de les obres mestres més hipnòtiques i llegendàries emeses al Canal 3XL en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (1–13 HD Català)',
        archiveId: 'serial-experiments-lain-9-hd-catala-480p-24fps-h-264-128kbit-aac',
      },
    ],
  },
  {
    id: 'candy-candy-cat',
    titleCat: 'Candy Candy',
    originalTitle: 'Candy Candy',
    aliases: 'candy tv3 classic totsrucs',
    tmdbId: 9160,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Clàssic Complet',
    episodeHint: '115 capítols en català',
    overviewCat:
      'La història clàssica i inoblidable de la Candy White amb els 115 capítols íntegres doblats en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (1–115 Català)',
        archiveId: 'CandyCandyCatalan',
      },
    ],
  },
  {
    id: 'reboot-cat',
    titleCat: 'ReBoot',
    originalTitle: 'ReBoot',
    aliases: 'reboot bob enzo mainframe k3 3xl totsrucs',
    tmdbId: 2121,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / 3XL · Clàssic Digital',
    episodeHint: '39 capítols en català',
    overviewCat:
      'En Bob, la Dot i l’Enzo defensant el sistema Mainframe dels virus Megabyte i Hexadecimal amb el doblatge mític en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: ' Temporades en Català (39 cap.)',
        archiveId: 'reboot_202601',
      },
    ],
  },
  {
    id: 'dome-beisbol-cat',
    titleCat: 'Dome, el petit geni del beisbol',
    originalTitle: 'Miracle Giants Dome-kun',
    aliases: 'dome beisbol tv3 k3 totsrucs',
    category: 'classics',
    eraTag: 'TV3 / K3 · Esports Clàssic',
    episodeHint: 'Sèrie completa en català',
    overviewCat:
      'En Dome新城 i els seus llançaments impossibles als Yomiuri Giants amb el doblatge clàssic en català de TV3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie en Català',
        archiveId: 'dome-el-petit-geni-del-beisbol',
      },
    ],
  },
  {
    id: 'os-gran-casa-blava-cat',
    titleCat: "L'ós de la gran casa blava",
    originalTitle: 'Bear in the Big Blue House',
    aliases: 'os de la gran casa blava totsrucs super3 k3',
    tmdbId: 207,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'Club Super3 · TotsRucs',
    episodeHint: '44 capítols en català',
    overviewCat:
      'El clàssic més estimat del Club Super3 rescatat per TotsRucs amb 44 episodis complets en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Col·lecció TotsRucs (44 cap. Català)',
        archiveId: 'los-de-la-gran-casa-blava',
      },
    ],
  },
  {
    id: 'sagwa-cat',
    titleCat: 'Sagwa, la gata siamesa',
    originalTitle: 'Sagwa, the Chinese Siamese Cat',
    aliases: 'sagwa k3 super3 totsrucs',
    tmdbId: 35104,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / Super3 · Català',
    episodeHint: '17 episodis en català',
    overviewCat:
      'Les aventures cal·ligràfiques de la gata Sagwa amb l’emissió clàssica en català de TV3 / K3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Episodis TV3Rip en Català',
        archiveId: 'sagwa-la-gata-siamesa-catala',
      },
    ],
  },
  {
    id: 'taro-alienigena-cat',
    titleCat: "Taro, l'alienígena",
    originalTitle: 'Uchuuujin Tanaka Tarou',
    aliases: 'taro alienigena k3 totsrucs',
    category: 'classics',
    eraTag: 'K3 · Humor Esbojarrat',
    episodeHint: 'Capítols en català',
    overviewCat:
      'Les bogeries surrealistes d’en Taro Tanaka a l’escola primària amb el doblatge en català del K3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Capítols Conservats en Català',
        archiveId: 'taro-lalienigena-catala',
      },
    ],
  },
  {
    id: 'castell-al-cel-ghibli-cat',
    titleCat: 'El Castell al Cel (Studio Ghibli · 1080p)',
    originalTitle: 'Tenkuu no Shiro Laputa',
    aliases: 'laputa castell al cel ghibli miyazaki totsrucs hakyra',
    tmdbId: 10515,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Studio Ghibli · TotsRucs 1080p',
    episodeHint: 'Blu-ray 1080p Català',
    overviewCat:
      "L'aventura llegendària d'en Pazu i la Sheeta cap a Laputa dirigida per Hayao Miyazaki, edició TotsRucs Blu-ray 1080p en català.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Edició TotsRucs BD 1080p Català',
        archiveId: 'sg-01-el-castell-al-cel-1986-bd.-1080p.-cat-esp-jpn.-h-264.8bit.-25-fps-hakyra-t',
      },
    ],
  },
  {
    id: 'akira-totsrucs-cat',
    titleCat: 'Akira (1988 · Edició TotsRucs 1080p)',
    originalTitle: 'Akira',
    aliases: 'akira kaneda tetsuo neo tokyo 3xl totsrucs',
    tmdbId: 149,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: '3XL / TotsRucs · BDRip 1080p',
    episodeHint: 'Pel·lícula 1080p Català',
    overviewCat:
      'Neo-Tokyo 2019: l’obra mestra ciberpunk de Katsuhiro Otomo en edició restaurada BDRip 1080p de TotsRucs amb àudio català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'BDRip 1080p TotsRucs',
        archiveId: 'akira-bdrip-1080p-h-264-ac-3-multiaudio-subs-kyaneros-shippuden-sanin-sondela-89-tots-rucs',
      },
    ],
  },
  {
    id: 'tortugues-ninja-1990-cat',
    titleCat: 'Les Tortugues Ninja (1990 · TotsRucs 1080p)',
    originalTitle: 'Teenage Mutant Ninja Turtles',
    aliases: 'tortugues ninja tmnt totsrucs 1990',
    tmdbId: 1498,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'TotsRucs.cat · BDRip 1080p',
    episodeHint: 'Pel·lícula 1080p en català',
    overviewCat:
      'El clàssic de 1990 d’en Leonardo, Raphael, Michelangelo i Donatello en 1080p amb el mític doblatge en català (TotsRucs.cat).',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula BDRip 1080p Català (TotsRucs)',
        archiveId: 'les-tortugues-ninja-1990-teenage-mutant-ninja-turtles-bdrip-1080p-x-264-ac-3-cat',
      },
    ],
  },
  {
    id: 'la-mascara-1994-cat',
    titleCat: 'La Màscara (1994 · Mecanoscrit / TotsRucs)',
    originalTitle: 'The Mask',
    aliases: 'la mascara jim carrey mecanoscrit totsrucs tv3',
    tmdbId: 854,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'TV3 / Mecanoscrit · 720p',
    episodeHint: 'Pel·lícula HD en català',
    overviewCat:
      'Jim Carrey amb l’icònic doblatge català de TV3 preservat per Mecanoscrit.cat i TotsRucs en alta definició.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'BRRip 720p Català (Mecanoscrit.cat)',
        archiveId: 'la-mascara-1994-brrip-720p-x-264-catala-english-per-hal-9000-mecanoscrit.cat',
      },
    ],
  },
];

export const CATALA_LIVE_CHANNELS: any[] = [
  {
    id: 'cat-sx3-live',
    dial: 1,
    name: 'SX3 / 33 · Anime i Infantil 24h',
    shortMark: 'SX3',
    brandTone: '#EC4899',
    network: '3Cat Catalunya',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Emissió oficial en directe amb anime en català (One Piece, Conan, Sakura, Haikyu)',
    channels: [
      {
        id: 'sx3-int-hls',
        label: 'Senyal Internacional 3Cat HD',
        lang: 'CAT',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/c33-super3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'sx3-24h-cat',
        label: 'Senyal SX3 24h Exclusiu (Espanya)',
        lang: 'CAT',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-cat.3catdirectes.cat/live-content/super3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cat-tv3-live',
    dial: 2,
    name: 'TV3 en Directe (3Cat)',
    shortMark: 'TV3',
    brandTone: '#E11D48',
    network: '3Cat Catalunya',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Televisió de Catalunya en directe: sèries, cinema en català i TN',
    channels: [
      {
        id: 'tv3-int-hls',
        label: 'Senyal Internacional TV3 HD',
        lang: 'CAT',
        quality: '1080p',
        sourceUrl: 'https://directes3-tv-int.3catdirectes.cat/live-content/tvi-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'tv3-cat-hls',
        label: 'Senyal Catalunya TV3 HD',
        lang: 'CAT',
        quality: '1080p',
        sourceUrl: 'https://directes3-tv-cat.3catdirectes.cat/live-content/tv3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cat-esport3-live',
    dial: 3,
    name: 'Esport3 en Directe',
    shortMark: 'E3',
    brandTone: '#F97316',
    network: '3Cat Esports',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Esports i retransmissions en directe en català',
    channels: [
      {
        id: 'esport3-int-hls',
        label: 'Senyal Oficial Esport3 HD',
        lang: 'CAT',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-origin/esport3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cat-324-live',
    dial: 4,
    name: '324 Notícies 24h',
    shortMark: '324',
    brandTone: '#EF4444',
    network: '3Cat Informatius',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Informació contínua 24 hores en català',
    channels: [
      {
        id: '324-int-hls',
        label: 'Senyal Oficial 324 HD',
        lang: 'CAT',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/canal324-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
];
