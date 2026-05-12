import axios from 'axios';
import { Platform } from 'react-native';
import { useAuthStore } from '@/stores/authStore';

// Web browser runs on the same machine as the API → localhost works fine.
// Android emulator uses 10.0.2.2 as its alias for the host machine.
const API_BASE = Platform.OS === 'web'
  ? 'http://localhost:4000'
  : (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4000').replace(/\/$/, '');

console.log('[CricOS] Using API:', API_BASE, `(${Platform.OS})`);

export const apiClient = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Singleton refresh promise — prevents concurrent 401s from each kicking off
// their own token refresh (which would invalidate each other).
let refreshPromise: Promise<string> | null = null;

apiClient.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/auth/refresh')) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          const refreshToken = useAuthStore.getState().refreshToken;
          refreshPromise = axios
            .post(`${API_BASE}/api/v1/auth/refresh`, { refreshToken })
            .then(({ data }) => {
              useAuthStore.getState().setTokens(data.data.accessToken, data.data.refreshToken);
              return data.data.accessToken as string;
            })
            .finally(() => { refreshPromise = null; });
        }
        const newToken = await refreshPromise;
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      } catch {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);

export const matchesApi = {
  list: (params?: Record<string, string>) => apiClient.get('/matches', { params }),
  get: (id: string) => apiClient.get(`/matches/${id}`),
  getPublic: (token: string) => apiClient.get(`/matches/public/${token}`),
  create: (data: unknown) => apiClient.post('/matches', data),
  setToss: (id: string, data: unknown) => apiClient.patch(`/matches/${id}/toss`, data),
  setResult: (id: string, data: unknown) => apiClient.patch(`/matches/${id}/result`, data),
  assignScorer: (id: string, scorerId: string | null) => apiClient.patch(`/matches/${id}/scorer`, { scorerId }),
  getEligibleScorers: (id: string) => apiClient.get(`/matches/${id}/eligible-scorers`),
};

export const scoringApi = {
  startInnings: (matchId: string, data: unknown) =>
    apiClient.post(`/scoring/matches/${matchId}/innings`, data),
  endInnings: (inningsId: string) => apiClient.patch(`/scoring/innings/${inningsId}/complete`, {}),
  scoreBall: (data: unknown) => apiClient.post('/scoring/ball', data),
  undoBall: (ballId: string) => apiClient.delete(`/scoring/ball/${ballId}`),
  getInnings: (id: string) => apiClient.get(`/scoring/innings/${id}`),
  getScorecard: (matchId: string) => apiClient.get(`/scoring/matches/${matchId}/scorecard`),
  startSuperOver: (matchId: string) => apiClient.post(`/scoring/matches/${matchId}/super-over`, {}),
};

export const leaguesApi = {
  list:         (params?: Record<string, string>) => apiClient.get('/leagues', { params }),
  get:          (idOrSlug: string)  => apiClient.get(`/leagues/${idOrSlug}`),
  create:       (data: unknown)     => apiClient.post('/leagues', data),
  update:       (id: string, data: unknown) => apiClient.patch(`/leagues/${id}`, data),
  getStandings: (id: string)        => apiClient.get(`/leagues/${id}/standings`),
  registerTeam: (id: string, teamId: string) =>
    apiClient.post(`/leagues/${id}/teams`, { teamId }),
};

export const teamsApi = {
  get:       (id: string)          => apiClient.get(`/teams/${id}`),
  create:    (data: unknown)       => apiClient.post('/teams', data),
  addPlayer: (id: string, data: unknown) => apiClient.post(`/teams/${id}/players`, data),
  removePlayer: (id: string, playerId: string) => apiClient.delete(`/teams/${id}/players/${playerId}`),
  search:    (q: string)           => apiClient.get('/search', { params: { q, type: 'TEAM', limit: '20' } }),
};

export const playersApi = {
  list:       (params?: Record<string, string>) => apiClient.get('/players', { params }),
  get:        (id: string)        => apiClient.get(`/players/${id}`),
  getStats:   (id: string)        => apiClient.get(`/players/${id}/stats`),
  create:     (data: unknown)     => apiClient.post('/players', data),
  update:     (id: string, data: unknown) => apiClient.patch(`/players/${id}`, data),
};

export const searchApi = {
  search: (q: string, params?: Record<string, string>) =>
    apiClient.get('/search', { params: { q, ...params } }),
  getRecent: () => apiClient.get('/search/recent'),
  saveRecent: (data: unknown) => apiClient.post('/search/recent', data),
};

export const authApi = {
  login: (data: unknown) => apiClient.post('/auth/login', data),
  register: (data: unknown) => apiClient.post('/auth/register', data),
  me: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout', {}),
};
