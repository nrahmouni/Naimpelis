import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { BottomSheet, PrimaryButton, SecondaryButton } from '../ui/DesignSystem';
import {
  clearCachedXtreamCatalog,
  fetchXtreamFullCatalog,
} from '../../services/xtreamClientService';
import {
  clearPrivateVault,
  getMaskedVaultSummary,
  savePrivateVaultJson,
  type MaskedVaultSummary,
} from '../../services/xtreamVaultConfig';

interface XtreamPrivateVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  onVaultUpdated?: () => void;
}

const EMPTY_TEMPLATE_JSON = `{
  "XTREAM_SERVER_URL": "",
  "XTREAM_ACCOUNTS_JSON": [{ "user": "", "pass": "" }],
  "VOD4K_SERVER_URL": "",
  "VOD4K_USERNAME": "",
  "VOD4K_PASSWORD": "",
  "EXTRA_PROVIDERS_JSON": [
    { "name": "24TV", "serverUrl": "", "user": "", "pass": "" },
    { "name": "2M2H", "serverUrl": "", "user": "", "pass": "" }
  ],
  "DANA4K_SERVER_URL": "",
  "DANA4K_ACCOUNTS_JSON": [{ "user": "", "pass": "" }],
  "ACTIVE_CDNS_SERVER_URL": "",
  "ACTIVE_CDNS_USERNAME": "",
  "ACTIVE_CDNS_PASSWORD": "",
  "OCTOPUS_SERVER_URL": "",
  "OCTOPUS_USERNAME": "",
  "OCTOPUS_PASSWORD": ""
}`;

export const XtreamPrivateVaultModal: React.FC<XtreamPrivateVaultModalProps> = ({
  isOpen,
  onClose,
  lang,
  onVaultUpdated,
}) => {
  const [rawJsonInput, setRawJsonInput] = useState('');
  const [summary, setSummary] = useState<MaskedVaultSummary>(() => getMaskedVaultSummary());
  const [saving, setSaving] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRawJsonInput('');
      setSummary(getMaskedVaultSummary());
      setFeedback(null);
    }
  }, [isOpen]);

  const handleSave = async () => {
    triggerHaptic('medium');
    setSaving(true);
    setFeedback(null);
    try {
      const res = await savePrivateVaultJson(rawJsonInput);
      if (!res.ok) {
        setFeedback({ type: 'err', text: res.error || 'No se pudo guardar la bóveda.' });
        return;
      }

      // Immediately wipe plaintext from React state & input DOM
      setRawJsonInput('');
      setSummary(getMaskedVaultSummary());

      clearCachedXtreamCatalog();
      const catRes = await fetchXtreamFullCatalog(true, 'all');
      window.dispatchEvent(new CustomEvent('belix-channels-synced'));
      window.dispatchEvent(new CustomEvent('xtream-vault-updated'));
      onVaultUpdated?.();

      const totalItems = catRes.catalog
        ? catRes.catalog.counts.liveStreams +
          catRes.catalog.counts.vodStreams +
          catRes.catalog.counts.series
        : 0;

      setFeedback({
        type: 'ok',
        text:
          totalItems > 0
            ? `Conectado · Bóveda guardada (••••••••) y ${totalItems} títulos sincronizados.`
            : 'Conectado · Bóveda guardada en Base64 oculto (••••••••).',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    triggerHaptic('medium');
    setSaving(true);
    setFeedback(null);
    try {
      await clearPrivateVault();
      clearCachedXtreamCatalog();
      setRawJsonInput('');
      setSummary(getMaskedVaultSummary());
      window.dispatchEvent(new CustomEvent('belix-channels-synced'));
      window.dispatchEvent(new CustomEvent('xtream-vault-updated'));
      onVaultUpdated?.();
      setFeedback({
        type: 'ok',
        text: 'Bóveda privada local eliminada.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      maxWidth="sm:max-w-lg"
      icon={<KeyRound className="w-5 h-5 text-amber-400" />}
      title={pickLang(lang, {
        es: 'Configurar Claves Privadas',
        ca: 'Configurar Claus Privades',
        en: 'Configure Private Keys',
      })}
      subtitle={pickLang(lang, {
        es: 'Bóveda cifrada en Base64 oculto (_app_vault_cfg) · Cero exposición en pantalla',
        ca: 'Volta desada en Base64 ocult (_app_vault_cfg) · Zero exposició en pantalla',
        en: 'Hidden Base64 vault (_app_vault_cfg) · Zero credential display',
      })}
    >
      <div className="space-y-4">
        {summary.hasVault || summary.hasViteEnv ? (
          <div className="rounded-2xl bg-emerald-500/[0.08] border border-emerald-500/25 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Conectado · Claves ocultas ({summary.maskedDots})</span>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-200">
                {summary.hasVault ? 'Bóveda Base64' : 'VITE Env'}
              </span>
            </div>
            {summary.configuredNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {summary.configuredNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/[0.08] text-[11px] font-semibold text-zinc-200"
                  >
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>{name}</span>
                    <span className="text-zinc-500">{summary.maskedDots}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-amber-500/[0.07] border border-amber-500/25 p-3.5 flex items-start gap-2.5">
            <EyeOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-300">
              Pega un único bloque JSON con tus servidores y cuentas. Tras guardarlo, los usuarios, contraseñas y URLs desaparecen por completo de los inputs y de la interfaz.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="xtream-private-vault-input" className="text-xs font-bold text-zinc-300">
              Bloque JSON privado de servidores
            </label>
            <button
              type="button"
              onClick={() => setShowTemplate((v) => !v)}
              className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
            >
              {showTemplate ? 'Ocultar plantilla' : 'Ver plantilla JSON vacía'}
            </button>
          </div>

          {showTemplate && (
            <pre className="rounded-xl bg-black/70 border border-white/[0.08] p-3 text-[11px] font-mono text-zinc-400 overflow-x-auto max-h-40 select-all">
              {EMPTY_TEMPLATE_JSON}
            </pre>
          )}

          <textarea
            id="xtream-private-vault-input"
            value={rawJsonInput}
            onChange={(e) => setRawJsonInput(e.target.value)}
            rows={6}
            autoComplete="off"
            spellCheck={false}
            placeholder={
              summary.hasVault
                ? '•••••••• (Bóveda guardada y oculta. Pega un nuevo JSON solo si deseas reemplazarla)'
                : 'Pega aquí tu JSON privado de servidores y credenciales...'
            }
            className="w-full rounded-2xl bg-[#09090E] border border-white/[0.12] p-3.5 text-xs font-mono text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 resize-y"
          />
        </div>

        {feedback && (
          <div
            className={`rounded-xl p-3 border text-xs flex items-center gap-2 ${
              feedback.type === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-red-500/10 border-red-500/30 text-red-200'
            }`}
          >
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {summary.hasVault ? (
            <SecondaryButton onClick={() => void handleClear()} disabled={saving}>
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>Borrar bóveda</span>
            </SecondaryButton>
          ) : (
            <span />
          )}

          <PrimaryButton onClick={() => void handleSave()} disabled={saving || !rawJsonInput.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            <span>Guardar y Sincronizar</span>
          </PrimaryButton>
        </div>
      </div>
    </BottomSheet>
  );
};
