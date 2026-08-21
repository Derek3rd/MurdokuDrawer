// Modello dati del puzzle Murdoku.
//
// Griglia X*Y (width*height). Le celle sono identificate da "row-col" (0-based).
// N sospettati, con N = min(width, height) - 1. Ogni sospettato ha una cella
// soluzione definitiva: una sola cella per riga e una sola per colonna
// (vincolo di tipo permutazione, come le torri N-Queens senza diagonali).
// Le aree della mappa sono regioni di celle contigue delimitate da muri.
// La vittima occupa sempre l'ultima cella libera nell'area del killer.

/** Omit che si distribuisce sui membri di un tipo unione discriminata. */
export type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type CellId = string; // `${row}-${col}`

export function cellId(row: number, col: number): CellId {
  return `${row}-${col}`;
}

export function parseCellId(id: CellId): { row: number; col: number } {
  const [row, col] = id.split('-').map(Number);
  return { row, col };
}

export type Direction = 'N' | 'S' | 'E' | 'O';

/** Catalogo fisso degli oggetti piazzabili sulla mappa: icona, nome ed occupabilità. */
export const ELEMENT_CATALOG = [
  { type: 'chair', icon: '🪑', label: 'Sedia', occupiable: true },
  { type: 'rug', icon: '🟫', label: 'Tappeto', occupiable: true },
  { type: 'table', icon: '🍽️', label: 'Tavolo', occupiable: false },
  { type: 'bush', icon: '🌿', label: 'Cespuglio', occupiable: true },
  { type: 'tree', icon: '🌳', label: 'Albero', occupiable: false },
  { type: 'rock', icon: '🪨', label: 'Roccia', occupiable: true },
  { type: 'plant', icon: '🪴', label: 'Pianta in vaso', occupiable: false },
  { type: 'bookshelf', icon: '📚', label: 'Libreria', occupiable: false },
  { type: 'tv', icon: '📺', label: 'TV', occupiable: false },
  { type: 'crate', icon: '🛢️', label: 'Cassa/Barile', occupiable: true },
  { type: 'cone', icon: '🔺', label: 'Cono', occupiable: false },
  { type: 'statue', icon: '🗿', label: 'Statua', occupiable: false },
  { type: 'log', icon: '🪵', label: 'Tronco', occupiable: false },
] as const;

export type ElementType = (typeof ELEMENT_CATALOG)[number]['type'];

export function elementCatalogEntry(type: string) {
  return ELEMENT_CATALOG.find((e) => e.type === type);
}

/** Tipo di oggetto creato dal designer nell'editor, con un'immagine al posto di un'icona. */
export interface CustomElementType {
  id: string;
  name: string;
  /** Data URI (immagine caricata) oppure URL diretto ad un'immagine */
  image: string;
  /** Se false, nessun sospettato può avere la sua cella soluzione su questo oggetto */
  occupiable: boolean;
}

export interface ResolvedElementType {
  label: string;
  occupiable: boolean;
  icon?: string;
  image?: string;
}

/** Risolve un tipo di oggetto (catalogo fisso o personalizzato del puzzle) nella sua definizione. */
export function resolveElementType(type: string, customTypes: CustomElementType[]): ResolvedElementType | undefined {
  const builtin = elementCatalogEntry(type);
  if (builtin) return builtin;
  const custom = customTypes.find((c) => c.id === type);
  if (!custom) return undefined;
  return { label: custom.name, occupiable: custom.occupiable, image: custom.image };
}

export interface MapElement {
  id: string;
  /** Tipo di oggetto: chiave in ELEMENT_CATALOG oppure id di un CustomElementType del puzzle */
  type: string;
  cellId: CellId;
}

/** Nome personalizzato assegnato ad un'area, ancorato ad una sua cella. */
export interface AreaName {
  cellId: CellId;
  name: string;
}

export interface Suspect {
  id: string;
  name: string;
  /** Colore usato per evidenziare il sospettato in griglia */
  color: string;
  /** Cella soluzione definitiva assegnata dal designer nell'editor */
  solutionCellId: CellId | null;
}

interface ClueBase {
  id: string;
  suspectId: string;
}

export type ClueTargetType = 'suspect' | 'element' | 'cell';

export interface DirectionClue extends ClueBase {
  type: 'direction';
  direction: Direction;
  targetType: ClueTargetType;
  targetId: string; // suspectId, elementId oppure CellId a seconda di targetType
  /** Se true il sospettato deve essere immediatamente adiacente al target */
  adjacent: boolean;
}

export interface InAreaClue extends ClueBase {
  type: 'inArea';
  areaId: string;
}

export interface OnElementClue extends ClueBase {
  type: 'onElement';
  elementId: string;
}

export interface NearElementClue extends ClueBase {
  type: 'nearElement';
  elementId: string;
}

export interface AloneClue extends ClueBase {
  type: 'alone';
}

export interface TogetherClue extends ClueBase {
  type: 'together';
  otherSuspectId: string;
}

export type Clue =
  | DirectionClue
  | InAreaClue
  | OnElementClue
  | NearElementClue
  | AloneClue
  | TogetherClue;

export interface AllAreasHaveSuspectRule {
  id: string;
  type: 'allAreasHaveSuspect';
}

export interface EvenCountInAreasRule {
  id: string;
  type: 'evenCountInAreas';
  areaIds: string[];
}

export interface CustomRule {
  id: string;
  type: 'custom';
  description: string;
}

export type GlobalRule = AllAreasHaveSuspectRule | EvenCountInAreasRule | CustomRule;

export interface Puzzle {
  id: string;
  name: string;
  width: number; // X
  height: number; // Y
  /** Muro tra (row,col) e (row,col+1): CellId della cella a sinistra del muro */
  wallsRight: CellId[];
  /** Muro tra (row,col) e (row+1,col): CellId della cella sopra il muro */
  wallsBottom: CellId[];
  elements: MapElement[];
  customElementTypes: CustomElementType[];
  areaNames: AreaName[];
  suspects: Suspect[];
  killerId: string | null;
  clues: Clue[];
  globalRules: GlobalRule[];
  createdAt: string;
  updatedAt: string;
}

export function suspectCount(width: number, height: number): number {
  return Math.max(0, Math.min(width, height) - 1);
}

/**
 * Lettera dell'alfabeto assegnata di default ad un sospettato (o alla vittima):
 * ogni sospettato ha teoricamente un nome che inizia con questa iniziale.
 */
export function suspectLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export function createEmptyPuzzle(width: number, height: number): Puzzle {
  const now = new Date().toISOString();
  const n = suspectCount(width, height);
  const suspects: Suspect[] = Array.from({ length: n }, (_, i) => ({
    id: `suspect-${i + 1}`,
    name: suspectLetter(i),
    color: DEFAULT_SUSPECT_COLORS[i % DEFAULT_SUSPECT_COLORS.length],
    solutionCellId: null,
  }));
  return {
    id: crypto.randomUUID(),
    name: 'Nuovo Murdoku',
    width,
    height,
    wallsRight: [],
    wallsBottom: [],
    elements: [],
    customElementTypes: [],
    areaNames: [],
    suspects,
    killerId: null,
    clues: [],
    globalRules: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const DEFAULT_SUSPECT_COLORS = [
  '#e63946',
  '#457b9d',
  '#2a9d8f',
  '#e9c46a',
  '#f4a261',
  '#8338ec',
  '#3a86ff',
  '#ff006e',
  '#06d6a0',
  '#fb5607',
];
