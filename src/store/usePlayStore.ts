import { create } from 'zustand';
import { emptyPlayState, loadPlayState, resetPlayState, savePlayState, type PlayState } from '../storage/playStorage';
import { parseCellId } from '../types/puzzle';

const MAX_HISTORY = 100;

interface PlayStoreState {
  puzzleId: string | null;
  playState: PlayState;
  history: PlayState[];
  load: (puzzleId: string) => void;
  toggleCandidate: (cellId: string, suspectId: string) => void;
  /** Svuota tutte le posizioni probabili (candidati) e la X manuale eventualmente segnate su una cella. */
  clearCellCandidates: (cellId: string) => void;
  /** Segna/toglie manualmente una cella come "non può essere occupata", a prescindere dal sospettato. */
  toggleManualMark: (cellId: string) => void;
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

  toggleCandidate: (cellId, suspectId) =>
    set((s) => {
      const current = s.playState.candidates[cellId] ?? [];
      const has = current.includes(suspectId);
      const next = has ? current.filter((id) => id !== suspectId) : [...current, suspectId];
      const candidates = { ...s.playState.candidates, [cellId]: next };
      return applyChange(s, { ...s.playState, candidates });
    }),

  clearCellCandidates: (cellId) =>
    set((s) => {
      const hasCandidates = !!s.playState.candidates[cellId];
      const hasManualMark = s.playState.manualMarks.includes(cellId);
      if (!hasCandidates && !hasManualMark) return {};
      const candidates = { ...s.playState.candidates };
      delete candidates[cellId];
      const manualMarks = hasManualMark
        ? s.playState.manualMarks.filter((c) => c !== cellId)
        : s.playState.manualMarks;
      return applyChange(s, { ...s.playState, candidates, manualMarks });
    }),

  toggleManualMark: (cellId) =>
    set((s) => {
      const has = s.playState.manualMarks.includes(cellId);
      const manualMarks = has
        ? s.playState.manualMarks.filter((c) => c !== cellId)
        : [...s.playState.manualMarks, cellId];
      // Segnare una cella come "non occupabile" rende superflue le posizioni probabili lì
      // segnate: le cancella insieme al segno manuale (solo quando si aggiunge il segno,
      // non quando lo si toglie).
      let candidates = s.playState.candidates;
      if (!has && candidates[cellId]) {
        candidates = { ...candidates };
        delete candidates[cellId];
      }
      return applyChange(s, { ...s.playState, manualMarks, candidates });
    }),

  confirmSuspect: (suspectId, cellId) =>
    set((s) => {
      const confirmed = { ...s.playState.confirmed, [suspectId]: cellId };
      // Riga e colonna della cella confermata non possono più ospitare nessun altro
      // sospettato: rimuove ogni candidato e ogni segno manuale ormai ridondante lì
      // (la stessa esclusione è già coperta dalla X automatica). Le X automatiche di
      // riga/colonna restano calcolate a parte e non sono mai salvate qui, quindi non
      // possono essere rimosse dal giocatore. Il sospettato appena confermato ha ora una
      // posizione definitiva: i suoi eventuali candidati altrove sulla griglia non servono
      // più e vengono rimossi.
      const { row, col } = parseCellId(cellId);
      const inRowOrCol = (cid: string) => {
        const p = parseCellId(cid);
        return p.row === row || p.col === col;
      };
      const candidates: typeof s.playState.candidates = {};
      for (const [cid, ids] of Object.entries(s.playState.candidates)) {
        if (inRowOrCol(cid)) continue;
        const filtered = ids.filter((id) => id !== suspectId);
        if (filtered.length > 0) candidates[cid] = filtered;
      }
      const manualMarks = s.playState.manualMarks.filter((cid) => !inRowOrCol(cid));
      return applyChange(s, { ...s.playState, candidates, manualMarks, confirmed });
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
