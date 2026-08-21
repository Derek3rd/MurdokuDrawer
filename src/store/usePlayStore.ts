import { create } from 'zustand';
import { emptyPlayState, loadPlayState, resetPlayState, savePlayState, type PlayState } from '../storage/playStorage';

interface PlayStoreState {
  puzzleId: string | null;
  playState: PlayState;
  load: (puzzleId: string) => void;
  toggleCandidate: (cellId: string, suspectId: string) => void;
  confirmSuspect: (suspectId: string, cellId: string) => void;
  unconfirmSuspect: (suspectId: string) => void;
  reset: () => void;
}

function persist(puzzleId: string | null, state: PlayState) {
  if (puzzleId) savePlayState(puzzleId, state);
}

export const usePlayStore = create<PlayStoreState>((set) => ({
  puzzleId: null,
  playState: emptyPlayState(),

  load: (puzzleId) => set({ puzzleId, playState: loadPlayState(puzzleId) }),

  toggleCandidate: (cellId, suspectId) =>
    set((s) => {
      const current = s.playState.candidates[cellId] ?? [];
      const has = current.includes(suspectId);
      const next = has ? current.filter((id) => id !== suspectId) : [...current, suspectId];
      const candidates = { ...s.playState.candidates, [cellId]: next };
      const playState = { ...s.playState, candidates };
      persist(s.puzzleId, playState);
      return { playState };
    }),

  confirmSuspect: (suspectId, cellId) =>
    set((s) => {
      const confirmed = { ...s.playState.confirmed, [suspectId]: cellId };
      const playState = { ...s.playState, confirmed };
      persist(s.puzzleId, playState);
      return { playState };
    }),

  unconfirmSuspect: (suspectId) =>
    set((s) => {
      const confirmed = { ...s.playState.confirmed };
      delete confirmed[suspectId];
      const playState = { ...s.playState, confirmed };
      persist(s.puzzleId, playState);
      return { playState };
    }),

  reset: () =>
    set((s) => {
      if (s.puzzleId) resetPlayState(s.puzzleId);
      return { playState: emptyPlayState() };
    }),
}));
