// Modello dati del puzzle Murdoku.
//
// Griglia X*Y (width*height). Le celle sono identificate da "row-col" (0-based).
// N sospettati, con N = min(width, height) - 1. Ogni sospettato ha una cella
// soluzione definitiva: una sola cella per riga e una sola per colonna
// (vincolo di tipo permutazione, come le torri N-Queens senza diagonali).
// Le aree della mappa sono regioni di celle contigue delimitate da muri.
// La vittima occupa sempre l'ultima cella libera nell'area del killer.

import iconAlbero from '../assets/icons/albero.svg';
import iconCono from '../assets/icons/cono.svg';
import iconLetto from '../assets/icons/letto.svg';
import iconLibreria from '../assets/icons/libreria.svg';
import iconPianta from '../assets/icons/pianta.svg';
import iconSedia from '../assets/icons/sedia.svg';
import iconStatua from '../assets/icons/statua.svg';
import iconTavolo from '../assets/icons/tavolo.svg';
import iconTronco from '../assets/icons/tronco.svg';
import iconTv from '../assets/icons/tv.svg';

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

/**
 * Catalogo fisso degli oggetti piazzabili sulla mappa: icona/immagine, nome ed occupabilità.
 * Un tipo con `capImage`/`cornerImage`/`straightImage` è multi-cella: piazzato trascinando su
 * più celle in linea, ogni cella mostra la variante giusta (isolata/estremità/angolo/dritto)
 * ruotata in base a come si collega alle celle adiacenti dello stesso oggetto (vedi elementShape.ts).
 */
interface ElementCatalogEntry {
  type: string;
  icon: string;
  image?: string;
  label: string;
  occupiable: boolean;
  /** Presenti solo sui tipi multi-cella, per le celle con una/due connessioni allo stesso oggetto. */
  capImage?: string;
  cornerImage?: string;
  straightImage?: string;
}

export const ELEMENT_CATALOG: ElementCatalogEntry[] = [
  { type: 'chair', icon: '🪑', image: iconSedia, label: 'Sedia', occupiable: true },
  { type: 'rug', icon: '🟫', label: 'Tappeto', occupiable: true },
  { type: 'table', icon: '🍽️', image: iconTavolo, label: 'Tavolo', occupiable: false },
  { type: 'bush', icon: '🌿', label: 'Cespuglio', occupiable: true },
  { type: 'tree', icon: '🌳', image: iconAlbero, label: 'Albero', occupiable: false },
  { type: 'rock', icon: '🪨', label: 'Roccia', occupiable: true },
  { type: 'plant', icon: '🪴', image: iconPianta, label: 'Pianta in vaso', occupiable: false },
  { type: 'bookshelf', icon: '📚', image: iconLibreria, label: 'Libreria', occupiable: false },
  { type: 'tv', icon: '📺', image: iconTv, label: 'TV', occupiable: false },
  { type: 'crate', icon: '🛢️', label: 'Cassa/Barile', occupiable: true },
  { type: 'cone', icon: '🔺', image: iconCono, label: 'Cono', occupiable: false },
  { type: 'statue', icon: '🗿', image: iconStatua, label: 'Statua', occupiable: false },
  { type: 'log', icon: '🪵', image: iconTronco, label: 'Tronco', occupiable: false },
  { type: 'bed', icon: '🛏️', image: iconLetto, label: 'Letto', occupiable: true },
];

export type ElementType = (typeof ELEMENT_CATALOG)[number]['type'];

export function elementCatalogEntry(type: string) {
  return ELEMENT_CATALOG.find((e) => e.type === type);
}

/** Tipo di oggetto creato dal designer nell'editor, con un'immagine al posto di un'icona. */
export interface CustomElementType {
  id: string;
  name: string;
  /** Data URI (immagine caricata) oppure URL diretto ad un'immagine. Usata anche come variante "isolata". */
  image: string;
  /** Se false, nessun sospettato può avere la sua cella soluzione su questo oggetto */
  occupiable: boolean;
  /** Presenti solo sui tipi multi-cella, per le celle con una/due connessioni allo stesso oggetto. */
  capImage?: string;
  cornerImage?: string;
  straightImage?: string;
}

export interface ResolvedElementType {
  label: string;
  occupiable: boolean;
  icon?: string;
  image?: string;
  capImage?: string;
  cornerImage?: string;
  straightImage?: string;
}

/** Risolve un tipo di oggetto (catalogo fisso o personalizzato del puzzle) nella sua definizione. */
export function resolveElementType(type: string, customTypes: CustomElementType[]): ResolvedElementType | undefined {
  const builtin = elementCatalogEntry(type);
  if (builtin) return builtin;
  const custom = customTypes.find((c) => c.id === type);
  if (!custom) return undefined;
  return {
    label: custom.name,
    occupiable: custom.occupiable,
    image: custom.image,
    capImage: custom.capImage,
    cornerImage: custom.cornerImage,
    straightImage: custom.straightImage,
  };
}

/** Un tipo è multi-cella se ha almeno la variante "estremità" (piazzabile trascinando in linea). */
export function isMultiCellType(entry: Pick<ResolvedElementType, 'capImage'> | undefined): boolean {
  return !!entry?.capImage;
}

export interface MapElement {
  id: string;
  /** Tipo di oggetto: chiave in ELEMENT_CATALOG oppure id di un CustomElementType del puzzle */
  type: string;
  cellId: CellId;
  /**
   * Presente solo per oggetti multi-cella: id condiviso da tutte le celle dello stesso oggetto
   * piazzato trascinando in linea. Celle con lo stesso groupId e adiacenti si "collegano"
   * visivamente (vedi lib/elementShape.ts); assente per un piazzamento a cella singola.
   */
  groupId?: string;
}

/** Nome personalizzato assegnato ad un'area, ancorato ad una sua cella. */
export interface AreaName {
  cellId: CellId;
  name: string;
}

/** Finestra su un lato del perimetro esterno della griglia (bordo rettangolare). */
export interface WindowEdge {
  cellId: CellId;
  side: Direction;
}

export interface Suspect {
  id: string;
  name: string;
  /** Colore usato per evidenziare il sospettato in griglia */
  color: string;
  /** Cella soluzione definitiva assegnata dal designer nell'editor */
  solutionCellId: CellId | null;
}

/**
 * La vittima: gestita come un sospettato (piazzata dal designer, soggetta allo stesso
 * vincolo una-per-riga/colonna, giocabile con lo stesso meccanismo tap/pressione lunga),
 * ma senza indizi propri e sempre indicata con la lettera "V".
 */
export interface Victim {
  color: string;
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
  windows: WindowEdge[];
  /** Celle "buco": non fanno parte della mappa, per griglie non rettangolari */
  disabledCells: CellId[];
  suspects: Suspect[];
  victim: Victim;
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
    windows: [],
    disabledCells: [],
    suspects,
    victim: { color: '#1a1a1a', solutionCellId: null },
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
