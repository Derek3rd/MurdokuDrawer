import { cellId, parseCellId, type Direction, type MapElement, type ResolvedElementType } from '../types/puzzle';

const NEIGHBOR_DELTAS: Record<Direction, [number, number]> = {
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
  for (const dir of Object.keys(NEIGHBOR_DELTAS) as Direction[]) {
    const [dr, dc] = NEIGHBOR_DELTAS[dir];
    if (siblingCells.has(cellId(row + dr, col + dc))) dirs.push(dir);
  }
  return dirs;
}

export interface ElementVisual {
  image?: string;
  icon?: string;
  rotationDeg: number;
}

// Ordine orario delle direzioni, usato per calcolare di quanti passi da 90° ruotare la forma
// base per farla combaciare con il set di collegamenti reale della cella.
const CLOCKWISE: Direction[] = ['N', 'E', 'S', 'O'];

function rotateDirCW(d: Direction, steps: number): Direction {
  return CLOCKWISE[(CLOCKWISE.indexOf(d) + steps) % 4];
}

function rotateSetCW(base: Direction[], steps: number): Set<Direction> {
  return new Set(base.map((d) => rotateDirCW(d, steps)));
}

function connectionsEqual(a: Set<Direction>, b: Set<Direction>): boolean {
  return a.size === b.size && [...a].every((d) => b.has(d));
}

/** Trova quanti passi (0-3) da 90° in senso orario servono per portare `base` a combaciare con `target`. */
function findRotationSteps(base: Direction[], target: Set<Direction>): number | null {
  for (let steps = 0; steps < 4; steps++) {
    if (connectionsEqual(rotateSetCW(base, steps), target)) return steps;
  }
  return null;
}

// Orientamento "a rotazione 0°" convenzionale di ogni forma con più di un collegamento
// (vedi il commento su ElementCatalogEntry in types/puzzle.ts per la stessa convenzione).
const BASE_CORNER: Direction[] = ['N', 'E'];
const BASE_STRAIGHT: Direction[] = ['N', 'S'];
const BASE_T: Direction[] = ['N', 'E', 'O'];

/**
 * Sceglie la variante (isolata/estremità/angolo/dritto/incrocio a T/croce) e la rotazione da
 * applicare in base a come la cella si collega alle celle adiacenti dello stesso oggetto
 * multi-cella. Con connessioni non generabili trascinando/collegando (nessuna variante adatta
 * caricata) ricade sulla variante isolata.
 */
export function resolveElementVisual(entry: ResolvedElementType, connections: Direction[]): ElementVisual {
  const set = new Set(connections);
  const isolated: ElementVisual = { image: entry.image, icon: entry.icon, rotationDeg: 0 };
  if (set.size === 0) return isolated;

  if (set.size === 1) {
    const dir = connections[0];
    const byDirection = entry.capImageByDirection?.[dir];
    if (byDirection) return { image: byDirection, icon: entry.icon, rotationDeg: 0 };
    if (entry.capImage) {
      const steps = findRotationSteps(['N'], set) ?? 0;
      return { image: entry.capImage, icon: entry.icon, rotationDeg: steps * 90 };
    }
    return isolated;
  }

  if (set.size === 2) {
    if (entry.straightImage) {
      const steps = findRotationSteps(BASE_STRAIGHT, set);
      if (steps !== null) return { image: entry.straightImage, icon: entry.icon, rotationDeg: steps * 90 };
    }
    if (entry.cornerImage) {
      const steps = findRotationSteps(BASE_CORNER, set);
      if (steps !== null) return { image: entry.cornerImage, icon: entry.icon, rotationDeg: steps * 90 };
    }
    return isolated;
  }

  if (set.size === 3) {
    if (entry.tImage) {
      const steps = findRotationSteps(BASE_T, set);
      if (steps !== null) return { image: entry.tImage, icon: entry.icon, rotationDeg: steps * 90 };
    }
    return isolated;
  }

  if (set.size === 4 && entry.crossImage) {
    return { image: entry.crossImage, icon: entry.icon, rotationDeg: 0 };
  }

  return isolated;
}
