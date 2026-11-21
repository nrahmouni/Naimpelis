import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import type { MusicTrack } from '../types/music';

export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

export interface OAuthImportedPlaylist {
  id: string;
  name: string;
  description: string;
  cover?: string;
  tracks: MusicTrack[];
}

export interface FullOAuthImportResult {
  ok: boolean;
  provider: 'spotify' | 'youtube_music';
  accountLabel: string;
  likedTracks: MusicTrack[];
  playlists: OAuthImportedPlaylist[];
  favoriteArtists: string[];
  favoriteGenres: string[];
  totalTracksImported: number;
  error?: string;
}

export interface SpotifyOAuthStatus {
  configured: boolean;
  activeCallbackUrl: string;
  devCallbackUrl: string;
  scopes: string[];
}

const youtubeGoogleProvider = new GoogleAuthProvider();
youtubeGoogleProvider.addScope(YOUTUBE_READONLY_SCOPE);
youtubeGoogleProvider.setCustomParameters({
  prompt: 'consent select_account',
});

// Tokens held strictly in JS memory (never persisted in localStorage/sessionStorage)
let cachedYoutubeAccessToken: string | null = null;
let cachedSpotifySessionToken: string | null = null;
let authListenerInitialized = false;

export function initMusicOAuthMemoryCleanup() {
  if (authListenerInitialized || typeof window === 'undefined') return;
  authListenerInitialized = true;
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedYoutubeAccessToken = null;
    }
  });
}

export async function fetchSpotifyOAuthStatus(): Promise<SpotifyOAuthStatus> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(
    `/api/music/oauth/spotify/status?origin=${encodeURIComponent(origin)}`,
    { cache: 'no-store' }
  );
  if (!res.ok) {
    throw new Error('No se pudo consultar el estado de Spotify OAuth.');
  }
  const data = await res.json();
  return {
    configured: Boolean(data?.configured),
    activeCallbackUrl: String(data?.activeCallbackUrl || ''),
    devCallbackUrl: String(data?.devCallbackUrl || ''),
    scopes: Array.isArray(data?.scopes) ? data.scopes : [],
  };
}

export async function connectAndImportYoutubeAccount(): Promise<FullOAuthImportResult> {
  initMusicOAuthMemoryCleanup();
  let result;
  try {
    result = await signInWithPopup(auth, youtubeGoogleProvider);
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    const msg = err instanceof Error ? err.message : String(err || '');

    if (code === 'auth/popup-blocked') {
      throw new Error(
        'El navegador bloqueó la ventana de Google. Permite popups e inténtalo de nuevo.'
      );
    }
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request'
    ) {
      throw new Error(
        'Se cerró el inicio de sesión de Google antes de completarse. Si Google mostró "Error 403: access_denied (verificación de Google)", añade ese correo en "Usuarios de prueba" (Test users) de Google Cloud Console o usa la pestaña "Enlace" para importar tu playlist sin login.'
      );
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        'Este dominio no está autorizado en Firebase Authentication (Authorized domains).'
      );
    }
    if (msg.toLowerCase().includes('access_denied')) {
      throw new Error(
        'Google bloqueó el acceso (Error 403: app en modo prueba). Añade el correo en Google Cloud Console → OAuth consent screen → Test users, o importa por enlace público.'
      );
    }
    throw new Error(
      'No se pudo completar el inicio de sesión con Google / YouTube. Inténtalo de nuevo o pega tu enlace de playlist en la pestaña "Enlace".'
    );
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken || cachedYoutubeAccessToken;

  if (!accessToken) {
    throw new Error(
      'Google no devolvió el permiso de lectura de YouTube. Acepta el permiso en el popup para continuar.'
    );
  }

  cachedYoutubeAccessToken = accessToken;

  const importRes = await fetch('/api/music/oauth/youtube/import', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = (await importRes.json().catch(() => null)) as FullOAuthImportResult | null;
  if (!importRes.ok || !payload?.ok) {
    if (importRes.status === 401) {
      cachedYoutubeAccessToken = null;
    }
    throw new Error(
      payload?.error || 'No se pudieron importar tus listas y gustos de YouTube Music.'
    );
  }

  return payload;
}

export async function connectAndImportSpotifyAccount(): Promise<FullOAuthImportResult> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const urlRes = await fetch(
    `/api/music/oauth/spotify/url?origin=${encodeURIComponent(origin)}`,
    { cache: 'no-store' }
  );
  const urlData = await urlRes.json().catch(() => null);
  if (!urlRes.ok || !urlData?.url) {
    throw new Error(
      urlData?.error || 'Spotify OAuth no está configurado en el servidor todavía.'
    );
  }

  const popup = window.open(
    String(urlData.url),
    'riffan_spotify_oauth',
    'width=540,height=740,menubar=no,toolbar=no,status=no'
  );

  if (!popup) {
    throw new Error(
      'El navegador bloqueó el popup de Spotify. Permite ventanas emergentes e inténtalo de nuevo.'
    );
  }

  const sessionToken = await new Promise<string>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(closedPoll);
      window.clearTimeout(timeoutTimer);
    };

    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(msg));
    };

    const onMessage = (event: MessageEvent) => {
      const msgOrigin = String(event.origin || '');
      const trusted =
        msgOrigin === window.location.origin ||
        msgOrigin.endsWith('.run.app') ||
        msgOrigin.endsWith('.ai.studio') ||
        msgOrigin.includes('localhost');
      if (!trusted) return;

      if (event.data?.type === 'SPOTIFY_OAUTH_SUCCESS' && event.data?.sessionToken) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(String(event.data.sessionToken));
      } else if (event.data?.type === 'SPOTIFY_OAUTH_ERROR') {
        fail(String(event.data?.error || 'No se completó el inicio de sesión en Spotify.'));
      }
    };

    const closedPoll = window.setInterval(() => {
      try {
        if (popup.closed && !settled) {
          fail('Has cerrado la ventana de Spotify antes de completar la conexión.');
        }
      } catch {
        // Cross-origin popup check can throw momentarily while redirecting
      }
    }, 500);

    const timeoutTimer = window.setTimeout(() => {
      fail('Se agotó el tiempo de espera al conectar con Spotify.');
    }, 180_000);

    window.addEventListener('message', onMessage);
  });

  cachedSpotifySessionToken = sessionToken;

  const importRes = await fetch('/api/music/oauth/spotify/import', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cachedSpotifySessionToken}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = (await importRes.json().catch(() => null)) as FullOAuthImportResult | null;
  if (!importRes.ok || !payload?.ok) {
    cachedSpotifySessionToken = null;
    throw new Error(
      payload?.error || 'No se pudieron importar tus canciones y gustos de Spotify.'
    );
  }

  return payload;
}
