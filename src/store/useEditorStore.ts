import { create } from 'zustand';
import {
  createEmptyPuzzle,
  suspectCount,
  DEFAULT_SUSPECT_COLORS,
  type Clue,
  type DistributiveOmit,
  type GlobalRule,
  type MapElement,
  type Puzzle,
  type Suspect,
} from '../types/puzzle';
import { loadPuzzle, savePuzzle } from '../storage/puzzleStorage';

interface EditorState {
  puzzle: Puzzle;
  newPuzzle: (width: number, height: number) => void;
  loadPuzzleById: (id: string) => void;
  setPuzzle: (puzzle: Puzzle) => void;
  rename: (name: string) => void;
  resize: (width: number, height: number) => void;
  toggleWallRight: (cellId: string) => void;
  toggleWallBottom: (cellId: string) => void;
  addElement: (element: Omit<MapElement, 'id'>) => void;
  updateElement: (id: string, patch: Partial<Omit<MapElement, 'id'>>) => void;
  removeElement: (id: string) => void;
  setSuspectSolution: (suspectId: string, cellId: string | null) => void;
  renameSuspect: (suspectId: string, name: string) => void;
  setKiller: (suspectId: string | null) => void;
  addClue: (clue: DistributiveOmit<Clue, 'id'>) => void;
  updateClue: (id: string, patch: Partial<Clue>) => void;
  removeClue: (id: string) => void;
  addGlobalRule: (rule: DistributiveOmit<GlobalRule, 'id'>) => void;
  removeGlobalRule: (id: string) => void;
}

function persist(puzzle: Puzzle): Puzzle {
  const updated = { ...puzzle, updatedAt: new Date().toISOString() };
  savePuzzle(updated);
  return updated;
}

export const useEditorStore = create<EditorState>((set) => ({
  puzzle: createEmptyPuzzle(6, 6),

  newPuzzle: (width, height) => set({ puzzle: persist(createEmptyPuzzle(width, height)) }),

  loadPuzzleById: (id) => {
    const p = loadPuzzle(id);
    if (p) set({ puzzle: p });
  },

  setPuzzle: (puzzle) => set({ puzzle: persist(puzzle) }),

  rename: (name) => set((s) => ({ puzzle: persist({ ...s.puzzle, name }) })),

  resize: (width, height) =>
    set((s) => {
      const n = suspectCount(width, height);
      const prevSuspects = s.puzzle.suspects;
      const suspects: Suspect[] = Array.from({ length: n }, (_, i) => {
        const existing = prevSuspects[i];
        return (
          existing ?? {
            id: `suspect-${i + 1}`,
            name: `Sospettato ${i + 1}`,
            color: DEFAULT_SUSPECT_COLORS[i % DEFAULT_SUSPECT_COLORS.length],
            solutionCellId: null,
          }
        );
      });
      // scarta muri/elementi/soluzioni fuori dai nuovi confini
      const inBounds = (cid: string) => {
        const [r, c] = cid.split('-').map(Number);
        return r < height && c < width;
      };
      return {
        puzzle: persist({
          ...s.puzzle,
          width,
          height,
          wallsRight: s.puzzle.wallsRight.filter(inBounds),
          wallsBottom: s.puzzle.wallsBottom.filter(inBounds),
          elements: s.puzzle.elements.filter((e) => inBounds(e.cellId)),
          suspects: suspects.map((sp) =>
            sp.solutionCellId && !inBounds(sp.solutionCellId) ? { ...sp, solutionCellId: null } : sp,
          ),
        }),
      };
    }),

  toggleWallRight: (cellId) =>
    set((s) => {
      const has = s.puzzle.wallsRight.includes(cellId);
      return {
        puzzle: persist({
          ...s.puzzle,
          wallsRight: has ? s.puzzle.wallsRight.filter((c) => c !== cellId) : [...s.puzzle.wallsRight, cellId],
        }),
      };
    }),

  toggleWallBottom: (cellId) =>
    set((s) => {
      const has = s.puzzle.wallsBottom.includes(cellId);
      return {
        puzzle: persist({
          ...s.puzzle,
          wallsBottom: has ? s.puzzle.wallsBottom.filter((c) => c !== cellId) : [...s.puzzle.wallsBottom, cellId],
        }),
      };
    }),

  addElement: (element) =>
    set((s) => ({
      puzzle: persist({
        ...s.puzzle,
        elements: [...s.puzzle.elements, { ...element, id: crypto.randomUUID() }],
      }),
    })),

  updateElement: (id, patch) =>
    set((s) => ({
      puzzle: persist({
        ...s.puzzle,
        elements: s.puzzle.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }),
    })),

  removeElement: (id) =>
    set((s) => ({
      puzzle: persist({
        ...s.puzzle,
        elements: s.puzzle.elements.filter((e) => e.id !== id),
        clues: s.puzzle.clues.filter(
          (c) => !((c.type === 'onElement' || c.type === 'nearElement') && c.elementId === id),
        ),
      }),
    })),

  setSuspectSolution: (suspectId, cellId) =>
    set((s) => ({
      puzzle: persist({
        ...s.puzzle,
        suspects: s.puzzle.suspects.map((sp) => (sp.id === suspectId ? { ...sp, solutionCellId: cellId } : sp)),
      }),
    })),

  renameSuspect: (suspectId, name) =>
    set((s) => ({
      puzzle: persist({
        ...s.puzzle,
        suspects: s.puzzle.suspects.map((sp) => (sp.id === suspectId ? { ...sp, name } : sp)),
      }),
    })),

  setKiller: (suspectId) => set((s) => ({ puzzle: persist({ ...s.puzzle, killerId: suspectId }) })),

  addClue: (clue) =>
    set((s) => ({
      puzzle: persist({ ...s.puzzle, clues: [...s.puzzle.clues, { ...clue, id: crypto.randomUUID() } as Clue] }),
    })),

  updateClue: (id, patch) =>
    set((s) => ({
      puzzle: persist({
        ...s.puzzle,
        clues: s.puzzle.clues.map((c) => (c.id === id ? ({ ...c, ...patch } as Clue) : c)),
      }),
    })),

  removeClue: (id) =>
    set((s) => ({ puzzle: persist({ ...s.puzzle, clues: s.puzzle.clues.filter((c) => c.id !== id) }) })),

  addGlobalRule: (rule) =>
    set((s) => ({
      puzzle: persist({
        ...s.puzzle,
        globalRules: [...s.puzzle.globalRules, { ...rule, id: crypto.randomUUID() } as GlobalRule],
      }),
    })),

  removeGlobalRule: (id) =>
    set((s) => ({
      puzzle: persist({ ...s.puzzle, globalRules: s.puzzle.globalRules.filter((r) => r.id !== id) }),
    })),
}));

export function currentPuzzle(): Puzzle {
  return useEditorStore.getState().puzzle;
}
