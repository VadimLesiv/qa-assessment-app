import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LoginInput, PlayerProfile, RegisterInput } from '@qa/shared';
import { useCelebration } from '../components/Celebration';
import { api, getToken, setToken } from './api';

/** Whole calendar days between two instants, ignoring clock time. */
function calendarDaysBetween(a: Date, b: Date): number {
  const dayA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const dayB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((dayB - dayA) / 86_400_000);
}

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
  const [profile, setProfileState] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const celebrate = useCelebration();

  // Latest profile, readable synchronously so a new one can be diffed against it.
  const profileRef = useRef<PlayerProfile | null>(null);

  /** Silent replacement: login, refresh and logout must not pop up milestones. */
  const setProfile = useCallback((next: PlayerProfile | null) => {
    profileRef.current = next;
    setProfileState(next);
  }, []);

  /** Replacement after an action that may have earned XP: announces level and streak changes. */
  const applyProfile = useCallback(
    (next: PlayerProfile) => {
      const prev = profileRef.current;
      setProfile(next);
      if (!prev || prev.id !== next.id) return;

      if (next.level > prev.level) celebrate.levelUp(next.level, next.xp);

      if (prev.lastActiveAt && next.lastActiveAt && next.lastActiveAt !== prev.lastActiveAt) {
        const gap = calendarDaysBetween(new Date(prev.lastActiveAt), new Date(next.lastActiveAt));
        if (gap === 1) celebrate.streakExtended(next.streakDays);
        else if (gap > 1) celebrate.streakReset();
      }
    },
    [celebrate, setProfile],
  );

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
    () => ({ profile, loading, isAuthenticated: profile !== null, setProfile: applyProfile, refresh, login, register, logout }),
    [profile, loading, applyProfile, refresh, login, register, logout],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used inside a PlayerProvider');
  return context;
}
