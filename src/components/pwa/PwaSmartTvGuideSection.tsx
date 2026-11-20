import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCheck,
  Copy,
  ExternalLink,
  Flame,
  Link as LinkIcon,
  ListOrdered,
  Sparkles,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import {
  RiffanDownloadIcon,
  RiffanLiveIcon,
  RiffanSearchIcon,
} from '../ui/RiffanIcons';
import type { SmartTvChannelInfo } from './smartTvCatalogData';

const GUIDE_PREVIEW_BATCH = 60;

interface PwaSmartTvGuideSectionProps {
  lang: AppLanguage;
  totalCount: number;
  dynamicChannels: SmartTvChannelInfo[];
  tizenTab: 'guide' | 'channels' | 'urls';
  onChangeTizenTab: (tab: 'guide' | 'channels' | 'urls') => void;
  channelSearch: string;
  onChangeChannelSearch: (value: string) => void;
  selectedCategory: string;
  onChangeSelectedCategory: (catId: string) => void;
  copiedType: 'm3u' | 'epg' | 'tv' | null;
  m3uUrl: string;
  m3uDownloadUrl: string;
  epgUrl: string;
  epgDownloadUrl: string;
  tvReceiverUrl: string;
  onCopy: (text: string, type: 'm3u' | 'epg' | 'tv') => void;
  onBack: () => void;
}

export const PwaSmartTvGuideSection: React.FC<PwaSmartTvGuideSectionProps> = ({
  lang,
  totalCount,
  dynamicChannels,
  tizenTab,
  onChangeTizenTab,
  channelSearch,
  onChangeChannelSearch,
  selectedCategory,
  onChangeSelectedCategory,
  copiedType,
  m3uUrl,
  m3uDownloadUrl,
  epgUrl,
  epgDownloadUrl,
  tvReceiverUrl,
  onCopy,
  onBack,
}) => {
  const [visibleLimit, setVisibleLimit] = useState(GUIDE_PREVIEW_BATCH);

  useEffect(() => {
    setVisibleLimit(GUIDE_PREVIEW_BATCH);
  }, [channelSearch, selectedCategory, tizenTab]);

  const categoryFilters = useMemo(() => {
    const counts: Record<string, number> = { all: dynamicChannels.length };
    dynamicChannels.forEach((c) => {
      const cat = c.category || 'generalistas';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const candidates = [
      { id: 'all', label: `Todos (${dynamicChannels.length})` },
      { id: 'movistar', label: `Fútbol M+ (${counts['movistar'] || 0})` },
      { id: 'dazn', label: `DAZN & F1 (${counts['dazn'] || 0})` },
      { id: 'world_cricket', label: `Fútbol & Cricket (${counts['world_cricket'] || 0})` },
      { id: 'generalistas', label: `TDT España (${counts['generalistas'] || 0})` },
      { id: 'cine_series', label: `Cine & Series (${counts['cine_series'] || 0})` },
      { id: 'famelack_movies', label: `Cine 24/7 (${counts['famelack_movies'] || 0})` },
      { id: 'documentales', label: `Documentales (${counts['documentales'] || 0})` },
      { id: 'bein_arabic', label: `beIN Sports (${counts['bein_arabic'] || 0})` },
      { id: 'marruecos', label: `Marruecos (${counts['marruecos'] || 0})` },
      { id: 'elahmad_mena', label: `Elahmad MENA (${counts['elahmad_mena'] || 0})` },
      { id: 'adrar_europa', label: `ADRAR Europa (${counts['adrar_europa'] || 0})` },
      { id: 'europa_tv', label: `TV Europa (${counts['europa_tv'] || 0})` },
      { id: 'usa_tv', label: `EE.UU. (${counts['usa_tv'] || 0})` },
      { id: 'espn', label: `ESPN (${counts['espn'] || 0})` },
      { id: 'dsports', label: `DSports (${counts['dsports'] || 0})` },
      { id: 'uk_sports', label: `UK Sports (${counts['uk_sports'] || 0})` },
      { id: 'china_football', label: `China 中文 (${counts['china_football'] || 0})` },
      { id: 'kids_world', label: `Infantil Mundial (${counts['kids_world'] || 0})` },
      { id: 'infantil_autonomicas', label: `Autonómicas (${counts['infantil_autonomicas'] || 0})` },
    ];

    return candidates.filter((item) => item.id === 'all' || (counts[item.id] || 0) > 0);
  }, [dynamicChannels]);

  const filteredChannels = useMemo(() => {
    const q = channelSearch.trim().toLowerCase();
    return dynamicChannels.filter((c) => {
      const matchCat = selectedCategory === 'all' || c.category === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.groupTitle && c.groupTitle.toLowerCase().includes(q)) ||
        (c.shortMark && c.shortMark.toLowerCase().includes(q)) ||
        String(c.dial).includes(q)
      );
    });
  }, [dynamicChannels, selectedCategory, channelSearch]);

  const displayedChannels = channelSearch.trim()
    ? filteredChannels
    : filteredChannels.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, filteredChannels.length - displayedChannels.length);

  return (
    <div className="space-y-4">
      {/* Back button & top navigation */}
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/[0.08] flex-wrap">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onBack();
          }}
          className="min-h-10 flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#A78BFA]" />
          <span>
            {pickLang(lang, {
              es: 'Volver a opciones',
              ca: 'Tornar a opcions',
              en: 'Back to options',
            })}
          </span>
        </button>

        <span className="px-2.5 py-1 rounded-full bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-[#DDD6FE] text-[11px] font-bold flex items-center gap-1.5 tabular-nums">
          <RiffanLiveIcon size={14} animate="always" />
          <span>+{totalCount} Canales en Directo</span>
        </span>
      </div>

      {/* Separated Download & Copy Cards: PASO 1 M3U & PASO 2 EPG XML */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="p-3.5 rounded-2xl bg-[#0D0D12] border border-white/[0.08] flex flex-col justify-between gap-2.5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#A78BFA]">
              {pickLang(lang, {
                es: 'Paso 1 · Lista de Canales (M3U)',
                ca: 'Pas 1 · Llista de Canals (M3U)',
                en: 'Step 1 · Channel List (M3U)',
              })}
            </div>
            <p className="text-xs font-bold text-white mt-0.5">RIFFANTV-IPTV.m3u</p>
            <p className="text-[11px] text-zinc-400 font-mono break-all mt-0.5">{m3uUrl}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={m3uDownloadUrl}
              download="RIFFANTV-IPTV.m3u"
              onClick={() => triggerHaptic('medium')}
              className="flex-1 min-h-10 px-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <RiffanDownloadIcon size={14} />
              <span>{pickLang(lang, { es: 'Descargar .m3u', ca: 'Descarregar .m3u', en: 'Download .m3u' })}</span>
            </a>
            <button
              type="button"
              onClick={() => onCopy(m3uUrl, 'm3u')}
              className="min-h-10 px-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] text-zinc-100 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              {copiedType === 'm3u' ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedType === 'm3u' ? 'OK' : pickLang(lang, { es: 'Copiar', ca: 'Copiar', en: 'Copy' })}</span>
            </button>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#0D0D12] border border-emerald-400/25 flex flex-col justify-between gap-2.5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              {pickLang(lang, {
                es: 'Paso 2 · Guía EPG / XML (XMLTV)',
                ca: 'Pas 2 · Guia EPG / XML (XMLTV)',
                en: 'Step 2 · EPG Guide / XML (XMLTV)',
              })}
            </div>
            <p className="text-xs font-bold text-white mt-0.5">RIFFANTV-EPG.xml</p>
            <p className="text-[11px] text-zinc-400 font-mono break-all mt-0.5">{epgUrl}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={epgDownloadUrl}
              download="RIFFANTV-EPG.xml"
              onClick={() => triggerHaptic('medium')}
              className="flex-1 min-h-10 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <RiffanDownloadIcon size={14} />
              <span>{pickLang(lang, { es: 'Descargar .xml', ca: 'Descarregar .xml', en: 'Download .xml' })}</span>
            </a>
            <button
              type="button"
              onClick={() => onCopy(epgUrl, 'epg')}
              className="min-h-10 px-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] text-zinc-100 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              {copiedType === 'epg' ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedType === 'epg' ? 'OK' : pickLang(lang, { es: 'Copiar', ca: 'Copiar', en: 'Copy' })}</span>
            </button>
          </div>
        </div>
      </div>

      {/* What is EPG / XML explainer */}
      <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 text-[11px] text-zinc-200 leading-relaxed">
        <strong className="text-emerald-300">
          {pickLang(lang, {
            es: '¿Por qué a veces tu app pide un EPG o XML? ',
            ca: 'Per què de vegades la teva app demana un EPG o XML? ',
            en: 'Why do IPTV apps ask for an EPG or XML URL? ',
          })}
        </strong>
        {pickLang(lang, {
          es: 'La lista M3U carga los canales de vídeo, mientras que el archivo EPG XML añade la programación en directo, horarios y logos en tu TV.',
          ca: 'La llista M3U carrega els canals de vídeo, mentre que el fitxer EPG XML afegeix la programació en directe, horaris i logotips a la teva TV.',
          en: 'The M3U playlist loads the live video channels, while the EPG XML file populates TV schedules, show info, and channel logos.',
        })}
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex items-center p-1 rounded-xl bg-[#0D0D12] border border-white/[0.08] text-xs font-semibold gap-1">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onChangeTizenTab('guide');
          }}
          className={`flex-1 min-h-9 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            tizenTab === 'guide' ? 'bg-[#7C3AED] text-white shadow-md' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{pickLang(lang, { es: 'Cómo configurar', ca: 'Com configurar', en: 'Setup Guide' })}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onChangeTizenTab('channels');
          }}
          className={`flex-1 min-h-9 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            tizenTab === 'channels' ? 'bg-[#7C3AED] text-white shadow-md' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          <span>{pickLang(lang, { es: `Canales (${dynamicChannels.length})`, ca: `Canals (${dynamicChannels.length})`, en: `Channels (${dynamicChannels.length})` })}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onChangeTizenTab('urls');
          }}
          className={`flex-1 min-h-9 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            tizenTab === 'urls' ? 'bg-[#7C3AED] text-white shadow-md' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          <span>{pickLang(lang, { es: 'Rutas URL', ca: 'Rutes URL', en: 'URLs' })}</span>
        </button>
      </div>

      {/* TAB 1: STEP-BY-STEP SETUP GUIDE */}
      {tizenTab === 'guide' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-[#0D0D12] border border-white/[0.08] space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#7C3AED]/20 text-[#A78BFA] text-xs font-black flex items-center justify-center">
                1
              </span>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Samsung Smart TV (Tizen) & LG (webOS)
              </h4>
            </div>
            <ol className="text-xs text-zinc-300 space-y-1.5 pl-7 list-decimal leading-relaxed">
              <li>
                Instala <strong className="text-white">IBO Player</strong>,{' '}
                <strong className="text-white">IPTV Smarters Pro</strong> o{' '}
                <strong className="text-white">Smart IPTV (SIPTV)</strong> desde Samsung Apps o LG Content Store.
              </li>
              <li>
                En <strong className="text-white">Playlist / M3U URL</strong> pega:{' '}
                <code className="text-[#A78BFA] break-all">{m3uUrl}</code> (o sube el archivo <code className="text-white">RIFFANTV-IPTV.m3u</code>).
              </li>
              <li>
                En <strong className="text-white">EPG / XMLTV URL</strong> pega:{' '}
                <code className="text-emerald-300 break-all">{epgUrl}</code> (o sube <code className="text-white">RIFFANTV-EPG.xml</code>).
              </li>
            </ol>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0D0D12] border border-white/[0.08] space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-black flex items-center justify-center">
                2
              </span>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Android TV / Google TV / TiviMate / VLC
              </h4>
            </div>
            <ol className="text-xs text-zinc-300 space-y-1.5 pl-7 list-decimal leading-relaxed">
              <li>
                Abre <strong className="text-white">TiviMate</strong>, <strong className="text-white">Televizo</strong>, <strong className="text-white">GSE Smart IPTV</strong> o <strong className="text-white">VLC</strong>.
              </li>
              <li>
                Elige <strong className="text-white">Añadir Lista M3U</strong> → introduce <code className="text-[#A78BFA] break-all">{m3uUrl}</code>.
              </li>
              <li>
                En <strong className="text-white">Fuente EPG (XMLTV)</strong> añade <code className="text-emerald-300 break-all">{epgUrl}</code> y pulsa <em>Actualizar guía</em>.
              </li>
            </ol>
          </div>

          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#7C3AED]/15 to-[#0D0D12] border border-[#7C3AED]/30 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#A78BFA]" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Receptor Web Directo · /tv
                </h4>
              </div>
              <span className="text-[11px] font-semibold text-[#A78BFA]">Sin apps extra</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Abre el navegador de tu Smart TV y ve a{' '}
              <strong className="text-white break-all">{tvReceiverUrl}</strong>. Aparecerá un código de 4 dígitos para emparejar tu móvil al instante.
            </p>
            <a
              href={tvReceiverUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full min-h-10 px-3 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Abrir {tvReceiverUrl}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* TAB 2: ALL CHANNELS PREVIEW & SEARCH */}
      {tizenTab === 'channels' && (
        <div className="space-y-3">
          <div className="relative">
            <RiffanSearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={channelSearch}
              onChange={(e) => onChangeChannelSearch(e.target.value)}
              placeholder="Buscar canal: La 1, Movistar, DAZN, Nat Geo, beIN..."
              className="w-full min-h-11 pl-10 pr-3 rounded-xl bg-[#000000] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {categoryFilters.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onChangeSelectedCategory(cat.id);
                }}
                className={`min-h-8 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-[#0D0D12] border border-white/[0.08] hover:bg-white/[0.08] text-zinc-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
            <span className="tabular-nums">Mostrando {filteredChannels.length} canales</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <Flame className="w-3 h-3" />
              HD 1080p sin anuncios
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
            {filteredChannels.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400">
                No se encontraron canales con ese término de búsqueda.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {displayedChannels.map((ch) => (
                    <div
                      key={ch.id}
                      className="p-2.5 rounded-xl bg-[#0D0D12] border border-white/[0.08] flex items-start justify-between gap-2.5 text-left"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] text-white shrink-0 shadow-sm mt-0.5"
                          style={{ backgroundColor: ch.brandTone || '#7C3AED' }}
                        >
                          {ch.shortMark || String(ch.dial)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-white leading-snug break-words">
                            {ch.name}
                          </span>
                          <span className="block text-[10px] text-zinc-400 leading-snug break-words">
                            {ch.groupTitle}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 text-[10px] font-semibold font-mono tabular-nums">
                          Dial {ch.dial}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                          {ch.quality || '1080p'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {hiddenCount > 0 && (
                  <div className="pt-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setVisibleLimit((prev) => prev + GUIDE_PREVIEW_BATCH);
                      }}
                      className="min-h-10 px-4 rounded-xl bg-[#0D0D12] hover:bg-[#171722] border border-white/[0.12] text-xs font-bold text-white cursor-pointer transition-colors"
                    >
                      Ver más canales (+{Math.min(GUIDE_PREVIEW_BATCH, hiddenCount)} de {hiddenCount})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: COPYABLE URLS & IPTV SERVERS */}
      {tizenTab === 'urls' && (
        <div className="space-y-3.5">
          <div className="p-3.5 rounded-2xl bg-[#0D0D12] border border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <RiffanLiveIcon size={14} />
                URL de la Lista M3U
              </span>
              <button
                type="button"
                onClick={() => onCopy(m3uUrl, 'm3u')}
                className="flex items-center gap-1 text-[11px] font-bold text-[#A78BFA] hover:text-[#DDD6FE] transition-colors cursor-pointer"
              >
                {copiedType === 'm3u' ? (
                  <>
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar URL</span>
                  </>
                )}
              </button>
            </div>
            <div className="p-2.5 rounded-xl bg-[#000000] border border-white/[0.08] font-mono text-xs text-zinc-200 select-all break-all">
              {m3uUrl}
            </div>
            <p className="text-[11px] text-zinc-400">
              Introduce esta dirección en el campo <strong>«Playlist URL»</strong> o{' '}
              <strong>«M3U Link»</strong> de tu app IPTV.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0D0D12] border border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                URL de la Guía EPG XML
              </span>
              <button
                type="button"
                onClick={() => onCopy(epgUrl, 'epg')}
                className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
              >
                {copiedType === 'epg' ? (
                  <>
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar URL</span>
                  </>
                )}
              </button>
            </div>
            <div className="p-2.5 rounded-xl bg-[#000000] border border-white/[0.08] font-mono text-xs text-zinc-200 select-all break-all">
              {epgUrl}
            </div>
            <p className="text-[11px] text-zinc-400">
              Introduce esta dirección en el campo <strong>«EPG URL»</strong> o{' '}
              <strong>«XMLTV Link»</strong> para cargar la programación completa.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-[#0D0D12] border border-white/[0.08] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="block text-xs font-bold text-white">Receptor Web TV (/tv)</span>
              <span className="block text-[11px] text-zinc-400 break-all">{tvReceiverUrl}</span>
            </div>
            <button
              type="button"
              onClick={() => onCopy(tvReceiverUrl, 'tv')}
              className="min-h-10 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
            >
              {copiedType === 'tv' ? (
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-[#A78BFA]" />
              )}
              <span>{copiedType === 'tv' ? '¡Listo!' : 'Copiar'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
