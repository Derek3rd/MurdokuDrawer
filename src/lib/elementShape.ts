import { cellId, parseCellId, type Direction, type MapElement, type ResolvedElementType } from '../types/puzzle';

const DELTAS: Record<Direction, [number, number]> = {
  N: [-1, 0],
  S: [1, 0],
  E: [0, 1],
  O: [0, -1],
};

/** Direzioni (N/S/E/O) verso celle adiacenti che condividono lo stesso groupId+type dell'elemento. */
export function elementConnections(element: MapElement, elements: MapElement[]): Direction[] {
  if (!element.groupId) return [];
  const { row, col } = parseCellId(element.cellId);
  const siblingCells = new Set(
    elements.filter((e) => e.groupId === element.groupId && e.type === element.type).map((e) => e.cellId),
  );
  const dirs: Direction[] = [];
  for (const dir of Object.keys(DELTAS) as Direction[]) {
    const [dr, dc] = DELTAS[dir];
    if (siblingCells.has(cellId(row + dr, col + dc))) dirs.push(dir);
  }
  return dirs;
}

export interface ElementVisual {
  image?: string;
  icon?: string;
  rotationDeg: number;
}

/**
 * Sceglie la variante (isolata/estremità/angolo/dritto) e la rotazione da applicare in base a come
 * la cella si collega alle celle adiacenti dello stesso oggetto multi-cella. Convenzioni sugli SVG
 * a rotazione 0: "estremità" attacca verso Est, "dritto" collega Est-Ovest, "angolo" collega Est-Sud.
 * Con 3+ connessioni (incrocio/T, non generabile trascinando in linea) o varianti mancanti, ricade
 * sulla variante isolata.
 */
export function resolveElementVisual(entry: ResolvedElementType, connections: Direction[]): ElementVisual {
  const set = new Set(connections);
  const isolated: ElementVisual = { image: entry.image, icon: entry.icon, rotationDeg: 0 };
  if (set.size === 0 || !entry.capImage) return isolated;

  if (set.size === 1) {
    const rotationDeg = { E: 0, S: 90, O: 180, N: 270 }[connections[0]];
    return { image: entry.capImage, icon: entry.icon, rotationDeg };
  }

  if (set.size === 2) {
    if (entry.straightImage) {
      if (set.has('E') && set.has('O')) return { image: entry.straightImage, icon: entry.icon, rotationDeg: 0 };
      if (set.has('N') && set.has('S')) return { image: entry.straightImage, icon: entry.icon, rotationDeg: 90 };
    }
    if (entry.cornerImage) {
      if (set.has('E') && set.has('S')) return { image: entry.cornerImage, icon: entry.icon, rotationDeg: 0 };
      if (set.has('S') && set.has('O')) return { image: entry.cornerImage, icon: entry.icon, rotationDeg: 90 };
      if (set.has('O') && set.has('N')) return { image: entry.cornerImage, icon: entry.icon, rotationDeg: 180 };
      if (set.has('N') && set.has('E')) return { image: entry.cornerImage, icon: entry.icon, rotationDeg: 270 };
    }
  }

  return isolated;
}
