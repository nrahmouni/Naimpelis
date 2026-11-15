import React, { useRef, useState } from 'react';
import { Download, Upload, ShieldCheck, Trash2, CheckCircle2, FileText } from 'lucide-react';
import {
  exportUserDataAsJson,
  importUserDataFromJson,
  purgeLocalAndCloudHistory,
} from '../utils/gdprExport';
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
  const [importFeedback, setImportFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = () => {
    exportUserDataAsJson();
    setExported(true);
    window.setTimeout(() => setExported(false), 2500);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const res = importUserDataFromJson(text);
      if (res.ok) {
        setImportFeedback({
          ok: true,
          text: pickLang(lang, {
            es: `Restaurado (${res.restored.watchlistCount} lista, ${res.restored.historyCount} historial, ${res.restored.friendsCount} amigos).`,
            ca: `Restaurat (${res.restored.watchlistCount} llista, ${res.restored.historyCount} historial, ${res.restored.friendsCount} amics).`,
            en: `Restored (${res.restored.watchlistCount} watchlist, ${res.restored.historyCount} history, ${res.restored.friendsCount} friends).`,
          }),
        });
        window.dispatchEvent(new Event('naim-storage-restored'));
      } else {
        setImportFeedback({
          ok: false,
          text: res.error || pickLang(lang, { es: 'JSON no válido', ca: 'JSON no vàlid', en: 'Invalid JSON' }),
        });
      }
    } catch {
      setImportFeedback({
        ok: false,
        text: pickLang(lang, { es: 'Error leyendo el archivo', ca: 'Error llegint el fitxer', en: 'Failed reading file' }),
      });
    }
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
              es: '3. Tus derechos (Exportación, Restauración GDPR y Borrado total)',
              ca: '3. Els teus drets (Exportació, Restauració GDPR i Esborrat total)',
              en: '3. Your rights (GDPR Export, Restore & Full Wipe)',
            })}
          </h4>
          <p>
            {pickLang(lang, {
              es: 'Puedes exportar una copia íntegra de tu perfil, Mi Lista, canales favoritos, amigos e historial en JSON, restaurar una copia previa o borrar todos tus datos locales y el historial en la nube en un clic.',
              ca: 'Pots exportar una còpia íntegra del teu perfil, La meva Llista, canals favorits, amics i historial en JSON, restaurar una còpia prèvia o esborrar totes les teves dades locals i l’historial al núvol amb un clic.',
              en: 'You can export a full JSON backup of your profile, watchlist, favorite channels, friends, and watch history, restore a previous backup, or wipe all local data and cloud history in one click.',
            })}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            <PrimaryButton onClick={handleExport}>
              {exported ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              <span className="truncate">
                {exported
                  ? pickLang(lang, {
                      es: 'JSON descargado',
                      ca: 'JSON descarregat',
                      en: 'JSON downloaded',
                    })
                  : pickLang(lang, {
                      es: 'Exportar (.json)',
                      ca: 'Exportar (.json)',
                      en: 'Export (.json)',
                    })}
              </span>
            </PrimaryButton>
            <SecondaryButton onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 text-[#BF94FF]" />
              <span className="truncate">
                {pickLang(lang, {
                  es: 'Restaurar (.json)',
                  ca: 'Restaurar (.json)',
                  en: 'Restore (.json)',
                })}
              </span>
            </SecondaryButton>
            <SecondaryButton onClick={handlePurge}>
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span className="truncate">
                {purged
                  ? pickLang(lang, {
                      es: 'Datos eliminados',
                      ca: 'Dades eliminades',
                      en: 'Data wiped',
                    })
                  : pickLang(lang, {
                      es: 'Borrar todo',
                      ca: 'Esborrar tot',
                      en: 'Wipe all data',
                    })}
              </span>
            </SecondaryButton>
          </div>
          {importFeedback && (
            <div
              className={`mt-2 px-3 py-2 rounded-xl text-[11px] font-medium border ${
                importFeedback.ok
                  ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-200'
                  : 'bg-rose-500/12 border-rose-500/35 text-rose-200'
              }`}
            >
              {importFeedback.text}
            </div>
          )}
        </section>
      </div>
    </BottomSheet>
  );
};
