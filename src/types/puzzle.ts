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
  /** Sottocartella di origine in assets/icons/ (es. "casa"), usata per raggruppare gli oggetti nell'editor. */
  category: string;
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

// --- Catalogo generato automaticamente da assets/icons/<categoria>/<nome file> ---
//
// Convenzione dei nomi file: "<base>[_<variante>][_o].svg", dentro una sottocartella di
// categoria (es. assets/icons/casa/sedia.svg). <base> è l'identificativo dell'oggetto (diventa
// anche il suo `type`); <variante>, se presente, è una delle seguenti (mutuamente esclusive per
// oggetto):
//   - "WxH" (es. "2x1")     -> oggetto ad impronta fissa, immagine unica per quella taglia
//   - "1"/"2"/"22"/"3"/"4"/"6" -> variante a rotazione CSS (cap/corner/filledCorner/T/cross/straight,
//                                 vedi elementShape.ts), immagine unica ruotata via CSS
//   - lettere tra n/e/s/w (es. "ne", "ew")  -> variante già orientata per quella combinazione di
//                                 collegamenti (N/E/S/O, "w" = ovest), nessuna rotazione CSS
// "_o" finale (prima di ".svg", su una qualsiasi variante) marca l'oggetto come occupabile da un
// sospettato; senza "_o" su nessun file, l'oggetto è considerato non occupabile (default).
// Aggiungere un nuovo oggetto, una nuova taglia/variante o cambiare l'occupabilità richiede solo
// di aggiungere/rinominare il file giusto: nessuna modifica al codice.
const ICON_MODULES = import.meta.glob<string>('../assets/icons/*/*.svg', { eager: true, import: 'default' });

const NUMERIC_SHAPE_FIELDS: Record<string, keyof ElementCatalogEntry> = {
  '1': 'capImage',
  '2': 'cornerImage',
  '22': 'filledCornerImage',
  '3': 'tImage',
  '4': 'crossImage',
  '6': 'straightImage',
};

const CONNECTION_KEY_ORDER: Direction[] = ['N', 'E', 'S', 'O'];

function directionalConnectionKey(letters: string): string | null {
  const dirs: Direction[] = [];
  for (const ch of letters) {
    if (ch === 'n') dirs.push('N');
    else if (ch === 'e') dirs.push('E');
    else if (ch === 's') dirs.push('S');
    else if (ch === 'w') dirs.push('O');
    else return null;
  }
  const set = new Set(dirs);
  if (set.size !== dirs.length) return null; // lettera ripetuta: nome non valido, ignorato
  return CONNECTION_KEY_ORDER.filter((d) => set.has(d)).join('');
}

interface AutoCatalogEntry extends Omit<ElementCatalogEntry, 'icon' | 'label'> {
  hasOccupiableMark: boolean;
}

function buildAutoCatalog(): Map<string, AutoCatalogEntry> {
  const entries = new Map<string, AutoCatalogEntry>();
  for (const path in ICON_MODULES) {
    const match = path.match(/\/icons\/([^/]+)\/([^/]+)\.svg$/);
    if (!match) continue;
    const [, category, fileName] = match;
    const segments = fileName.split('_');
    const hasOccupiableMark = segments.length > 1 && segments[segments.length - 1] === 'o';
    if (hasOccupiableMark) segments.pop();
    const base = segments[0];
    const variant = segments.length > 1 ? segments.slice(1).join('_') : null;

    let entry = entries.get(base);
    if (!entry) {
      entry = { type: base, category, occupiable: false, hasOccupiableMark: false };
      entries.set(base, entry);
    } else if (entry.category !== category) {
      console.warn(`Oggetto "${base}" presente in più categorie (${entry.category} e ${category}): ignorata la seconda.`);
      continue;
    }
    if (hasOccupiableMark) entry.hasOccupiableMark = true;

    const url = ICON_MODULES[path];
    if (!variant) {
      entry.image = url;
      continue;
    }
    const footprintMatch = variant.match(/^(\d+)x(\d+)$/);
    if (footprintMatch) {
      entry.fixedFootprintImages = { ...entry.fixedFootprintImages, [`${footprintMatch[1]}x${footprintMatch[2]}`]: url };
      continue;
    }
    const shapeField = NUMERIC_SHAPE_FIELDS[variant];
    if (shapeField) {
      (entry as unknown as Record<string, unknown>)[shapeField] = url;
      continue;
    }
    if (/^[nesw]+$/.test(variant)) {
      const key = directionalConnectionKey(variant);
      if (key) entry.shapesByConnections = { ...entry.shapesByConnections, [key]: url };
      continue;
    }
    console.warn(`File "${fileName}.svg" in ${category}/: variante "${variant}" non riconosciuta, ignorata.`);
  }
  for (const entry of entries.values()) entry.occupiable = entry.hasOccupiableMark;
  return entries;
}

/** Etichetta leggibile di default per un oggetto, capitalizzando il nome file. */
function defaultLabel(base: string): string {
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Le emoji non si possono dedurre dal nome file: piccola tabella di riferimento (con etichetta
 * personalizzata dove serve) per gli oggetti noti, con un'emoji generica di riserva per quelli
 * nuovi finché non viene aggiunta qui una voce dedicata.
 */
const ICON_OVERRIDES: Partial<Record<string, { icon: string; label?: string }>> = {
  sedia: { icon: '🪑' },
  tappeto: { icon: '🟫' },
  tavolo: { icon: '🍽️' },
  cespuglio: { icon: '🌿' },
  albero: { icon: '🌳' },
  roccia: { icon: '🪨' },
  pianta: { icon: '🪴', label: 'Pianta in vaso' },
  libreria: { icon: '📚' },
  tv: { icon: '📺' },
  cassa: { icon: '🛢️', label: 'Cassa/Barile' },
  cono: { icon: '🔺' },
  statua: { icon: '🗿' },
  tronco: { icon: '🪵' },
  letto: { icon: '🛏️' },
  cestino: { icon: '🗑️' },
  scatola: { icon: '📦' },
  macerie: { icon: '🧱' },
  auto: { icon: '🚗' },
  autobus: { icon: '🚌' },
  elefante: { icon: '🐘' },
};
const DEFAULT_ICON = '🔷';

export const ELEMENT_CATALOG: ElementCatalogEntry[] = [...buildAutoCatalog().values()].map(
  ({ hasOccupiableMark: _hasOccupiableMark, ...entry }) => ({
    ...entry,
    icon: ICON_OVERRIDES[entry.type]?.icon ?? DEFAULT_ICON,
    label: ICON_OVERRIDES[entry.type]?.label ?? defaultLabel(entry.type),
  }),
);

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
  /** Assente per gli oggetti personalizzati del puzzle (non hanno una categoria di provenienza). */
  category?: string;
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

/** True se l'oggetto è ad "impronta fissa" (immagine unica per l'intero rettangolo WxH, niente rotazione/varianti
 * per cella) e ha almeno una taglia con l'immagine disponibile (le taglie sono raccolte automaticamente dal nome
 * file "base_WxH.svg" in buildAutoCatalog, quindi un oggetto senza ancora nessun file di quel tipo caricato non
 * conta come multi-cella finché quel file non viene aggiunto). */
export function isFixedFootprintType(
  entry: Pick<ResolvedElementType, 'fixedFootprintImages'> | undefined,
): boolean {
  return !!entry?.fixedFootprintImages && Object.keys(entry.fixedFootprintImages).length > 0;
}

/** Un tipo è multi-cella se ha almeno una variante "estremità" (piazzabile trascinando/collegando celle)
 * oppure un'immagine ad impronta fissa (piazzato in linea retta, con un'unica immagine per l'intero gruppo). */
export function isMultiCellType(
  entry:
    | Pick<ResolvedElementType, 'capImage' | 'capImageByDirection' | 'shapesByConnections' | 'fixedFootprintImages'>
    | undefined,
): boolean {
  return !!entry?.capImage || !!entry?.capImageByDirection || !!entry?.shapesByConnections || isFixedFootprintType(entry);
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
