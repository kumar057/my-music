import { env } from '$env/dynamic/public';

const SUPABASE_URL = env.PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
const SUPABASE_ANON_KEY = env.PUBLIC_SUPABASE_ANON_KEY ?? '';
const SESSION_KEY = 'myMusicSupabaseSession';

export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { id: string; email?: string };
};

function ensureConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Authentication is not configured yet. Add PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.');
  }
}

async function request(path: string, body: Record<string, unknown>) {
  ensureConfigured();
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.msg === 'string' ? data.msg : typeof data.error_description === 'string' ? data.error_description : typeof data.message === 'string' ? data.message : 'Authentication failed.');
  }
  return data;
}

function saveSession(data: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof data.access_token !== 'string') return;
  const session: AuthSession = {
    access_token: data.access_token,
    refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    expires_at: typeof data.expires_at === 'number' ? data.expires_at : undefined,
    user: typeof data.user === 'object' && data.user !== null ? data.user as AuthSession['user'] : undefined
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function signIn(email: string, password: string) {
  const data = await request('token?grant_type=password', { email, password });
  saveSession(data);
  return data as AuthSession;
}

export async function signUp(email: string, password: string) {
  const data = await request('signup', { email, password });
  if (typeof data.access_token === 'string') saveSession(data);
  return data as AuthSession & { confirmation_required?: boolean };
}

export async function signOut() {
  if (typeof window === 'undefined') return;
  const session = getSession();
  if (session?.access_token && SUPABASE_URL && SUPABASE_ANON_KEY) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` }
    }).catch(() => undefined);
  }
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem('myMusicAuth');
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getSession()?.access_token);
}
