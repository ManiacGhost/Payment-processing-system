// API client with JWT token management and auto-refresh

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const TOKEN_KEY = 'nexuspay_access_token';
const REFRESH_KEY = 'nexuspay_refresh_token';
const USER_KEY = 'nexuspay_user';

export function getAccessToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function getRefreshToken(): string | null { return localStorage.getItem(REFRESH_KEY); }
export function getStoredUser() {
  const u = localStorage.getItem(USER_KEY);
  return u ? JSON.parse(u) : null;
}

export function storeAuth(accessToken: string, refreshToken: string, user: any) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

// Auto-refresh on 401
async function refreshAccessToken(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });

    if (!res.ok) { clearAuth(); return null; }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    return data.accessToken;
  } catch {
    clearAuth();
    return null;
  }
}

// Authenticated fetch wrapper
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token = getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Prepend API_BASE_URL if url starts with /api
  const fullUrl = url.startsWith('/api') ? `${API_BASE_URL}${url.slice(4)}` : url;
  let res = await fetch(fullUrl, { ...options, headers });

  // If 401, try refreshing
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(fullUrl, { ...options, headers });
    }
  }

  return res;
}

// Auth API calls
export async function apiRegister(name: string, email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
  const data = await res.json();
  storeAuth(data.accessToken, data.refreshToken, data.user);
  return data.user;
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
  const data = await res.json();
  storeAuth(data.accessToken, data.refreshToken, data.user);
  return data.user;
}

export async function apiLogout() {
  const rt = getRefreshToken();
  if (rt) {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => {});
  }
  clearAuth();
}
