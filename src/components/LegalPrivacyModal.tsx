import React, { useState } from 'react';
import { Download, ShieldCheck, Trash2, CheckCircle2, FileText } from 'lucide-react';
import { exportUserDataAsJson, purgeLocalAndCloudHistory } from '../utils/gdprExport';
import { BottomSheet, PrimaryButton, SecondaryButton } from './ui/DesignSystem';
import type { AppLanguage } from '../types';
import { pickLang } from '../utils/i18n';

interface LegalPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: AppLanguage;
}

export const LegalPrivacyModal: React.FC<LegalPrivacyModalProps> = ({
  isOpen,
  onClose,
  lang = 'es',
}) => {
  const [purged, setPurged] = useState(false);
  const [exported, setExported] = useState(false);

  const handleExport = () => {
    exportUserDataAsJson();
    setExported(true);
    window.setTimeout(() => setExported(false), 2500);
  };

  const handlePurge = async () => {
    await purgeLocalAndCloudHistory();
    setPurged(true);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      title={pickLang(lang, {
        es: 'Privacidad, Términos y Aviso Legal',
        ca: 'Privacitat, Termes i Avís Legal',
        en: 'Privacy, Terms & Legal Notice',
      })}
      subtitle={pickLang(lang, {
        es: 'Transparencia de datos, derechos GDPR y atribuciones de catálogo',
        ca: 'Transparència de dades, drets GDPR i atribucions del catàleg',
        en: 'Data transparency, GDPR rights and catalog attributions',
      })}
      icon={<ShieldCheck className="w-5 h-5" />}
      maxWidth="sm:max-w-2xl"
    >
      <div className="space-y-4 text-xs text-zinc-300 leading-relaxed">
        <section className="p-4 rounded-2xl bg-white/[0.035] nc-specular-surface border border-white/[0.08] space-y-2">
          <h4 className="font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#BF94FF]" />
            <span>
              {pickLang(lang, {
                es: '1. Datos almacenados y sincronización en la nube',
                ca: '1. Dades emmagatzemades i sincronització al núvol',
                en: '1. Stored data & cloud synchronization',
              })}
            </span>
          </h4>
          <p>
            {pickLang(lang, {
              es: 'NAIM CINE almacena únicamente tu nombre de perfil, avatar, favoritos, progreso de visualización, código de amigo y configuraciones de sala en Firebase Firestore para mantener sincronizados tus dispositivos (móvil, web y Smart TV). No vendemos ni compartimos tus datos con anunciantes.',
              ca: 'NAIM CINE emmagatzema únicament el teu nom de perfil, avatar, favorits, progrés de visualització, codi d’amic i configuracions de sala a Firebase Firestore per mantenir sincronitzats els teus dispositius (mòbil, web i Smart TV). No venem ni compartim les teves dades amb anunciants.',
              en: 'NAIM CINE stores only your profile name, avatar, favorites, watch progress, friend code, and room settings in Firebase Firestore to sync your devices (mobile, web, and Smart TV). We never sell or share your data with advertisers.',
            })}
          </p>
        </section>

        <section className="p-4 rounded-2xl bg-white/[0.035] nc-specular-surface border border-white/[0.08] space-y-2">
          <h4 className="font-bold text-white">
            {pickLang(lang, {
              es: '2. Metadatos e imágenes de catálogo (TMDB)',
              ca: '2. Metadades i imatges de catàleg (TMDB)',
              en: '2. Catalog metadata & artwork (TMDB)',
            })}
          </h4>
          <p>
            {pickLang(lang, {
              es: 'Los títulos, sinopsis, carátulas, logotipos oficiales y repartos mostrados proceden de la API pública de The Movie Database (TMDB). Este producto utiliza la API de TMDB pero no está respaldado ni certificado por TMDB.',
              ca: 'Els títols, sinopsis, caràtules, logotips oficials i repartiments mostrats provenen de l’API pública de The Movie Database (TMDB). Aquest producte utilitza l’API de TMDB però no està avalat ni certificat per TMDB.',
              en: 'Titles, synopses, posters, official logos, and cast information are provided via The Movie Database (TMDB) API. This product uses the TMDB API but is not endorsed or certified by TMDB.',
            })}
          </p>
        </section>

        <section className="p-4 rounded-2xl bg-white/[0.035] nc-specular-surface border border-white/[0.08] space-y-2">
          <h4 className="font-bold text-white">
            {pickLang(lang, {
              es: '3. Tus derechos (Exportación GDPR y Eliminación)',
              ca: '3. Els teus drets (Exportació GDPR i Eliminació)',
              en: '3. Your rights (GDPR Export & Deletion)',
            })}
          </h4>
          <p>
            {pickLang(lang, {
              es: 'Puedes descargar en cualquier momento una copia íntegra de tu perfil, salas recientes, favoritos e historial en formato JSON estándar o borrar tu historial local y en la nube.',
              ca: 'Pots descarregar en qualsevol moment una còpia íntegra del teu perfil, sales recents, favorits i historial en format JSON estàndard o esborrar el teu historial local i al núvol.',
              en: 'You can download a complete JSON export of your profile, recent rooms, favorites, and history at any time, or wipe your local and cloud history.',
            })}
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <PrimaryButton onClick={handleExport} className="flex-1">
              {exported ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              <span>
                {exported
                  ? pickLang(lang, {
                      es: 'Copia JSON descargada',
                      ca: 'Còpia JSON descarregada',
                      en: 'JSON backup downloaded',
                    })
                  : pickLang(lang, {
                      es: 'Exportar mis datos (.json)',
                      ca: 'Exportar les meves dades (.json)',
                      en: 'Export my data (.json)',
                    })}
              </span>
            </PrimaryButton>
            <SecondaryButton onClick={handlePurge} className="flex-1">
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>
                {purged
                  ? pickLang(lang, {
                      es: 'Historial eliminado',
                      ca: 'Historial eliminat',
                      en: 'History deleted',
                    })
                  : pickLang(lang, {
                      es: 'Borrar historial local y nube',
                      ca: 'Esborrar historial local i núvol',
                      en: 'Delete local & cloud history',
                    })}
              </span>
            </SecondaryButton>
          </div>
        </section>
      </div>
    </BottomSheet>
  );
};
