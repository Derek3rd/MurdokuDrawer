export interface PlayState {
  /** cellId -> lista di suspectId segnati come candidati in quella cella */
  candidates: Record<string, string[]>;
  /** cellId -> lista di suspectId esclusi manualmente da quella cella (nota del giocatore) */
  manualExclusions: Record<string, string[]>;
  /** suspectId -> cellId confermato */
  confirmed: Record<string, string>;
}

export function emptyPlayState(): PlayState {
  return { candidates: {}, manualExclusions: {}, confirmed: {} };
}

function key(puzzleId: string): string {
  return `murdoku:play:${puzzleId}`;
}

export function loadPlayState(puzzleId: string): PlayState {
  try {
    const raw = localStorage.getItem(key(puzzleId));
    if (!raw) return emptyPlayState();
    return { ...emptyPlayState(), ...(JSON.parse(raw) as Partial<PlayState>) };
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
