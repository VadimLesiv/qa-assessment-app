import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginInput, PlayerProfile, RegisterInput } from '@qa/shared';
import { api, getToken, setToken } from './api';

interface PlayerContextValue {
  profile: PlayerProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  /** Replaces the cached profile after an action that awarded XP. */
  setProfile: (profile: PlayerProfile) => void;
  refresh: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/**
 * Holds the signed-in player's session (token) and their XP, level and badges,
 * so the HUD updates the moment a card is learned or a quiz is submitted.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      setProfile(await api.me());
    } catch {
      // An expired or invalid token: the API client already cleared it.
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const result = await api.login(input);
    setToken(result.token);
    setProfile(result.profile);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.register(input);
    setToken(result.token);
    setProfile(result.profile);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ profile, loading, isAuthenticated: profile !== null, setProfile, refresh, login, register, logout }),
    [profile, loading, refresh, login, register, logout],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used inside a PlayerProvider');
  return context;
}
