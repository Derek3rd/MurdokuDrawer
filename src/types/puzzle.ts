// Modello dati del puzzle Murdoku.
//
// Griglia X*Y (width*height). Le celle sono identificate da "row-col" (0-based).
// N sospettati, con N = min(width, height) - 1. Ogni sospettato ha una cella
// soluzione definitiva: una sola cella per riga e una sola per colonna
// (vincolo di tipo permutazione, come le torri N-Queens senza diagonali).
// Le aree della mappa sono regioni di celle contigue delimitate da muri.
// La vittima occupa sempre l'ultima cella libera nell'area del killer.

import iconAlbero from '../assets/icons/albero.svg';
import iconCassa from '../assets/icons/cassa.svg';
import iconCespuglio from '../assets/icons/cespuglio.svg';
import iconCestino from '../assets/icons/cestino.svg';
import iconCono from '../assets/icons/cono.svg';
import iconLetto from '../assets/icons/letto.svg';
import iconLettoE from '../assets/icons/letto_e.svg';
import iconLettoS from '../assets/icons/letto_s.svg';
import iconLibreria from '../assets/icons/libreria.svg';
import iconMacerie from '../assets/icons/macerie.svg';
import iconPianta from '../assets/icons/pianta.svg';
import iconRoccia from '../assets/icons/roccia.svg';
import iconScatola from '../assets/icons/scatola.svg';
import iconSedia from '../assets/icons/sedia.svg';
import iconStatua from '../assets/icons/statua.svg';
import iconTappeto1 from '../assets/icons/tappeto_1.svg';
import iconTappeto2 from '../assets/icons/tappeto_2.svg';
import iconTappeto22 from '../assets/icons/tappeto_22.svg';
import iconTappeto3 from '../assets/icons/tappeto_3.svg';
import iconTappeto4 from '../assets/icons/tappeto_4.svg';
import iconTappeto6 from '../assets/icons/tappeto_6.svg';
import iconTavolo from '../assets/icons/tavolo.svg';
import iconTavoloE from '../assets/icons/tavolo_e.svg';
import iconTavoloEs from '../assets/icons/tavolo_es.svg';
import iconTavoloEw from '../assets/icons/tavolo_ew.svg';
import iconTavoloN from '../assets/icons/tavolo_n.svg';
import iconTavoloNe from '../assets/icons/tavolo_ne.svg';
import iconTavoloNs from '../assets/icons/tavolo_ns.svg';
import iconTavoloNw from '../assets/icons/tavolo_nw.svg';
import iconTavoloS from '../assets/icons/tavolo_s.svg';
import iconTavoloSw from '../assets/icons/tavolo_sw.svg';
import iconTavoloW from '../assets/icons/tavolo_w.svg';
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
 * Un tipo con `capImage`/`cornerImage`/`straightImage`/`tImage`/`crossImage` è multi-cella:
 * piazzato trascinando su più celle (anche ad angolo, o collegando celle aggiuntive per creare
 * incroci a T/croce), ogni cella mostra la variante giusta in base a quante e quali celle
 * adiacenti dello stesso oggetto tocca, ruotata di conseguenza (vedi elementShape.ts). Codici
 * (per riferimento nei nomi file): 0=isolata, 1=capImage, 2=cornerImage, 22=filledCornerImage,
 * 3=tImage, 4=crossImage, 6=straightImage.
 * Un tipo con `fixedFootprintImages` è invece un oggetto "a impronta fissa": una sola immagine
 * copre l'intero rettangolo WxH (es. un letto 2x1), senza varianti per cella né rotazione CSS.
 */
interface ElementCatalogEntry {
  type: string;
  icon: string;
  image?: string;
  label: string;
  occupiable: boolean;
  /** Presenti solo sui tipi multi-cella. Un'immagine sola viene ruotata via CSS per adattarsi
   * all'orientamento reale (convenzione a rotazione 0°: capImage collega verso Nord, cornerImage
   * collega Nord+Est, straightImage collega Nord+Sud, tImage collega Nord+Est+Ovest). */
  capImage?: string;
  cornerImage?: string;
  /**
   * Variante "piena" dell'angolo, usata al posto di `cornerImage` quando anche la cella diagonale
   * interna all'angolo fa parte dello stesso oggetto (es. tappeto_22 per un blocco 2x2 di tappeto).
   * Se assente, si usa sempre `cornerImage`.
   */
  filledCornerImage?: string;
  straightImage?: string;
  /** Incrocio a T (tre collegamenti). */
  tImage?: string;
  /** Incrocio a croce (quattro collegamenti): sempre simmetrico, nessuna rotazione. */
  crossImage?: string;
  /**
   * Alternativa a `capImage` per oggetti il cui disegno non è semplicemente ruotabile:
   * un'immagine già orientata per ciascuna direzione di collegamento singolo, usata al posto
   * della rotazione CSS quando presente per quella direzione.
   */
  capImageByDirection?: Partial<Record<Direction, string>>;
  /**
   * Alternativa più generale, per oggetti il cui disegno differisce per ogni combinazione di
   * collegamenti (non solo il singolo collegamento): immagine già orientata, senza rotazione,
   * indicizzata dalla chiave canonica dell'insieme di collegamenti (vedi connectionKey() in
   * elementShape.ts, es. "N", "NE", "NS", "NESO"). Controllata prima di capImage/cornerImage/ecc.
   */
  shapesByConnections?: Partial<Record<string, string>>;
  /**
   * Oggetto ad "impronta fissa": una sola immagine per l'intero rettangolo WxH occupato (es. un
   * letto 2x1), indicizzata dalla chiave "WxH" in celle (es. "2x1", "1x2"). Piazzato trascinando
   * in linea retta per un numero di celle che corrisponde a una delle taglie dichiarate: niente
   * angoli, T o incroci. L'immagine copre l'intero gruppo di celle come overlay unico, non ruota.
   */
  fixedFootprintImages?: Partial<Record<string, string>>;
}

export const ELEMENT_CATALOG: ElementCatalogEntry[] = [
  { type: 'chair', icon: '🪑', image: iconSedia, label: 'Sedia', occupiable: true },
  {
    type: 'rug',
    icon: '🟫',
    label: 'Tappeto',
    occupiable: true,
    capImage: iconTappeto1,
    cornerImage: iconTappeto2,
    filledCornerImage: iconTappeto22,
    tImage: iconTappeto3,
    crossImage: iconTappeto4,
    straightImage: iconTappeto6,
  },
  {
    type: 'table',
    icon: '🍽️',
    image: iconTavolo,
    label: 'Tavolo',
    occupiable: false,
    shapesByConnections: {
      N: iconTavoloN,
      S: iconTavoloS,
      E: iconTavoloE,
      O: iconTavoloW,
      NS: iconTavoloNs,
      EO: iconTavoloEw,
      NE: iconTavoloNe,
      ES: iconTavoloEs,
      SO: iconTavoloSw,
      NO: iconTavoloNw,
    },
  },
  { type: 'bush', icon: '🌿', image: iconCespuglio, label: 'Cespuglio', occupiable: true },
  { type: 'tree', icon: '🌳', image: iconAlbero, label: 'Albero', occupiable: false },
  { type: 'rock', icon: '🪨', image: iconRoccia, label: 'Roccia', occupiable: true },
  { type: 'plant', icon: '🪴', image: iconPianta, label: 'Pianta in vaso', occupiable: false },
  { type: 'bookshelf', icon: '📚', image: iconLibreria, label: 'Libreria', occupiable: false },
  { type: 'tv', icon: '📺', image: iconTv, label: 'TV', occupiable: false },
  { type: 'crate', icon: '🛢️', image: iconCassa, label: 'Cassa/Barile', occupiable: true },
  { type: 'cone', icon: '🔺', image: iconCono, label: 'Cono', occupiable: false },
  { type: 'statue', icon: '🗿', image: iconStatua, label: 'Statua', occupiable: false },
  { type: 'log', icon: '🪵', image: iconTronco, label: 'Tronco', occupiable: false },
  {
    type: 'bed',
    icon: '🛏️',
    image: iconLetto,
    label: 'Letto',
    occupiable: true,
    fixedFootprintImages: { '2x1': iconLettoE, '1x2': iconLettoS },
  },
  { type: 'basket', icon: '🗑️', image: iconCestino, label: 'Cestino', occupiable: false },
  { type: 'box', icon: '📦', image: iconScatola, label: 'Scatola', occupiable: false },
  { type: 'rubble', icon: '🧱', image: iconMacerie, label: 'Macerie', occupiable: false },
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
  /** Presenti solo sui tipi multi-cella (vedi ElementCatalogEntry per le convenzioni). */
  capImage?: string;
  cornerImage?: string;
  filledCornerImage?: string;
  straightImage?: string;
  tImage?: string;
  crossImage?: string;
  capImageByDirection?: Partial<Record<Direction, string>>;
  shapesByConnections?: Partial<Record<string, string>>;
  fixedFootprintImages?: Partial<Record<string, string>>;
}

export interface ResolvedElementType {
  label: string;
  occupiable: boolean;
  icon?: string;
  image?: string;
  capImage?: string;
  cornerImage?: string;
  filledCornerImage?: string;
  straightImage?: string;
  tImage?: string;
  crossImage?: string;
  capImageByDirection?: Partial<Record<Direction, string>>;
  shapesByConnections?: Partial<Record<string, string>>;
  fixedFootprintImages?: Partial<Record<string, string>>;
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
    filledCornerImage: custom.filledCornerImage,
    straightImage: custom.straightImage,
    tImage: custom.tImage,
    crossImage: custom.crossImage,
    capImageByDirection: custom.capImageByDirection,
    fixedFootprintImages: custom.fixedFootprintImages,
  };
}

/** Un tipo è multi-cella se ha almeno una variante "estremità" (piazzabile trascinando/collegando celle)
 * oppure un'immagine ad impronta fissa (piazzato in linea retta, con un'unica immagine per l'intero gruppo). */
export function isMultiCellType(
  entry:
    | Pick<ResolvedElementType, 'capImage' | 'capImageByDirection' | 'shapesByConnections' | 'fixedFootprintImages'>
    | undefined,
): boolean {
  return (
    !!entry?.capImage || !!entry?.capImageByDirection || !!entry?.shapesByConnections || !!entry?.fixedFootprintImages
  );
}

/** True se l'oggetto è ad "impronta fissa" (immagine unica per l'intero rettangolo WxH, niente rotazione/varianti per cella). */
export function isFixedFootprintType(
  entry: Pick<ResolvedElementType, 'fixedFootprintImages'> | undefined,
): boolean {
  return !!entry?.fixedFootprintImages;
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
