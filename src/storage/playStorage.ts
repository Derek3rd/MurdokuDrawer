export interface PlayState {
  /** cellId -> lista di suspectId segnati come candidati in quella cella */
  candidates: Record<string, string[]>;
  /** suspectId -> cellId confermato */
  confirmed: Record<string, string>;
}

export function emptyPlayState(): PlayState {
  return { candidates: {}, confirmed: {} };
}

function key(puzzleId: string): string {
  return `murdoku:play:${puzzleId}`;
}

export function loadPlayState(puzzleId: string): PlayState {
  try {
    const raw = localStorage.getItem(key(puzzleId));
    return raw ? (JSON.parse(raw) as PlayState) : emptyPlayState();
  } catch {
    return emptyPlayState();
  }
}

export function savePlayState(puzzleId: string, state: PlayState): void {
  localStorage.setItem(key(puzzleId), JSON.stringify(state));
}

export function resetPlayState(puzzleId: string): void {
  localStorage.removeItem(key(puzzleId));
}
