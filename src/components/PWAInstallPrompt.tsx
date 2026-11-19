import React, { useEffect, useState } from 'react';
import { RiffanDownloadIcon } from './ui/RiffanIcons';
import { AppLanguage } from '../types';
import { useOnlineStatus, usePWAInstall } from '../utils/usePWAInstall';
import { triggerHaptic } from '../utils/haptics';
import { triggerApkDownload } from '../utils/apkDownload';
import { pickLang } from '../utils/i18n';
import {
  buildEpgXmlUrl,
  buildM3uPlaylistUrl,
  buildTvPairingUrl,
  isSmartTvBrowser,
} from '../utils/shortLink';
import { BottomSheet, SecondaryButton } from './ui/DesignSystem';
import {
  STATIC_CHANNELS_CATALOG,
  type SmartTvChannelInfo,
} from './pwa/smartTvCatalogData';
import { PwaInstallMainOptions } from './pwa/PwaInstallMainOptions';
import { PwaSmartTvGuideSection } from './pwa/PwaSmartTvGuideSection';

export type { SmartTvChannelInfo };

interface PWAInstallButtonProps {
  lang: AppLanguage;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  lang,
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showSheet, setShowSheet] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    triggerHaptic('medium');
    if (isInstallable) {
      await install();
      return;
    }
    setShowSheet(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`min-h-12 ${
          compact ? 'px-3' : 'px-4'
        } rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-xs font-semibold text-white flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
      >
        <RiffanDownloadIcon size={16} />
        <span>
          {pickLang(lang, {
            es: 'Instalar RiffanTV (Smart TV & App)',
            ca: 'Instal·lar RiffanTV (Smart TV & App)',
            en: 'Install RiffanTV (Smart TV & App)',
          })}
        </span>
      </button>

      <PWAInstallOptionsSheet
        isOpen={showSheet}
        onClose={() => setShowSheet(false)}
        lang={lang}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </>
  );
};

interface PWAInstallLandingCardProps {
  lang: AppLanguage;
  isDesktop?: boolean;
  alwaysShow?: boolean;
}

export const PWAInstallLandingCard: React.FC<PWAInstallLandingCardProps> = ({
  lang,
  alwaysShow = false,
}) => {
  const { isInstalled, isIOS, isAndroid } = usePWAInstall();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isInstalled && !alwaysShow) return null;

  return (
    <>
      <SecondaryButton fullWidth onClick={() => setSheetOpen(true)}>
        <RiffanDownloadIcon size={16} />
        <span>
          {pickLang(lang, {
            es: 'Instalar RiffanTV · Smart TV & Móvil',
            ca: 'Instal·lar RiffanTV · Smart TV & Mòbil',
            en: 'Install RiffanTV · Smart TV & Mobile',
            zh: '安装 RiffanTV',
          })}
        </span>
      </SecondaryButton>

      <PWAInstallOptionsSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        lang={lang}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </>
  );
};

export interface PWAInstallOptionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  isIOS?: boolean;
  isAndroid?: boolean;
  initialSection?: 'main' | 'samsung_tizen';
}

export const PWAInstallOptionsSheet: React.FC<PWAInstallOptionsSheetProps> = ({
  isOpen,
  onClose,
  lang,
  isIOS: propIsIos,
  isAndroid: propIsAndroid,
  initialSection = 'main',
}) => {
  const pwa = usePWAInstall();
  const isIOS = propIsIos ?? pwa.isIOS;
  const isAndroid = propIsAndroid ?? pwa.isAndroid;
  const isTvDevice = typeof window !== 'undefined' && isSmartTvBrowser();

  const [viewingSection, setViewingSection] = useState<'main' | 'samsung_tizen'>(initialSection);
  const [tizenTab, setTizenTab] = useState<'guide' | 'channels' | 'urls'>('guide');
  const [apkDownloading, setApkDownloading] = useState<'mobile' | 'tv' | null>(null);
  const [apkDone, setApkDone] = useState<'mobile' | 'tv' | null>(null);
  const [apkError, setApkError] = useState<string | null>(null);
  const [showWebSteps, setShowWebSteps] = useState(false);

  const [copiedType, setCopiedType] = useState<'m3u' | 'epg' | 'tv' | null>(null);
  const [channelSearch, setChannelSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [dynamicChannels, setDynamicChannels] = useState<SmartTvChannelInfo[]>(STATIC_CHANNELS_CATALOG);
  const [totalCount, setTotalCount] = useState<number>(STATIC_CHANNELS_CATALOG.length);

  useEffect(() => {
    if (isOpen) {
      setViewingSection(initialSection);
    } else {
      setCopiedType(null);
      setChannelSearch('');
      setSelectedCategory('all');
    }
  }, [isOpen, initialSection]);

  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    fetch('/api/iptv/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!isCancelled && data?.ok && Array.isArray(data.channels) && data.channels.length > 0) {
          setDynamicChannels(data.channels);
          setTotalCount(data.totalChannels || data.channels.length);
        }
      })
      .catch(() => {
        // Fallback to static catalog
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  const recommendedDevice: 'android' | 'tv' | 'samsung' | 'web' = isTvDevice
    ? 'tv'
    : isAndroid
    ? 'android'
    : 'web';

  const m3uUrl = buildM3uPlaylistUrl(false);
  const m3uDownloadUrl = buildM3uPlaylistUrl(true);
  const epgUrl = buildEpgXmlUrl(false);
  const epgDownloadUrl = buildEpgXmlUrl(true);
  const tvReceiverUrl = buildTvPairingUrl();

  const handleCopy = async (text: string, type: 'm3u' | 'epg' | 'tv') => {
    triggerHaptic('medium');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadApk = async (
    flavor: 'mobile' | 'tv',
    url: string,
    filename: string
  ) => {
    if (apkDownloading) return;
    triggerHaptic('medium');
    setApkDownloading(flavor);
    setApkError(null);
    const res = await triggerApkDownload(url, filename);
    setApkDownloading(null);
    if (res.ok) {
      setApkDone(flavor);
      setTimeout(() => setApkDone(null), 3000);
    } else {
      setApkError(
        res.error ||
          pickLang(lang, {
            es: 'No se pudo iniciar la descarga',
            ca: 'No s’ha pogut iniciar la descàrrega',
            en: 'Could not start download',
          })
      );
    }
  };

  const handleInstallWeb = async () => {
    triggerHaptic('medium');
    if (pwa.isInstallable) {
      await pwa.install();
      return;
    }
    setShowWebSteps((v) => !v);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      maxWidth={viewingSection === 'samsung_tizen' ? 'sm:max-w-xl' : 'sm:max-w-md'}
      icon={<RiffanDownloadIcon size={20} />}
      title={
        viewingSection === 'samsung_tizen'
          ? pickLang(lang, {
              es: 'IPTV Smart TV · Lista M3U y EPG XML',
              ca: 'IPTV Smart TV · Llista M3U i EPG XML',
              en: 'IPTV Smart TV · M3U & EPG XML Guide',
              zh: 'IPTV 智能电视 · M3U 列表与 EPG 指南',
            })
          : pickLang(lang, {
              es: 'Instalar RiffanTV',
              ca: 'Instal·lar RiffanTV',
              en: 'Install RiffanTV',
              zh: '安装 RiffanTV',
            })
      }
      subtitle={
        viewingSection === 'samsung_tizen'
          ? pickLang(lang, {
              es: 'Lista M3U con +160 canales, guía EPG XML y tutorial de instalación',
              ca: 'Llista M3U amb +160 canals, guia EPG XML i tutorial d’instal·lació',
              en: 'M3U playlist with 160+ channels, EPG XML guide & setup tutorial',
              zh: '提供 160+ 频道 M3U 播放列表与 EPG XML 电子节目指南',
            })
          : pickLang(lang, {
              es: 'Elige tu Smart TV, Android APK, Google TV o navegador',
              ca: 'Tria la teva Smart TV, Android APK, Google TV o navegador',
              en: 'Choose your Smart TV, Android APK, Google TV, or browser',
              zh: '选择您的设备随时快速访问',
            })
      }
    >
      {viewingSection === 'main' ? (
        <PwaInstallMainOptions
          lang={lang}
          recommendedDevice={recommendedDevice}
          isIOS={isIOS}
          isInstallable={pwa.isInstallable}
          apkDownloading={apkDownloading}
          apkDone={apkDone}
          apkError={apkError}
          showWebSteps={showWebSteps}
          onSelectSamsungTizen={() => setViewingSection('samsung_tizen')}
          onDownloadApk={(flavor, url, filename) => void handleDownloadApk(flavor, url, filename)}
          onInstallPwa={async () => {
            triggerHaptic('medium');
            await pwa.install();
          }}
          onInstallWeb={() => void handleInstallWeb()}
        />
      ) : (
        <PwaSmartTvGuideSection
          lang={lang}
          totalCount={totalCount}
          dynamicChannels={dynamicChannels}
          tizenTab={tizenTab}
          onChangeTizenTab={setTizenTab}
          channelSearch={channelSearch}
          onChangeChannelSearch={setChannelSearch}
          selectedCategory={selectedCategory}
          onChangeSelectedCategory={setSelectedCategory}
          copiedType={copiedType}
          m3uUrl={m3uUrl}
          m3uDownloadUrl={m3uDownloadUrl}
          epgUrl={epgUrl}
          epgDownloadUrl={epgDownloadUrl}
          tvReceiverUrl={tvReceiverUrl}
          onCopy={(text, type) => void handleCopy(text, type)}
          onBack={() => setViewingSection('main')}
        />
      )}
    </BottomSheet>
  );
};

export const OfflineIndicator: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-[125] flex items-center gap-2.5 rounded-2xl bg-amber-500/95 px-3.5 py-2 text-xs font-bold text-zinc-950 shadow-xl"
    >
      <span className="h-2 w-2 rounded-full bg-zinc-950 shrink-0" />
      <span className="whitespace-nowrap">
        {pickLang(lang, {
          es: 'Sin conexión',
          ca: 'Sense connexió',
          en: 'Offline',
          zh: '已离线',
        })}
      </span>
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          window.location.reload();
        }}
        className="px-2.5 py-1 rounded-lg bg-zinc-950 text-amber-300 text-[11px] font-bold hover:bg-zinc-900 cursor-pointer whitespace-nowrap shrink-0"
      >
        {pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry', zh: '重试' })}
      </button>
    </div>
  );
};
