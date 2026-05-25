const DEFAULT_LOCAL_API = 'http://localhost:3000';

const normalize = (value: string) => value.trim().replace(/\/$/, '');

/** Dev Tunnel to‘g‘ridan-to‘g‘ri backend: `w0nsm65d-5173...` → `w0nsm65d-3000...` (VITE_TUNNEL_API_DIRECT=true). */
function tunnelBackendOrigin(protocol: string, hostname: string): string {
  const apiHost = hostname.replace(/-\d+(?=\.)/, '-3000');
  return `${protocol}//${apiHost}`;
}

// Resolve backend URL for local dev and forwarded tunnel hosts.
export const resolveApiBaseUrl = (): string => {
  const envValue = (import.meta as any).env?.VITE_API_BASE_URL;
  if (typeof envValue === 'string' && envValue.trim()) {
    return normalize(envValue);
  }

  if (typeof window === 'undefined') {
    return DEFAULT_LOCAL_API;
  }

  const { protocol, hostname } = window.location;
  const hostLower = hostname.toLowerCase();

  // Dev Tunnel: faqat 5173 forward qilingan bo‘lsa — /api Vite proxy → backend (3000 alohida tunnel shart emas).
  if (hostLower.includes('.devtunnels.ms') || hostLower.includes('.cursor.sh')) {
    const useDirectTunnel = String((import.meta as any).env?.VITE_TUNNEL_API_DIRECT ?? '').toLowerCase() === 'true';
    if (useDirectTunnel) {
      return tunnelBackendOrigin(protocol, hostname);
    }
    return '/api';
  }

  // Lokal Vite dev (kompyuter brauzeri).
  if ((import.meta as any).env?.DEV) {
    return '/api';
  }

  return `${protocol}//${hostname}:3000`;
};
