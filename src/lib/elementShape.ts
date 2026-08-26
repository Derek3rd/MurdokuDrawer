import { cellId, parseCellId, type CellId, type Direction, type MapElement, type ResolvedElementType } from '../types/puzzle';

const NEIGHBOR_DELTAS: Record<Direction, [number, number]> = {
  N: [-1, 0],
  S: [1, 0],
  E: [0, 1],
  O: [0, -1],
};

const OPPOSITE: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'O', O: 'E' };

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

/**
 * Per una cella ad angolo (esattamente due collegamenti adiacenti, non opposti), controlla se la
 * cella diagonale "dentro" l'angolo fa anch'essa parte dello stesso oggetto: in tal caso l'angolo
 * va disegnato "pieno" (variante filledCornerImage, es. tappeto_22) invece che "cavo"
 * (cornerImage, es. tappeto_2) — es. un blocco 2x2 di tappeto usa tappeto_22 su tutte e quattro
 * le celle, perché ognuna ha la diagonale opposta occupata dallo stesso tappeto.
 */
export function isCornerDiagonalFilled(element: MapElement, elements: MapElement[], connections: Direction[]): boolean {
  const set = new Set(connections);
  if (set.size !== 2) return false;
  const isStraight = (set.has('N') && set.has('S')) || (set.has('E') && set.has('O'));
  if (isStraight) return false;
  if (!element.groupId) return false;

  const dr = set.has('S') ? 1 : set.has('N') ? -1 : 0;
  const dc = set.has('E') ? 1 : set.has('O') ? -1 : 0;
  const { row, col } = parseCellId(element.cellId);
  const diagonalId = cellId(row + dr, col + dc);
  return elements.some((e) => e.cellId === diagonalId && e.groupId === element.groupId && e.type === element.type);
}

/**
 * Per una cella a incrocio a T (esattamente tre collegamenti, quindi un solo lato "chiuso" senza
 * collegamento), controlla indipendentemente i due angoli opposti al lato chiuso: ognuno è tra lo
 * "stelo" (il lato opposto a quello chiuso) e uno dei due lati laterali aperti, e va disegnato
 * "pieno" se la cella diagonale in quell'angolo fa anch'essa parte dello stesso oggetto (stessa
 * idea di isCornerDiagonalFilled, generalizzata: qui gli angoli ambigui sono due, non uno solo,
 * perché tre lati su quattro sono aperti). Restituisce l'insieme dei lati laterali (direzioni
 * assolute, non relative alla rotazione) il cui angolo risulta pieno.
 */
export function tCornersFilled(element: MapElement, elements: MapElement[], connections: Direction[]): Set<Direction> {
  const set = new Set(connections);
  const filled = new Set<Direction>();
  if (set.size !== 3 || !element.groupId) return filled;
  const missing = (['N', 'E', 'S', 'O'] as Direction[]).find((d) => !set.has(d));
  if (!missing) return filled;
  const stem = OPPOSITE[missing];
  const flanks = (['N', 'E', 'S', 'O'] as Direction[]).filter((d) => d !== missing && d !== stem);
  const { row, col } = parseCellId(element.cellId);
  const [stemDr, stemDc] = NEIGHBOR_DELTAS[stem];
  for (const flank of flanks) {
    const [flankDr, flankDc] = NEIGHBOR_DELTAS[flank];
    const diagonalId = cellId(row + stemDr + flankDr, col + stemDc + flankDc);
    if (elements.some((e) => e.cellId === diagonalId && e.groupId === element.groupId && e.type === element.type)) {
      filled.add(flank);
    }
  }
  return filled;
}

export interface FixedFootprintGroup {
  groupId: string;
  type: string;
  anchorRow: number;
  anchorCol: number;
  widthCells: number;
  heightCells: number;
  image: string;
  cellIds: CellId[];
}

/**
 * Raggruppa gli elementi ad "impronta fissa" (es. il letto) per groupId+type, e per ogni gruppo
 * che forma un rettangolo pieno WxH con un'immagine dichiarata per quella taglia, restituisce
 * l'overlay unico da disegnare al posto delle icone per-cella. Gruppi che non formano un
 * rettangolo pieno (celle mancanti) o senza immagine per quella taglia vengono scartati.
 */
export function fixedFootprintGroups(
  elements: MapElement[],
  resolveType: (type: string) => ResolvedElementType | undefined,
): FixedFootprintGroup[] {
  const groups = new Map<string, MapElement[]>();
  for (const el of elements) {
    if (!el.groupId) continue;
    const entry = resolveType(el.type);
    if (!entry?.fixedFootprintImages) continue;
    const key = `${el.groupId}::${el.type}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(el);
    else groups.set(key, [el]);
  }

  const result: FixedFootprintGroup[] = [];
  for (const els of groups.values()) {
    const entry = resolveType(els[0].type);
    if (!entry?.fixedFootprintImages) continue;
    const positions = els.map((e) => parseCellId(e.cellId));
    const rowMin = Math.min(...positions.map((p) => p.row));
    const rowMax = Math.max(...positions.map((p) => p.row));
    const colMin = Math.min(...positions.map((p) => p.col));
    const colMax = Math.max(...positions.map((p) => p.col));
    const widthCells = colMax - colMin + 1;
    const heightCells = rowMax - rowMin + 1;
    if (els.length !== widthCells * heightCells) continue;
    const image = entry.fixedFootprintImages[`${widthCells}x${heightCells}`];
    if (!image) continue;
    result.push({
      groupId: els[0].groupId as string,
      type: els[0].type,
      anchorRow: rowMin,
      anchorCol: colMin,
      widthCells,
      heightCells,
      image,
      cellIds: els.map((e) => e.cellId),
    });
  }
  return result;
}

const CONNECTION_KEY_ORDER: Direction[] = ['N', 'E', 'S', 'O'];

/** Chiave canonica di un insieme di collegamenti (es. ['E','N'] -> "NE"), indipendente
 * dall'ordine in cui le direzioni sono state trovate. */
export function connectionKey(connections: Direction[]): string {
  const set = new Set(connections);
  return CONNECTION_KEY_ORDER.filter((d) => set.has(d)).join('');
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

const EMPTY_DIRECTION_SET: Set<Direction> = new Set();

/**
 * Sceglie la variante (isolata/estremità/angolo/dritto/incrocio a T/croce) e la rotazione da
 * applicare in base a come la cella si collega alle celle adiacenti dello stesso oggetto
 * multi-cella. Con connessioni non generabili trascinando/collegando (nessuna variante adatta
 * caricata) ricade sulla variante isolata.
 */
export function resolveElementVisual(
  entry: ResolvedElementType,
  connections: Direction[],
  diagonalFilled = false,
  tFilledFlanks: Set<Direction> = EMPTY_DIRECTION_SET,
): ElementVisual {
  const set = new Set(connections);
  const isolated: ElementVisual = { image: entry.image, icon: entry.icon, rotationDeg: 0 };
  if (set.size === 0) return isolated;

  // Immagine già orientata per questa esatta combinazione di collegamenti, se presente: ha
  // priorità sulle varianti singole ruotate via CSS (usata per disegni non semplicemente
  // ruotabili, con un'immagine diversa per ogni orientamento).
  const exact = entry.shapesByConnections?.[connectionKey(connections)];
  if (exact) return { image: exact, icon: entry.icon, rotationDeg: 0 };

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
    const cornerImage = (diagonalFilled && entry.filledCornerImage) || entry.cornerImage;
    if (cornerImage) {
      const steps = findRotationSteps(BASE_CORNER, set);
      if (steps !== null) return { image: cornerImage, icon: entry.icon, rotationDeg: steps * 90 };
    }
    return isolated;
  }

  if (set.size === 3) {
    const steps = findRotationSteps(BASE_T, set);
    if (steps !== null) {
      // BASE_T = ['N','E','O']: i due angoli ambigui sono tra lo stelo N e ciascuno dei due lati
      // laterali E/O. Dopo la rotazione, il lato laterale base E/O corrisponde alla direzione
      // reale rotateDirCW('E'/'O', steps): controlliamo lì se quell'angolo è pieno.
      const eFilled = tFilledFlanks.has(rotateDirCW('E', steps));
      const oFilled = tFilledFlanks.has(rotateDirCW('O', steps));
      const tImage =
        (eFilled && oFilled && entry.tImageFilledBoth) ||
        (eFilled && !oFilled && entry.tImageFilledE) ||
        (!eFilled && oFilled && entry.tImageFilledO) ||
        entry.tImage;
      if (tImage) return { image: tImage, icon: entry.icon, rotationDeg: steps * 90 };
    }
    return isolated;
  }

  if (set.size === 4 && entry.crossImage) {
    return { image: entry.crossImage, icon: entry.icon, rotationDeg: 0 };
  }

  return isolated;
}
