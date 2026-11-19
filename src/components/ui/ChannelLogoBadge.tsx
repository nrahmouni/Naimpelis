import React from 'react';
import type { SpanishTdtChannel, TdtCategory } from '../../types';
import type { FlagCode } from './LanguageBadge';
import { renderSpainAndSportsArtwork } from './channelArtworkSpainAndSports';

export type TvRegionId =
  | 'all'
  | 'es'
  | 'latam'
  | 'ar'
  | 'ma'
  | 'docs'
  | 'us'
  | 'eu'
  | 'uk'
  | 'cn'
  | 'world_cricket'
  | 'elahmad_mena'
  | 'adrar_europa';

export interface ChannelRegionMeta {
  region: Exclude<TvRegionId, 'all'>;
  flagCode: FlagCode;
  langTag: 'ES' | 'CAT' | 'EN' | 'AR' | 'FR' | 'DE' | 'IT' | 'PT' | 'TR' | 'NL' | 'RU' | '中文';
  countryEs: string;
  countryCa: string;
  countryEn: string;
}

export function getChannelRegionMeta(
  ch: Pick<SpanishTdtChannel, 'id' | 'category' | 'network' | 'countryCode'>
): ChannelRegionMeta {
  if (ch.category === 'world_cricket' || ch.id.startsWith('sport-') || ch.id.startsWith('fl-sport-')) {
    const cCode = (ch.countryCode || '').toLowerCase();
    const flagMap: Record<string, FlagCode> = {
      in: 'in',
      pk: 'pk',
      tr: 'tr',
      it: 'it',
      de: 'de',
      fr: 'fr',
      uk: 'uk',
      gb: 'uk',
      us: 'us',
      iq: 'iq',
      bh: 'bh',
    };
    const langTag: ChannelRegionMeta['langTag'] =
      cCode === 'tr' ? 'TR' : cCode === 'it' ? 'IT' : cCode === 'de' ? 'DE' : cCode === 'iq' || cCode === 'bh' ? 'AR' : 'EN';
    return {
      region: 'world_cricket',
      flagCode: flagMap[cCode] || 'all',
      langTag,
      countryEs: 'Deportes Mundial & Cricket (Sportzfy / Famelack)',
      countryCa: 'Esports Mundial i Cricket (Sportzfy / Famelack)',
      countryEn: 'World Sports & Cricket (Sportzfy / Famelack)',
    };
  }
  if (
    ch.category === 'elahmad_mena' ||
    ch.id.startsWith('elahmad-') ||
    (ch.category === 'kids_world' && ch.id.includes('cnarabia'))
  ) {
    const cCode = (ch.countryCode || '').toLowerCase();
    const inferredFlag: FlagCode =
      cCode === 'dz' || ch.id.includes('-dz-')
        ? 'dz'
        : cCode === 'eg' || ch.id.includes('-eg-')
        ? 'eg'
        : cCode === 'sa' || ch.id.includes('-sa-')
        ? 'sa'
        : cCode === 'ae' || ch.id.includes('-ae-')
        ? 'ae'
        : cCode === 'kw' || ch.id.includes('-kw-')
        ? 'kw'
        : cCode === 'om' || ch.id.includes('-om-')
        ? 'om'
        : cCode === 'qa' || ch.id.includes('-qa-')
        ? 'qa'
        : cCode === 'ma'
        ? 'ma'
        : 'ar';
    return {
      region: 'elahmad_mena',
      flagCode: inferredFlag,
      langTag: 'AR',
      countryEs: 'Elahmad MENA · Magreb · Golfo (العربية)',
      countryCa: 'Elahmad MENA · Magrib · Golf (العربية)',
      countryEn: 'Elahmad MENA · Maghreb · Gulf (Arabic)',
    };
  }
  if (ch.category === 'adrar_europa' || ch.id.startsWith('adrar-')) {
    const cCode = (ch.countryCode || '').toLowerCase();
    const flagMap: Record<string, { flag: FlagCode; lang: ChannelRegionMeta['langTag'] }> = {
      fr: { flag: 'fr', lang: 'FR' },
      de: { flag: 'de', lang: 'DE' },
      it: { flag: 'it', lang: 'IT' },
      tr: { flag: 'tr', lang: 'TR' },
      uk: { flag: 'uk', lang: 'EN' },
      gb: { flag: 'uk', lang: 'EN' },
      nl: { flag: 'nl', lang: 'NL' },
      be: { flag: 'be', lang: 'FR' },
      ru: { flag: 'ru', lang: 'RU' },
      es: { flag: 'es', lang: 'ES' },
    };
    const inferred =
      flagMap[cCode] ||
      (ch.id.includes('-fr-')
        ? flagMap.fr
        : ch.id.includes('-de-')
        ? flagMap.de
        : ch.id.includes('-it-')
        ? flagMap.it
        : ch.id.includes('-tr-')
        ? flagMap.tr
        : { flag: 'eu' as FlagCode, lang: 'EN' as ChannelRegionMeta['langTag'] });
    return {
      region: 'adrar_europa',
      flagCode: inferred.flag,
      langTag: inferred.lang,
      countryEs: 'ADRAR Europa · FR · DE · IT · TR · UK · NL · BE · RU',
      countryCa: 'ADRAR Europa · FR · DE · IT · TR · UK · NL · BE · RU',
      countryEn: 'ADRAR Europe · FR · DE · IT · TR · UK · NL · BE · RU',
    };
  }
  if (ch.category === 'china_football' || ch.id.startsWith('cn-')) {
    return {
      region: 'cn',
      flagCode: 'cn',
      langTag: '中文',
      countryEs: 'China · 中文',
      countryCa: 'Xina · 中文',
      countryEn: 'China · 中文',
    };
  }
  if (ch.category === 'marruecos' || ch.id.startsWith('ma-')) {
    const isFr = ch.id === 'ma-medi1-afrique';
    return {
      region: 'ma',
      flagCode: 'ma',
      langTag: isFr ? 'FR' : 'AR',
      countryEs: 'Marruecos · المغرب',
      countryCa: 'Marroc · المغرب',
      countryEn: 'Morocco · المغرب',
    };
  }
  if (ch.category === 'bein_arabic' || ch.id.startsWith('bein-ar-') || ch.id.startsWith('ar-')) {
    return {
      region: 'ar',
      flagCode: 'ar',
      langTag: 'AR',
      countryEs: 'beIN Árabe & MENA · العربية',
      countryCa: 'beIN Àrab i MENA · العربية',
      countryEn: 'beIN Arabic & MENA · العربية',
    };
  }
  if (ch.category === 'noticias_intl' || ch.id.startsWith('news-')) {
    const isEn = ch.id === 'news-aj-en' || ch.id === 'news-alarabiya-en' || ch.id === 'news-cnbc-eu';
    return {
      region: 'ar',
      flagCode: isEn ? 'all' : 'ar',
      langTag: isEn ? 'EN' : 'AR',
      countryEs: 'Noticias Mundiales (Al Jazeera / MENA)',
      countryCa: 'Notícies Mundials (Al Jazeera / MENA)',
      countryEn: 'World News (Al Jazeera / MENA)',
    };
  }
  if (ch.category === 'documentales' || ch.id.startsWith('doc-') || ch.id.startsWith('fl-doc-')) {
    const isEs =
      ch.id === 'doc-natgeo-latam' ||
      ch.id === 'doc-natgeo-mx' ||
      ch.id === 'doc-lovenature-es' ||
      ch.id === 'doc-pluto-naturaleza';
    const isAr = ch.id === 'doc-natgeo-ad';
    return {
      region: 'docs',
      flagCode: 'docs',
      langTag: isEs ? 'ES' : isAr ? 'AR' : 'EN',
      countryEs: 'Documentales & Ciencia (Nat Geo / Discovery)',
      countryCa: 'Documentals i Ciència (Nat Geo / Discovery)',
      countryEn: 'Documentaries & Science (Nat Geo / Discovery)',
    };
  }
  if (ch.category === 'usa_tv' || ch.id.startsWith('us-')) {
    const isEs = ch.id === 'us-cnn-es';
    return {
      region: 'us',
      flagCode: 'us',
      langTag: isEs ? 'ES' : 'EN',
      countryEs: 'Estados Unidos · FOX / NBC / CNN',
      countryCa: 'Estats Units · FOX / NBC / CNN',
      countryEn: 'United States · FOX / NBC / CNN',
    };
  }
  if (
    ch.category === 'europa_tv' ||
    ch.category === 'famelack_movies' ||
    ch.category === 'kids_world' ||
    ch.id.startsWith('eu-') ||
    ch.id.startsWith('fl-mov-') ||
    ch.id.startsWith('fl-kids-')
  ) {
    const langTag: ChannelRegionMeta['langTag'] = ch.id.endsWith('-es')
      ? 'ES'
      : ch.id.endsWith('-ar')
        ? 'AR'
        : ch.id.includes('france24-fr') || ch.id.endsWith('-fr') || ch.id === 'eu-bfmtv' || ch.id === 'eu-tv5monde'
          ? 'FR'
          : ch.id === 'eu-tagesschau24' || ch.id === 'eu-daserste'
            ? 'DE'
            : ch.id.startsWith('eu-rai')
              ? 'IT'
              : ch.id.startsWith('eu-rtp')
                ? 'PT'
                : 'EN';
    return {
      region: 'eu',
      flagCode: 'eu',
      langTag,
      countryEs: 'Europa & Mundial · Famelack / Free-TV',
      countryCa: 'Europa i Mundial · Famelack / Free-TV',
      countryEn: 'Europe & World · Famelack / Free-TV',
    };
  }
  if (ch.category === 'uk_sports' || ch.id.startsWith('uk-')) {
    return {
      region: 'uk',
      flagCode: 'uk',
      langTag: 'EN',
      countryEs: 'Reino Unido / USA · EN',
      countryCa: 'Regne Unit / USA · EN',
      countryEn: 'UK / USA · EN',
    };
  }
  if (
    ch.category === 'espn' ||
    ch.category === 'dsports' ||
    ch.category === 'tnt_space' ||
    ch.category === 'beinsports'
  ) {
    return {
      region: 'latam',
      flagCode: 'lat',
      langTag: 'ES',
      countryEs: 'Latam & Internacional · ES',
      countryCa: 'Llatinoamèrica i Int. · ES',
      countryEn: 'Latam & Int. · ES',
    };
  }

  const isCatala =
    ch.id.includes('3cat') ||
    ch.id.includes('tv3') ||
    ch.id.includes('sx3') ||
    ch.id.includes('esport3') ||
    ch.id.includes('324') ||
    /3cat|ccma/i.test(ch.network || '');

  return {
    region: 'es',
    flagCode: isCatala ? 'ca' : 'es',
    langTag: isCatala ? 'CAT' : 'ES',
    countryEs: 'España · TDT y Deportes',
    countryCa: 'Espanya · TDT i Esports',
    countryEn: 'Spain · TV & Sports',
  };
}

export function getCategoryRegion(category: 'all' | 'tdt_all' | TdtCategory): TvRegionId {
  if (category === 'world_cricket') return 'world_cricket';
  if (category === 'elahmad_mena') return 'elahmad_mena';
  if (category === 'adrar_europa') return 'adrar_europa';
  if (category === 'china_football') return 'cn';
  if (category === 'marruecos') return 'ma';
  if (category === 'bein_arabic' || category === 'noticias_intl') return 'ar';
  if (category === 'documentales') return 'docs';
  if (category === 'usa_tv') return 'us';
  if (category === 'europa_tv' || category === 'famelack_movies' || category === 'kids_world') return 'eu';
  if (category === 'uk_sports') return 'uk';
  if (
    category === 'espn' ||
    category === 'dsports' ||
    category === 'tnt_space' ||
    category === 'beinsports'
  ) {
    return 'latam';
  }
  if (category === 'all') return 'all';
  return 'es';
}

import {
  OFFICIAL_CHANNEL_LOGO_URLS,
  resolveOfficialChannelLogoUrl,
} from '../../shared/channelLogos';

export { OFFICIAL_CHANNEL_LOGO_URLS };

export function getOfficialChannelLogoUrl(
  ch: Pick<SpanishTdtChannel, 'id' | 'logoUrl'>
): string | null {
  return resolveOfficialChannelLogoUrl(ch);
}

interface ChannelLogoBadgeProps {
  channel: Pick<
    SpanishTdtChannel,
    'id' | 'name' | 'shortMark' | 'brandTone' | 'network' | 'category' | 'logoUrl'
  >;
  size?: 'sm' | 'md' | 'lg';
  showLangTag?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-9 h-9 rounded-xl',
  md: 'w-12 h-12 rounded-2xl',
  lg: 'w-14 h-14 rounded-2xl',
};

const RenderChannelArtwork: React.FC<{
  channel: ChannelLogoBadgeProps['channel'];
}> = ({ channel }) => {
  const { id, shortMark, brandTone } = channel;

  const spainAndSportsEl = renderSpainAndSportsArtwork(id);
  if (spainAndSportsEl) {
    return spainAndSportsEl;
  }

  // 21. Chinese Football (CCTV5 & Regional Sports)
  if (id.startsWith('cn-')) {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#7F1D1D" />
        <polygon points="15,12 17,17 22,17 18,20 19,25 15,22 11,25 12,20 8,17 13,17" fill="#FACC15" />
        <text
          x="32"
          y="44"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="12"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          {shortMark.slice(0, 6)}
        </text>
      </svg>
    );
  }

  // 22. beIN SPORTS Arabic
  if (id.startsWith('bein-ar-')) {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#4C1D95" />
        <rect x="6" y="10" width="52" height="18" rx="6" fill="#7C3AED" />
        <text x="32" y="23" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="900" fontFamily="system-ui, sans-serif">
          beIN
        </text>
        <text x="32" y="48" textAnchor="middle" fill="#E9D5FF" fontSize="13" fontWeight="900" fontFamily="system-ui, sans-serif">
          {shortMark}
        </text>
      </svg>
    );
  }

  // 23. National Geographic Yellow Border Crest
  if (id.startsWith('doc-natgeo')) {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#0A0A0D" />
        <rect x="13" y="12" width="14" height="20" fill="none" stroke="#FACC15" strokeWidth="4" />
        <text x="41" y="27" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="900" fontFamily="system-ui, sans-serif">
          NAT GEO
        </text>
        <text x="32" y="49" textAnchor="middle" fill="#FDE047" fontSize="9.5" fontWeight="800" fontFamily="system-ui, sans-serif">
          {shortMark}
        </text>
      </svg>
    );
  }

  // 24. Morocco SNRT / 2M / Medi1
  if (id.startsWith('ma-')) {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#7F1D1D" />
        <polygon points="32,10 34.5,17 42,17 36,21 38,28 32,24 26,28 28,21 22,17 29.5,17" fill="none" stroke="#16A34A" strokeWidth="2.2" />
        <text x="32" y="49" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="900" fontFamily="system-ui, sans-serif">
          {shortMark.slice(0, 6)}
        </text>
      </svg>
    );
  }

  // 25. Al Jazeera & International News
  if (id.startsWith('news-aj')) {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#1E1406" />
        <circle cx="32" cy="24" r="11" fill="#F59E0B" opacity="0.9" />
        <text x="32" y="50" textAnchor="middle" fill="#FEF3C7" fontSize="11" fontWeight="900" fontFamily="system-ui, sans-serif">
          {shortMark}
        </text>
      </svg>
    );
  }

  // 26. FOX USA
  if (id.startsWith('us-fox')) {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#0B1B3B" />
        <rect x="6" y="16" width="52" height="32" rx="8" fill="#1D4ED8" />
        <text x="32" y="38" textAnchor="middle" fill="#FFFFFF" fontSize="14" fontWeight="900" fontFamily="system-ui, sans-serif">
          {shortMark}
        </text>
      </svg>
    );
  }

  // Default Sculpted Broadcast Station Crest with channel tone
  const tone = brandTone || '#9146FF';
  const fontSize = shortMark.length > 5 ? 10 : shortMark.length > 3 ? 12.5 : 16;
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full">
      <defs>
        <linearGradient id={`ch-grad-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.88" />
          <stop offset="100%" stopColor="#090A10" stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#ch-grad-${id})`} />
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="13.5"
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1.2"
      />
      <text
        x="32"
        y={32 + fontSize * 0.36}
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize={fontSize}
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
      >
        {shortMark}
      </text>
    </svg>
  );
};

export const ChannelLogoBadge: React.FC<ChannelLogoBadgeProps> = ({
  channel,
  size = 'md',
  className = '',
}) => {
  const officialLogoUrl = getOfficialChannelLogoUrl(channel);
  const [imgFailed, setImgFailed] = React.useState(false);

  React.useEffect(() => {
    setImgFailed(false);
  }, [officialLogoUrl, channel.id]);

  const showOfficialImg = Boolean(officialLogoUrl && !imgFailed);
  const tone = channel.brandTone || '#9146FF';

  return (
    <div
      className={`relative shrink-0 select-none shadow-md ${SIZE_CLASSES[size]} ${className}`}
    >
      <div
        className={`w-full h-full overflow-hidden rounded-[inherit] border flex items-center justify-center relative ${
          showOfficialImg
            ? 'bg-white/[0.11] border-white/[0.18]'
            : 'bg-[#121521] border-white/[0.14]'
        }`}
        style={
          showOfficialImg
            ? {
                backgroundImage: `radial-gradient(circle at 50% 42%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.07) 60%, ${tone}28 100%)`,
              }
            : undefined
        }
      >
        {showOfficialImg ? (
          <img
            src={officialLogoUrl!}
            alt={channel.name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-[82%] h-[82%] object-contain drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
          />
        ) : (
          <RenderChannelArtwork channel={channel} />
        )}
      </div>
    </div>
  );
};
