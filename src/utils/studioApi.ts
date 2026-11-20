import { auth } from '../firebase';
import { getStoredProfile } from './storage';

export async function getFirebaseBearerHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (user && !user.isAnonymous) {
    try {
      const token = await user.getIdToken();
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    } catch {
      // Fall through to anonymous token or guest header
    }
  }

  if (user) {
    try {
      const token = await user.getIdToken();
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    } catch {
      // Fallback below
    }
  }

  try {
    const localProfile = getStoredProfile();
    if (localProfile?.id) {
      return {
        'x-riffan-user-id': localProfile.id,
        Authorization: `Bearer riffan_profile_${localProfile.id}`,
      };
    }
  } catch {
    // fallback
  }

  return {};
}

export async function studioFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getFirebaseBearerHeaders();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
    ...authHeaders,
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    ok?: boolean;
    success?: boolean;
    error?: string;
  };
  if (!res.ok || data?.ok === false || data?.success === false) {
    throw new Error(data?.error || `Error HTTP ${res.status}`);
  }
  return data;
}
