import { create } from 'zustand';
import { BallEvent, InningsState } from '@cricket-os/shared';

interface ScoringStore {
  currentInningsState: InningsState | null;
  pendingBalls: BallEvent[];
  lastBallId: string | null;
  isOnline: boolean;

  setInningsState: (state: InningsState) => void;
  addPendingBall: (ball: BallEvent) => void;
  removePendingBall: (clientId: string) => void;
  setLastBallId: (id: string | null) => void;
  setOnline: (online: boolean) => void;
  reset: () => void;
}

export const useScoringStore = create<ScoringStore>((set) => ({
  currentInningsState: null,
  pendingBalls: [],
  lastBallId: null,
  isOnline: true,

  setInningsState: (currentInningsState) => set({ currentInningsState }),
  addPendingBall: (ball) => set((s) => ({ pendingBalls: [...s.pendingBalls, ball] })),
  removePendingBall: (clientId) =>
    set((s) => ({ pendingBalls: s.pendingBalls.filter((b) => b.clientId !== clientId) })),
  setLastBallId: (lastBallId) => set({ lastBallId }),
  setOnline: (isOnline) => set({ isOnline }),
  reset: () =>
    set({ currentInningsState: null, pendingBalls: [], lastBallId: null }),
}));
