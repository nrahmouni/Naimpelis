import React, { useState } from 'react';
import {
  CheckCheck,
  Copy,
  Download,
  FileCode2,
  ListVideo,
  Smartphone,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import {
  buildEpgXmlUrl,
  buildM3uPlaylistUrl,
  buildTvPairingUrl,
} from '../../utils/shortLink';

interface TvIptvConfigModalProps {
  lang: AppLanguage;
  liveHostLabel: string;
  onClose: () => void;
}

export const TvIptvConfigModal: React.FC<TvIptvConfigModalProps> = ({
  lang,
  liveHostLabel,
  onClose,
}) => {
  const [copiedIptvField, setCopiedIptvField] = useState<'m3u' | 'epg' | 'tv' | null>(null);
  const m3uUrl = buildM3uPlaylistUrl(false);
  const m3uDownloadUrl = buildM3uPlaylistUrl(true);
  const epgUrl = buildEpgXmlUrl(false);
  const epgDownloadUrl = buildEpgXmlUrl(true);
  const tvPairingFullUrl = buildTvPairingUrl();

  const handleCopyIptvUrl = async (value: string, kind: 'm3u' | 'epg' | 'tv') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIptvField(kind);
      setTimeout(() => setCopiedIptvField(null), 2200);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="IPTV M3U & EPG XML"
    >
      <div className="w-full max-w-3xl rounded-3xl bg-[#10121C] border border-white/[0.12] shadow-2xl p-5 sm:p-7 space-y-5 my-auto">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-white">
              {pickLang(lang, {
                es: 'IPTV Smart TV · Lista M3U y Guía EPG (XML)',
                ca: 'IPTV Smart TV · Llista M3U i Guia EPG (XML)',
                en: 'IPTV Smart TV · M3U Playlist & EPG XML Guide',
              })}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              {pickLang(lang, {
                es: `Configura tu televisor con las rutas oficiales de ${liveHostLabel}`,
                ca: `Configura el teu televisor amb les rutes oficials de ${liveHostLabel}`,
                en: `Configure your TV with official ${liveHostLabel} routes`,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
            className="min-w-11 min-h-11 rounded-2xl bg-white/[0.06] hover:bg-white/[0.14] text-zinc-200 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-[#161926] border border-[#9146FF]/35 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#C4A7FF]">
              <ListVideo className="w-4 h-4" />
              <span>
                {pickLang(lang, {
                  es: '1. Lista M3U (Canales en directo)',
                  ca: '1. Llista M3U (Canals en directe)',
                  en: '1. M3U Playlist (Live Channels)',
                })}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-black/45 border border-white/[0.08] font-mono text-xs text-white break-all select-all">
              {m3uUrl}
            </div>
            <div className="flex items-center gap-2">
              <a
                href={m3uDownloadUrl}
                download="RIFFANTV-IPTV.m3u"
                className="flex-1 min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Descargar .m3u</span>
              </a>
              <button
                type="button"
                onClick={() => void handleCopyIptvUrl(m3uUrl, 'm3u')}
                className="min-h-10 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedIptvField === 'm3u' ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedIptvField === 'm3u' ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#161926] border border-emerald-400/35 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
              <FileCode2 className="w-4 h-4" />
              <span>
                {pickLang(lang, {
                  es: '2. Guía EPG / XML (Programación)',
                  ca: '2. Guia EPG / XML (Programació)',
                  en: '2. EPG / XML Guide (TV Schedule)',
                })}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-black/45 border border-white/[0.08] font-mono text-xs text-white break-all select-all">
              {epgUrl}
            </div>
            <div className="flex items-center gap-2">
              <a
                href={epgDownloadUrl}
                download="RIFFANTV-EPG.xml"
                className="flex-1 min-h-10 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Descargar .xml</span>
              </a>
              <button
                type="button"
                onClick={() => void handleCopyIptvUrl(epgUrl, 'epg')}
                className="min-h-10 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedIptvField === 'epg' ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedIptvField === 'epg' ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
          <div className="space-y-2.5 text-xs sm:text-sm text-zinc-300 leading-relaxed">
            <p>
              <strong className="text-emerald-300">¿Qué es el EPG / XML?</strong> Es el enlace de guía de horarios y logos de canales que piden apps como <strong className="text-white">IBO Player, TiviMate, IPTV Smarters o Smart IPTV</strong>. Pega la ruta <code className="text-[#C4A7FF]">/riffantv.m3u</code> como Lista y <code className="text-emerald-300">/epg.xml</code> como EPG.
            </p>
            <ul className="space-y-1 text-xs text-zinc-400 list-disc pl-5">
              <li><strong className="text-white">Samsung Tizen / LG webOS:</strong> Abre IBO Player / Smart IPTV → sube la M3U y la URL XMLTV.</li>
              <li><strong className="text-white">Google TV / Android TV:</strong> En TiviMate o Televizo añade Lista M3U y Fuente EPG.</li>
              <li><strong className="text-white">Navegador directo:</strong> Entra siempre en <strong className="text-white">{tvPairingFullUrl}</strong> para usar el mando con tu móvil.</li>
            </ul>
          </div>
          <div className="flex flex-col items-center gap-1.5 shrink-0 mx-auto">
            <div className="p-2.5 rounded-2xl bg-white">
              <QRCodeSVG value={m3uUrl} size={108} level="M" includeMargin={false} />
            </div>
            <span className="text-[11px] text-zinc-400 font-medium">
              Escanea M3U en el móvil
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TvPairingSalonFooter: React.FC<{ lang: AppLanguage; liveHostLabel: string }> = ({
  lang,
  liveHostLabel,
}) => (
  <footer className="relative z-10 max-w-4xl mx-auto w-full grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
    <div className="p-4 rounded-2xl bg-[#10121C] border border-white/[0.08] flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-white shrink-0">
        1
      </div>
      <div className="text-xs sm:text-sm text-zinc-300 min-w-0">
        <strong className="text-white block mb-0.5">
          {pickLang(lang, {
            es: 'Abre tu sala en el móvil',
            ca: 'Obre la teva sala al mòbil',
            en: 'Open room on phone',
          })}
        </strong>
        <span className="break-all">
          {pickLang(lang, {
            es: `Entra en ${liveHostLabel || 'RiffanTV'} desde tu teléfono.`,
            ca: `Entra a ${liveHostLabel || 'RiffanTV'} des del teu telèfon.`,
            en: `Open ${liveHostLabel || 'RiffanTV'} on your smartphone.`,
          })}
        </span>
      </div>
    </div>

    <div className="p-4 rounded-2xl bg-[#10121C] border border-white/[0.08] flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-white shrink-0">
        2
      </div>
      <div className="text-xs sm:text-sm text-zinc-300">
        <strong className="text-white block mb-0.5">
          {pickLang(lang, {
            es: 'Pulsa Smart TV o Cast',
            ca: 'Prem Smart TV o Cast',
            en: 'Tap Smart TV or Cast',
          })}
        </strong>
        {pickLang(lang, {
          es: 'Arriba en la barra o dentro del reproductor → escribe estos 4 números.',
          ca: 'A dalt a la barra o dins del reproductor → escriu aquests 4 números.',
          en: 'In the top bar or inside the video player → enter these 4 digits.',
        })}
      </div>
    </div>

    <div className="p-4 rounded-2xl bg-[#10121C] border border-white/[0.08] flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-[#9146FF]/18 border border-[#9146FF]/40 flex items-center justify-center shrink-0">
        <Smartphone className="w-4 h-4 text-[#BF94FF]" />
      </div>
      <div className="text-xs sm:text-sm text-zinc-300">
        <strong className="text-white block mb-0.5">
          {pickLang(lang, {
            es: 'Mando en tu teléfono',
            ca: 'Comandament al teu telèfon',
            en: 'Phone becomes remote',
          })}
        </strong>
        {pickLang(lang, {
          es: 'Controla Play, Pausa, Volumen y Ambilight desde el sofá.',
          ca: 'Controla Play, Pausa, Volum i Ambilight des del sofà.',
          en: 'Control Play, Pause, Volume & Ambilight from your couch.',
        })}
      </div>
    </div>
  </footer>
);
