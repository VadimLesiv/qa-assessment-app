import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PlayerProfile } from '@qa/shared';
import { api } from './api';

interface PlayerContextValue {
  profile: PlayerProfile | null;
  loading: boolean;
  /** Replaces the cached profile after an action that awarded XP. */
  setProfile: (profile: PlayerProfile) => void;
  refresh: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/**
 * Holds the player's XP, level and badges for the whole app so the HUD updates
 * the moment a card is learned or a quiz is submitted, without extra requests.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setProfile(await api.getProfile());
    } catch {
      // The HUD degrades to empty rather than blocking the whole app.
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ profile, loading, setProfile, refresh }),
    [profile, loading, refresh],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used inside a PlayerProvider');
  return context;
}
