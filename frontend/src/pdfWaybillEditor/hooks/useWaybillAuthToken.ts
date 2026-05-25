const AUTH_STORAGE_KEY = 'smartroute-auth-session';

export const getWaybillAuthToken = () => {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { token?: string };
    return String(parsed?.token ?? '');
  } catch {
    return '';
  }
};
