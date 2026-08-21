import { create } from 'zustand';
import { emptyPlayState, loadPlayState, resetPlayState, savePlayState, type PlayState } from '../storage/playStorage';
import { parseCellId } from '../types/puzzle';

const MAX_HISTORY = 100;

interface PlayStoreState {
  puzzleId: string | null;
  playState: PlayState;
  history: PlayState[];
  load: (puzzleId: string) => void;
  /** Fa avanzare lo stato cella/sospettato: vuoto -> candidato -> esclusione manuale -> vuoto. */
  cycleMark: (cellId: string, suspectId: string) => void;
  confirmSuspect: (suspectId: string, cellId: string) => void;
  unconfirmSuspect: (suspectId: string) => void;
  undo: () => void;
  reset: () => void;
}

function persist(puzzleId: string | null, state: PlayState) {
  if (puzzleId) savePlayState(puzzleId, state);
}

/** Applica un cambiamento allo stato di gioco, salvando lo stato precedente nella cronologia per l'undo. */
function applyChange(s: Pick<PlayStoreState, 'playState' | 'history' | 'puzzleId'>, nextPlayState: PlayState) {
  persist(s.puzzleId, nextPlayState);
  return {
    playState: nextPlayState,
    history: [...s.history, s.playState].slice(-MAX_HISTORY),
  };
}

export const usePlayStore = create<PlayStoreState>((set) => ({
  puzzleId: null,
  playState: emptyPlayState(),
  history: [],

  load: (puzzleId) => set({ puzzleId, playState: loadPlayState(puzzleId), history: [] }),

  cycleMark: (cellId, suspectId) =>
    set((s) => {
      const cand = s.playState.candidates[cellId] ?? [];
      const excl = s.playState.manualExclusions[cellId] ?? [];
      let nextCand = cand;
      let nextExcl = excl;
      if (cand.includes(suspectId)) {
        // candidato -> esclusione manuale
        nextCand = cand.filter((id) => id !== suspectId);
        nextExcl = [...excl, suspectId];
      } else if (excl.includes(suspectId)) {
        // esclusione manuale -> vuoto
        nextExcl = excl.filter((id) => id !== suspectId);
      } else {
        // vuoto -> candidato
        nextCand = [...cand, suspectId];
      }
      const candidates = { ...s.playState.candidates, [cellId]: nextCand };
      const manualExclusions = { ...s.playState.manualExclusions, [cellId]: nextExcl };
      return applyChange(s, { ...s.playState, candidates, manualExclusions });
    }),

  confirmSuspect: (suspectId, cellId) =>
    set((s) => {
      const confirmed = { ...s.playState.confirmed, [suspectId]: cellId };
      // Riga e colonna della cella confermata non possono più ospitare nessun altro
      // sospettato: rimuove ogni annotazione manuale (candidato o esclusione) segnata
      // lì, per chiunque. Le X automatiche di riga/colonna restano calcolate a parte
      // e non sono mai salvate qui, quindi non possono essere rimosse dal giocatore.
      const { row, col } = parseCellId(cellId);
      const candidates = { ...s.playState.candidates };
      const manualExclusions = { ...s.playState.manualExclusions };
      for (const cid of Object.keys({ ...candidates, ...manualExclusions })) {
        const p = parseCellId(cid);
        if (p.row === row || p.col === col) {
          delete candidates[cid];
          delete manualExclusions[cid];
        }
      }
      return applyChange(s, { ...s.playState, candidates, manualExclusions, confirmed });
    }),

  unconfirmSuspect: (suspectId) =>
    set((s) => {
      const confirmed = { ...s.playState.confirmed };
      delete confirmed[suspectId];
      return applyChange(s, { ...s.playState, confirmed });
    }),

  undo: () =>
    set((s) => {
      if (s.history.length === 0) return s;
      const playState = s.history[s.history.length - 1];
      persist(s.puzzleId, playState);
      return { playState, history: s.history.slice(0, -1) };
    }),

  reset: () =>
    set((s) => {
      if (s.puzzleId) resetPlayState(s.puzzleId);
      return { playState: emptyPlayState(), history: [] };
    }),
}));
