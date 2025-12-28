import { create } from 'zustand';
import { apiRequest } from '../services/api';

const TOKEN_KEY = 'music_collab_token';

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: null,
  loading: false,
  error: '',

  isAuthenticated: () => Boolean(get().token),

  setToken: (token) => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    set({ token });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: '', user: null, error: '' });
  },

  fetchMe: async () => {
    const { token } = get();
    if (!token) return null;

    set({ loading: true, error: '' });
    try {
      const user = await apiRequest('/api/auth/me', { token });
      set({ user, loading: false });
      return user;
    } catch (e) {
      set({ loading: false, user: null, token: '', error: e instanceof Error ? e.message : String(e) });
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  },

  register: async ({ username, email, password }) => {
    set({ loading: true, error: '' });
    try {
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: { username, email, password },
      });
      const token = data?.token || '';
      if (!token) throw new Error('No token returned');
      localStorage.setItem(TOKEN_KEY, token);
      set({ token, loading: false });
      await get().fetchMe();
      return true;
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  login: async ({ email, password }) => {
    set({ loading: true, error: '' });
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      const token = data?.token || '';
      if (!token) throw new Error('No token returned');
      localStorage.setItem(TOKEN_KEY, token);
      set({ token, loading: false });
      await get().fetchMe();
      return true;
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },
}));
