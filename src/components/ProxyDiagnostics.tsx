import React, { useState, useEffect } from 'react';
import { Bug, ChevronDown, ChevronUp, ExternalLink, ShieldCheck, ShieldX, Terminal } from 'lucide-react';

interface ProxyDiagnosticsProps {
  url: string;
}

interface DiagnosticResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  finalUrl: string;
  allowed: boolean;
  error?: string;
}

export const ProxyDiagnostics: React.FC<ProxyDiagnosticsProps> = ({ url }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  const runDiagnostics = async () => {
    if (!url) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/proxy-debug?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        status: 0,
        statusText: 'Error de conexión',
        headers: {},
        finalUrl: url,
        allowed: false,
        error: err instanceof Error ? err.message : 'Error desconocido'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded && !result) {
      runDiagnostics();
    }
  }, [expanded, url]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-rose-400" />
          <span className="text-xs font-bold text-slate-200">Diagnóstico del Proxy</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-400 font-medium uppercase truncate max-w-[200px]">
                {url}
              </p>
              <button
                onClick={runDiagnostics}
                disabled={loading}
                className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 transition-colors disabled:opacity-50"
              >
                {loading ? 'Analizando...' : 'Volver a probar'}
              </button>
            </div>

            {loading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-3">
                <div className="w-6 h-6 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
                <p className="text-[10px] text-slate-400">Consultando estado del servidor remoto...</p>
              </div>
            ) : result ? (
              <div className="flex flex-col gap-3">
                {/* Status Badge */}
                <div className={`p-3 rounded-xl border flex items-center justify-between ${
                  result.status >= 200 && result.status < 400
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-rose-500/5 border-rose-500/20'
                }`}>
                  <div className="flex items-center gap-2.5">
                    {result.status >= 200 && result.status < 400 ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <ShieldX className="w-4 h-4 text-rose-400" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-slate-200">
                        HTTP {result.status || '???'}: {result.statusText || 'Error'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {result.allowed ? 'Dominio permitido' : 'Dominio bloqueado o error'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Headers */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1">
                    <Terminal className="w-3 h-3" />
                    Cabeceras de respuesta
                  </div>
                  <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 font-mono text-[10px] text-slate-300 max-h-48 overflow-y-auto custom-scrollbar">
                    {Object.keys(result.headers).length > 0 ? (
                      Object.entries(result.headers).map(([key, value]) => (
                        <div key={key} className="flex gap-2 py-0.5 border-b border-slate-900/50 last:border-0">
                          <span className="text-rose-400/80 shrink-0">{key}:</span>
                          <span className="break-all">{value}</span>
                        </div>
                      ))
                    ) : (
                      <p className="italic text-slate-500">No se recibieron cabeceras</p>
                    )}
                    {result.error && (
                      <div className="mt-2 text-rose-400 font-bold">
                        Error: {result.error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Final URL */}
                <div className="flex flex-col gap-1 px-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">URL Final (Redirecciones)</p>
                  <a
                    href={result.finalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 truncate"
                  >
                    {result.finalUrl}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
