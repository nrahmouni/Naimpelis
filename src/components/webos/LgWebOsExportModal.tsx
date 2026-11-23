import React from 'react';
import { Tv } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { BottomSheet } from '../ui/DesignSystem';
import { LgWebOsExportPanel } from './LgWebOsExportPanel';

interface LgWebOsExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  onOpenWebOsPage?: () => void;
}

export const LgWebOsExportModal: React.FC<LgWebOsExportModalProps> = ({
  isOpen,
  onClose,
  lang,
  onOpenWebOsPage,
}) => {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      maxWidth="sm:max-w-lg"
      icon={<Tv className="w-5 h-5" />}
      title={pickLang(lang, {
        es: 'Exportar para LG webOS TV (.ipk)',
        ca: 'Exportar per a LG webOS TV (.ipk)',
        en: 'Export for LG webOS TV (.ipk)',
      })}
      subtitle={pickLang(lang, {
        es: 'Compatible con LG antiguas (webOS 3–5) y nuevas (webOS 6–24+)',
        ca: 'Compatible amb LG antigues (webOS 3–5) i noves (webOS 6–24+)',
        en: 'Compatible with legacy (webOS 3–5) & modern (webOS 6–24+) LG TVs',
      })}
    >
      <LgWebOsExportPanel
        compact
        onOpenFullGuide={() => {
          onClose();
          if (onOpenWebOsPage) {
            onOpenWebOsPage();
          } else if (typeof window !== 'undefined') {
            window.history.pushState({}, '', '/webos');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        }}
      />
    </BottomSheet>
  );
};
