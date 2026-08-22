import type { Puzzle } from '../types/puzzle';

const LIBRARY_KEY = 'murdoku:puzzles';

type Library = Record<string, Puzzle>;

/** Riempie con default i campi introdotti dopo la creazione di puzzle salvati in precedenza. */
function withDefaults(p: Partial<Puzzle>): Puzzle {
  return {
    customElementTypes: [],
    areaNames: [],
    windows: [],
    disabledCells: [],
    ...p,
  } as Puzzle;
}

function readLibrary(): Library {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return {};
    const lib = JSON.parse(raw) as Library;
    for (const id of Object.keys(lib)) lib[id] = withDefaults(lib[id]);
    return lib;
  } catch {
    return {};
  }
}

function writeLibrary(lib: Library): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
}

export function listPuzzles(): Puzzle[] {
  return Object.values(readLibrary()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadPuzzle(id: string): Puzzle | null {
  return readLibrary()[id] ?? null;
}

export function savePuzzle(puzzle: Puzzle): void {
  const lib = readLibrary();
  lib[puzzle.id] = puzzle;
  writeLibrary(lib);
}

export function deletePuzzle(id: string): void {
  const lib = readLibrary();
  delete lib[id];
  writeLibrary(lib);
}

export function exportPuzzleToJson(puzzle: Puzzle): string {
  return JSON.stringify(puzzle, null, 2);
}

/** Valida in modo minimale che il JSON importato abbia la forma di un Puzzle. */
export function importPuzzleFromJson(json: string): Puzzle {
  const data = JSON.parse(json);
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof data.width !== 'number' ||
    typeof data.height !== 'number' ||
    !Array.isArray(data.suspects)
  ) {
    throw new Error('File non valido: formato Murdoku non riconosciuto');
  }
  return data as Puzzle;
}

export function downloadPuzzleAsFile(puzzle: Puzzle): void {
  const json = exportPuzzleToJson(puzzle);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${puzzle.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'murdoku'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function readPuzzleFromFile(file: File): Promise<Puzzle> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(importPuzzleFromJson(reader.result as string));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
