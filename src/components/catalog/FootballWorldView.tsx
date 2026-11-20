import React from 'react';
import { Loader2, SlidersHorizontal, Star } from 'lucide-react';
import type {
  AppLanguage,
  FavoriteChannelItem,
  SpanishTdtChannel,
  SportsMatch,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { buildChannelFavId } from '../../utils/storage';
import { ChannelLogoBadge, getChannelRegionMeta } from '../ui/ChannelLogoBadge';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import { BottomSheet, SegmentedControl } from '../ui/DesignSystem';
import type { FootballBrandFilter } from './useLiveTvAndSportsCatalog';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const FootballMatchboard = lazyWithRetry(() =>
  import('../FootballMatchboard').then((m) => ({ default: m.FootballMatchboard }))
);

interface PullState {
  containerRef: React.RefObject<HTMLDivElement | null>;
  pullHandlers: Record<string, unknown>;
  pullDistance: number;
  isRefreshing: boolean;
}

interface FootballWorldViewProps {
  lang: AppLanguage;
  shareRoomId?: string;
  pull: PullState;
  effectiveFutbolTab: 'matches' | 'channels';
  setEffectiveFutbolTab: (tab: 'matches' | 'channels') => void;
  futbolFiltersOpen: boolean;
  setFutbolFiltersOpen: (open: boolean) => void;
  futbolLeagueFilter: string;
  setFutbolLeagueFilter: (val: string) => void;
  futbolLangFilter: 'all' | 'ZH';
  setFutbolLangFilter: (val: 'all' | 'ZH') => void;
  footballLiveBrand: FootballBrandFilter;
  setFootballLiveBrand: (val: FootballBrandFilter) => void;
  sportsSearch: string;
  setSportsSearch: (val: string) => void;
  activeVideoRawUrl: string;
  loadingItemId: string | null;
  loadingTdt: boolean;
  footballSectionLiveChannels: SpanishTdtChannel[];
  footballNetworkCounts: Record<string, number>;
  isChannelFavorited: (favId: string) => boolean;
  onToggleChannelFavorite: (entry: Omit<FavoriteChannelItem, 'addedAt'>) => void;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlaySecondaryChannel?: (opts: {
    sourceUrl: string;
    title: string;
    subtitle?: string;
  }) => void;
  onPlayTdtChannel: (
    channel: SpanishTdtChannel,
    signalIndex?: number,
    liveProgramHint?: string
  ) => void;
}

export const FootballWorldView: React.FC<FootballWorldViewProps> = ({
  lang,
  shareRoomId,
  pull,
  effectiveFutbolTab,
  setEffectiveFutbolTab,
  futbolFiltersOpen,
  setFutbolFiltersOpen,
  futbolLeagueFilter,
  setFutbolLeagueFilter,
  futbolLangFilter,
  setFutbolLangFilter,
  footballLiveBrand,
  setFootballLiveBrand,
  sportsSearch,
  setSportsSearch,
  activeVideoRawUrl,
  loadingItemId,
  loadingTdt,
  footballSectionLiveChannels,
  footballNetworkCounts,
  isChannelFavorited,
  onToggleChannelFavorite,
  onPlaySportsMatch,
  onPlaySecondaryChannel,
  onPlayTdtChannel,
}) => {
  const activeFilterCount =
    (futbolLeagueFilter ? 1 : 0) + (footballLiveBrand !== 'all' ? 1 : 0);

  return (
    <div ref={pull.containerRef} {...pull.pullHandlers} className="space-y-4">
      {pull.pullDistance > 10 && (
        <div className="text-center text-xs text-[#BF94FF] font-semibold py-1">
          {pull.isRefreshing
            ? pickLang(lang, {
                es: 'Actualizando...',
                ca: 'Actualitzant...',
                en: 'Refreshing...',
              })
            : pickLang(lang, {
                es: 'Suelta para actualizar',
                ca: 'Deixa anar per actualitzar',
                en: 'Release to refresh',
              })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <SegmentedControl
            layoutId="futbol-main-tabs"
            value={effectiveFutbolTab}
            onChange={(tTab) => {
              triggerHaptic('light');
              setEffectiveFutbolTab(tTab);
            }}
            options={[
              { id: 'matches', label: pickLang(lang, { es: 'Partidos', ca: 'Partits', en: 'Matches' }) },
              { id: 'channels', label: pickLang(lang, { es: 'Canales', ca: 'Canals', en: 'Channels' }) },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setFutbolFiltersOpen(true);
          }}
          className={`min-h-12 px-4 rounded-2xl border text-xs font-bold inline-flex items-center gap-2 shrink-0 cursor-pointer active:scale-95 transition-all ${
            activeFilterCount > 0
              ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_6px_18px_rgba(145,70,255,0.3)]'
              : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.09] text-zinc-200'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 text-[#BF94FF]" />
          <span>{pickLang(lang, { es: 'Filtros', ca: 'Filtres', en: 'Filters' })}</span>
          {activeFilterCount > 0 && (
            <span className="font-mono text-[11px] tabular-nums opacity-90">
              · {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {effectiveFutbolTab === 'matches' ? (
        <React.Suspense
          fallback={
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
            </div>
          }
        >
          <FootballMatchboard
            lang={lang}
            shareRoomId={shareRoomId}
            searchQuery={sportsSearch}
            onSearchQueryChange={setSportsSearch}
            langFilter={futbolLangFilter}
            leagueFilter={futbolLeagueFilter}
            onSelectLeagueFilter={setFutbolLeagueFilter}
            brandFilter={footballLiveBrand}
            onClearCalendarScope={() => {
              setSportsSearch('');
              setFutbolLeagueFilter('');
            }}
            onResetFilters={() => {
              setSportsSearch('');
              setFutbolLeagueFilter('');
              setFootballLiveBrand('all');
              setFutbolLangFilter('all');
            }}
            activeVideoRawUrl={activeVideoRawUrl}
            loadingItemId={loadingItemId}
            onPlaySportsMatch={onPlaySportsMatch}
            onPlaySecondaryChannel={
              onPlaySecondaryChannel
                ? (m, idx) =>
                    onPlaySecondaryChannel({
                      sourceUrl: m.channels[idx]?.sourceUrl || '',
                      title: m.title,
                      subtitle: m.competition,
                    })
                : undefined
            }
            isChannelFavorited={isChannelFavorited}
            onToggleChannelFavorite={onToggleChannelFavorite}
          />
        </React.Suspense>
      ) : (
        <div className="space-y-2">
          {loadingTdt && footballSectionLiveChannels.length === 0 ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
            </div>
          ) : footballSectionLiveChannels.length === 0 ? (
            <div className="py-10 rounded-3xl bg-white/[0.03] border border-white/[0.08] text-center text-sm text-zinc-400">
              {pickLang(lang, {
                es: 'No hay canales con este filtro.',
                ca: 'No hi ha canals amb aquest filtre.',
                en: 'No channels match this filter.',
              })}
            </div>
          ) : (
            footballSectionLiveChannels.map((ch) => {
              const favId = buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name);
              const faved = isChannelFavorited(favId);
              const regMeta = getChannelRegionMeta(ch);
              const isPlaying = Boolean(
                activeVideoRawUrl &&
                  ch.channels.some((s) => s.sourceUrl === activeVideoRawUrl)
              );
              return (
                <div
                  key={ch.id}
                  className={`relative group min-h-[72px] p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                    isPlaying
                      ? 'border-[#9146FF] bg-[#9146FF]/[0.1]'
                      : 'bg-white/[0.03] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.055]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayTdtChannel(ch, 0);
                    }}
                    aria-label={`${pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })} ${ch.name}`}
                    className="absolute inset-0 z-0 rounded-2xl cursor-pointer"
                  />

                  <div className="relative z-10 flex-1 min-w-0 flex items-center gap-3 pointer-events-none">
                    <ChannelLogoBadge channel={ch} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold text-sm text-white leading-snug break-words flex items-baseline flex-wrap gap-x-1.5">
                        <span className="break-words">{ch.name}</span>
                        <span className="text-xs font-medium text-zinc-400 shrink-0">
                          · {regMeta.langTag}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">
                        {ch.category === 'china_football'
                          ? pickLang(lang, {
                              es: 'China · Fútbol Internacional HD',
                              ca: 'Xina · Futbol Internacional HD',
                              en: 'China · World Football HD',
                            })
                          : ch.network}
                      </p>
                    </div>
                  </div>

                  <div className="relative z-10 flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleChannelFavorite({
                          favId,
                          title: ch.name,
                          channelLabel: ch.shortMark,
                          channelUrl: ch.channels[0]?.sourceUrl || '',
                          competition: ch.network,
                          sport: 'soccer',
                        });
                      }}
                      aria-label={pickLang(lang, { es: 'Favorito', ca: 'Favorit', en: 'Favorite' })}
                      className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                        faved
                          ? 'text-[#C4A7FF] bg-[#9146FF]/15'
                          : 'text-zinc-400 hover:text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${faved ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <BottomSheet
        isOpen={futbolFiltersOpen}
        onClose={() => setFutbolFiltersOpen(false)}
        lang={lang}
        title={pickLang(lang, { es: 'Filtros de Fútbol', ca: 'Filtres de Futbol', en: 'Football Filters' })}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {pickLang(lang, {
                es: 'Ligas (filtra partidos)',
                ca: 'Lligues (filtra partits)',
                en: 'Leagues (filters matches)',
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: '', label: pickLang(lang, { es: 'Todas', ca: 'Totes', en: 'All', zh: '全部', rif: 'Akk' }) },
                { id: 'barca_madrid', label: pickLang(lang, { es: 'Barça y Madrid', ca: 'Barça i Madrid', en: 'Barça & Madrid', zh: '巴萨与皇马', rif: 'Barça d Madrid' }) },
                { id: 'espana', label: pickLang(lang, { es: 'Selección Española', ca: 'Selecció Espanyola', en: 'Spain NT', zh: '西班牙国家队', rif: 'Spanya' }) },
                { id: 'champions', label: 'Champions League' },
                { id: 'laliga', label: 'LaLiga' },
                { id: 'hypermotion', label: 'LaLiga Hypermotion' },
                { id: 'premier', label: 'Premier League' },
                { id: 'europa', label: 'Europa League' },
                { id: 'serie a', label: 'Serie A' },
                { id: 'bundesliga', label: 'Bundesliga' },
                { id: 'world', label: pickLang(lang, { es: 'Selecciones', ca: 'Seleccions', en: 'Internationals', zh: '国家队赛事', rif: 'Tiraqimin n tmura' }) },
              ].map((lg) => (
                <button
                  key={lg.id || 'all-lg'}
                  type="button"
                  onClick={() => {
                    setFutbolLeagueFilter(lg.id);
                    if (lg.id && effectiveFutbolTab !== 'matches') {
                      setEffectiveFutbolTab('matches');
                    }
                  }}
                  className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    futbolLeagueFilter === lg.id
                      ? 'bg-[#9146FF] border-[#9146FF] text-white'
                      : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.09]'
                  }`}
                >
                  {lg.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {pickLang(lang, {
                es: 'Redes de Canales (filtra señales)',
                ca: 'Xarxes de Canals (filtra senyals)',
                en: 'Channel Networks (filters feeds)',
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'all', flagCode: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }) },
                  { id: 'dazn', flagCode: 'es', label: 'DAZN (España · Prioritario)' },
                  { id: 'movistar', flagCode: 'es', label: 'Movistar Plus+ (España)' },
                  { id: 'china_football', flagCode: 'cn', label: pickLang(lang, { es: 'Fútbol China (CCTV-5)', ca: 'Futbol Xina (CCTV-5)', en: 'China Football (CCTV-5)' }) },
                  { id: 'bein_arabic', flagCode: 'qa', label: pickLang(lang, { es: 'beIN SPORTS (Árabe)', ca: 'beIN SPORTS (Àrab)', en: 'beIN SPORTS (Arabic)' }) },
                  { id: 'uk_sports', flagCode: 'uk', label: pickLang(lang, { es: 'Deportes Reino Unido (EN)', ca: 'Esports Regne Unit (EN)', en: 'UK Sports (EN)' }) },
                  { id: 'beinsports', flagCode: 'all', label: 'beIN SPORTS (Global)' },
                  { id: 'espn', flagCode: 'lat', label: 'ESPN (1–7)' },
                  { id: 'dsports', flagCode: 'lat', label: 'DSports' },
                  { id: 'tnt_space', flagCode: 'lat', label: 'TNT y Space' },
                  { id: 'world_cricket', flagCode: 'all', label: 'Cricket & Mundial' },
                ] as const
              ).map((br) => {
                const netCount = footballNetworkCounts[br.id] ?? 0;
                const active = footballLiveBrand === br.id;
                return (
                  <button
                    key={br.id}
                    type="button"
                    onClick={() => {
                      setFootballLiveBrand(br.id);
                      if (br.id !== 'china_football' && br.id !== 'all') {
                        setFutbolLangFilter('all');
                      }
                    }}
                    className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#9146FF] border-[#9146FF] text-white'
                        : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.09]'
                    }`}
                  >
                    <FlagBadgeSvg code={br.flagCode} className="w-4 h-2.5 shrink-0" />
                    <span>{br.label}</span>
                    <span
                      className={`text-[11px] font-mono tabular-nums ${
                        active ? 'text-white/85' : 'text-zinc-400'
                      }`}
                    >
                      ({netCount})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setFutbolLangFilter('all');
                setFutbolLeagueFilter('');
                setFootballLiveBrand('all');
              }}
              className="flex-1 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-white cursor-pointer"
            >
              {pickLang(lang, { es: 'Limpiar', ca: 'Netejar', en: 'Reset' })}
            </button>
            <button
              type="button"
              onClick={() => setFutbolFiltersOpen(false)}
              className="flex-1 min-h-12 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white cursor-pointer"
            >
              {pickLang(lang, { es: 'Aplicar', ca: 'Aplicar', en: 'Apply' })}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};
