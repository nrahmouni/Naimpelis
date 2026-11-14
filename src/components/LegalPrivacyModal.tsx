import React, { useState } from 'react';
import { Download, ShieldCheck, Trash2, CheckCircle2, FileText } from 'lucide-react';
import { exportUserDataAsJson, purgeLocalAndCloudHistory } from '../utils/gdprExport';
import { BottomSheet, PrimaryButton, SecondaryButton } from './ui/DesignSystem';

interface LegalPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegalPrivacyModal: React.FC<LegalPrivacyModalProps> = ({ isOpen, onClose }) => {
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
      title="Privacidad, Términos y Aviso Legal"
      subtitle="Transparencia de datos, derechos GDPR y atribuciones de catálogo"
      icon={<ShieldCheck className="w-5 h-5" />}
      maxWidth="sm:max-w-2xl"
    >
      <div className="space-y-4 text-xs text-zinc-300 leading-relaxed">
        <section className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
          <h4 className="font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#e11d48]" />
            <span>1. Datos almacenados y sincronización en la nube</span>
          </h4>
          <p>
            NAIM CINE almacena únicamente tu nombre de perfil, avatar, favoritos, progreso de visualización,
            código de amigo y configuraciones de sala en Firebase Firestore para mantener sincronizados
            tus dispositivos (móvil, web y Smart TV). No vendemos ni compartimos tus datos con anunciantes.
          </p>
        </section>

        <section className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
          <h4 className="font-bold text-white">2. Metadatos e imágenes de catálogo (TMDB)</h4>
          <p>
            Los títulos, sinopsis, carátulas, logotipos oficiales y repartos mostrados proceden de la API pública
            de The Movie Database (TMDB). Este producto utiliza la API de TMDB pero no está respaldado ni certificado
            por TMDB.
          </p>
        </section>

        <section className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
          <h4 className="font-bold text-white">3. Tus derechos (Exportación GDPR y Eliminación)</h4>
          <p>
            Puedes descargar en cualquier momento una copia íntegra de tu perfil, salas recientes, favoritos
            e historial en formato JSON estándar o borrar tu historial local y en la nube.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <PrimaryButton onClick={handleExport} className="flex-1">
              {exported ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              <span>{exported ? 'Copia JSON descargada' : 'Exportar mis datos (.json)'}</span>
            </PrimaryButton>
            <SecondaryButton onClick={handlePurge} className="flex-1">
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>{purged ? 'Historial eliminado' : 'Borrar historial local y nube'}</span>
            </SecondaryButton>
          </div>
        </section>
      </div>
    </BottomSheet>
  );
};
