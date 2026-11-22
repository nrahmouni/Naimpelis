import React from 'react';
import { Tv } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { BottomSheet } from '../ui/DesignSystem';
import { SamsungWgtExportPanel } from './SamsungWgtExportPanel';

interface SamsungTizenExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  onOpenSamsungPage?: () => void;
}

export const SamsungTizenExportModal: React.FC<SamsungTizenExportModalProps> = ({
  isOpen,
  onClose,
  lang,
  onOpenSamsungPage,
}) => {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      maxWidth="sm:max-w-lg"
      icon={<Tv className="w-5 h-5" />}
      title={pickLang(lang, {
        es: 'Exportar para Samsung TV (.wgt)',
        ca: 'Exportar per a Samsung TV (.wgt)',
        en: 'Export for Samsung TV (.wgt)',
      })}
      subtitle={pickLang(lang, {
        es: 'Empaquetador automático sin instalar Tizen Studio',
        ca: 'Empaquetador automàtic sense instal·lar Tizen Studio',
        en: 'Browser packager without installing Tizen Studio',
      })}
    >
      <SamsungWgtExportPanel
        compact
        onOpenFullGuide={() => {
          onClose();
          if (onOpenSamsungPage) {
            onOpenSamsungPage();
          } else if (typeof window !== 'undefined') {
            window.history.pushState({}, '', '/samsung');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        }}
      />
    </BottomSheet>
  );
};
