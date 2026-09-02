import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cellId, type CellId, type Direction, type WindowEdge } from '../types/puzzle';
import { computeAreas, isWallBetween } from '../lib/grid';
import type { Puzzle } from '../types/puzzle';
import iconCroce from '../assets/ui/croce.svg';
import './GridCanvas.css';

const GAP = 4; // px, spessore della fascia cliccabile/trascinabile per i muri interni
const PERI_GAP = 8; // px, spessore della fascia (nera di default) del perimetro/finestre
const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;
const AREA_PALETTE = [
  '#fde2e4', '#e2ece9', '#d6e2e9', '#fff1d6', '#e8e8e4', '#f0d9ff',
  '#d0f4de', '#ffd6a5', '#cdeafd', '#f6dfeb', '#e4f1d6', '#f9e2d0',
];

export function areaColor(areaIndex: number): string {
  return AREA_PALETTE[areaIndex % AREA_PALETTE.length];
}

type Edge = { side: 'right' | 'bottom'; cell: CellId };

interface GridCanvasProps {
  puzzle: Pick<Puzzle, 'width' | 'height' | 'wallsRight' | 'wallsBottom'> & { disabledCells?: CellId[] };
  renderCell?: (cell: CellId) => ReactNode;
  cellClassName?: (cell: CellId) => string | undefined;
  /** Stile extra applicato alla cella (es. tinta di evidenziazione), oltre al colore d'area. */
  cellStyle?: (cell: CellId) => CSSProperties | undefined;
  /**
   * Evidenzia una cella come parte di una "regione" (es. le celle nominate da un indizio):
   * invece di un bordo su ogni singola cella, viene disegnato un contorno solo sul perimetro
   * esterno dell'insieme di celle con lo stesso valore, così un'area evidenziata appare come
   * un'unica zona contornata invece di tante celle bordate singolarmente.
   */
  cellHighlight?: (cell: CellId) => 'positive' | 'negative' | undefined;
  /** Click/tap breve su una cella. */
  onCellClick?: (cell: CellId) => void;
  /** Pressione prolungata (long-press) su una cella. Se assente, le celle si comportano come un click semplice. */
  onCellLongPress?: (cell: CellId) => void;
  /**
   * Se attivo, la pressione su una cella avvia un trascinamento tra celle adiacenti (per
   * piazzare oggetti multi-cella) invece del normale click/pressione lunga. Al rilascio,
   * `onElementDragComplete` riceve le celle toccate nell'ordine (anche una sola, per un tap semplice).
   */
  elementDragMode?: boolean;
  onElementDragComplete?: (cells: CellId[]) => void;
  onEdgeClick?: (edge: Edge) => void;
  editableWalls?: boolean;
  /** Finestre segnate sul perimetro esterno rettangolare della griglia. */
  windows?: WindowEdge[];
  onWindowClick?: (edge: WindowEdge) => void;
  editableWindows?: boolean;
  /** Etichette dei nomi delle aree, piazzate fuori dalle celle appena sotto la zona (vedi areaBottomLabelAnchor). */
  areaLabels?: { row: number; colMin: number; colMax: number; text: string }[];
  /** Overlay a immagine unica per oggetti ad "impronta fissa" (es. letto), estesi su più celle (vedi fixedFootprintGroups). */
  spanningImages?: { groupId: string; anchorRow: number; anchorCol: number; widthCells: number; heightCells: number; image: string }[];
  /** In modalità gioco le celle disattivate non si mostrano affatto (niente tratteggio): il perimetro nero attorno a loro basta. */
  disabledCellsHidden?: boolean;
}

type Vertex = { vx: number; vy: number };

function cellIdFromElement(el: Element | null): CellId | null {
  // Usa closest() perché il punto puntato può cadere su un figlio della cella (icona, badge...).
  const found = el?.closest('[data-cell-id]');
  return found instanceof HTMLElement ? (found.dataset.cellId ?? null) : null;
}

/** true se le due celle sono ortogonalmente adiacenti (per il trascinamento in linea). */
function isOrthogonallyAdjacent(a: CellId, b: CellId): boolean {
  const [ar, ac] = a.split('-').map(Number);
  const [br, bc] = b.split('-').map(Number);
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

export function GridCanvas({
  puzzle,
  renderCell,
  cellClassName,
  cellStyle,
  cellHighlight,
  onCellClick,
  onCellLongPress,
  elementDragMode = false,
  onElementDragComplete,
  onEdgeClick,
  editableWalls = false,
  windows = [],
  onWindowClick,
  editableWindows = false,
  areaLabels = [],
  spanningImages = [],
  disabledCellsHidden = false,
}: GridCanvasProps) {
  const { width, height } = puzzle;
  const areas = computeAreas(puzzle);
  const areaIndex = new Map(areas.areaIds.map((id, i) => [id, i]));
  const disabledSet = new Set(puzzle.disabledCells ?? []);
  const windowSet = new Set(windows.map((w) => `${w.cellId}:${w.side}`));
  const gridElRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<{ cell: CellId; timer: number | null; longFired: boolean; x: number; y: number } | null>(
    null,
  );
  const [pressingCell, setPressingCell] = useState<CellId | null>(null);
  const elementDragRef = useRef<{ active: boolean; path: CellId[]; cursor: CellId } | null>(null);
  const [elementDragPath, setElementDragPath] = useState<CellId[]>([]);
  // Trascinamento muri: solo linee dritte da incrocio a incrocio della griglia (vedi
  // wallsAlongLine/applyWallLine più sotto). `vertexDragRef` traccia il gesto in corso;
  // `selectedVertex` permette in alternativa di selezionare due incroci con due tap separati.
  const vertexDragRef = useRef<{ start: Vertex; moved: boolean } | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<Vertex | null>(null);
  const [previewLine, setPreviewLine] = useState<{ a: Vertex; b: Vertex } | null>(null);

  // Dimensione delle celle in px, calcolata (non "1fr"+aspect-ratio sul contenitore) così restano
  // sempre quadrate anche con griglie non quadrate (larghezza celle diversa dall'altezza celle):
  // il budget disponibile viene diviso per il lato più stretto tra i due, in modo da rispettare
  // sia la larghezza che l'altezza massime disponibili in viewport.
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const maxWidthPx = Math.min(viewport.w * 0.9, 640);
  const maxHeightPx = viewport.h * 0.65;
  const gapTotalW = 2 * PERI_GAP + (width - 1) * GAP;
  const gapTotalH = 2 * PERI_GAP + (height - 1) * GAP;
  const cellSize = Math.max(16, Math.min((maxWidthPx - gapTotalW) / width, (maxHeightPx - gapTotalH) / height));
  const containerWidthPx = cellSize * width + gapTotalW;
  const containerHeightPx = cellSize * height + gapTotalH;

  // Posizione in px di ogni incrocio (vertice) della griglia lungo ciascun asse, calcolata dalle
  // stesse dimensioni (cellSize/GAP/PERI_GAP) usate per le tracce della griglia: il vertice vx
  // (0..width) è il centro della fascia GAP/PERI_GAP tra la cella vx-1 e la cella vx.
  const vertexXs = Array.from({ length: width + 1 }, (_, vx) =>
    vx === 0 ? PERI_GAP / 2 : vx === width ? containerWidthPx - PERI_GAP / 2 : PERI_GAP + vx * cellSize + (vx - 1) * GAP + GAP / 2,
  );
  const vertexYs = Array.from({ length: height + 1 }, (_, vy) =>
    vy === 0 ? PERI_GAP / 2 : vy === height ? containerHeightPx - PERI_GAP / 2 : PERI_GAP + vy * cellSize + (vy - 1) * GAP + GAP / 2,
  );

  const nearestIndex = (pos: number, positions: number[]): number =>
    positions.reduce((best, val, i) => (Math.abs(val - pos) < Math.abs(positions[best] - pos) ? i : best), 0);

  /** Incrocio della griglia più vicino al punto puntato, in coordinate schermo. */
  const nearestVertex = (clientX: number, clientY: number): Vertex | null => {
    const rect = gridElRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { vx: nearestIndex(clientX - rect.left, vertexXs), vy: nearestIndex(clientY - rect.top, vertexYs) };
  };

  /** Vincola `current` sulla stessa riga o sulla stessa colonna di `start` (solo linee dritte),
   * scegliendo l'asse dominante dello spostamento. */
  const snapToAxis = (start: Vertex, current: Vertex): Vertex => {
    const dx = current.vx - start.vx;
    const dy = current.vy - start.vy;
    return Math.abs(dx) >= Math.abs(dy) ? { vx: current.vx, vy: start.vy } : { vx: start.vx, vy: current.vy };
  };

  /** Muri toccati da una linea dritta (orizzontale o verticale) tra due incroci; vuoto se i due
   * incroci non sono allineati, se l'asse costante è sul bordo esterno (nessun muro possibile lì)
   * o se un tratto tocca una cella disattivata (quel confine è una finestra, non un muro). */
  const wallsAlongLine = (a: Vertex, b: Vertex): Edge[] => {
    const edges: Edge[] = [];
    if (a.vx === b.vx && a.vy !== b.vy) {
      const vx = a.vx;
      if (vx <= 0 || vx >= width) return [];
      const yMin = Math.min(a.vy, b.vy);
      const yMax = Math.max(a.vy, b.vy);
      for (let y = yMin; y < yMax; y++) {
        const left = cellId(y, vx - 1);
        const right = cellId(y, vx);
        if (disabledSet.has(left) || disabledSet.has(right)) continue;
        edges.push({ side: 'right', cell: left });
      }
    } else if (a.vy === b.vy && a.vx !== b.vx) {
      const vy = a.vy;
      if (vy <= 0 || vy >= height) return [];
      const xMin = Math.min(a.vx, b.vx);
      const xMax = Math.max(a.vx, b.vx);
      for (let x = xMin; x < xMax; x++) {
        const top = cellId(vy - 1, x);
        const bottom = cellId(vy, x);
        if (disabledSet.has(top) || disabledSet.has(bottom)) continue;
        edges.push({ side: 'bottom', cell: top });
      }
    }
    return edges;
  };

  const isWallSet = (edge: Edge): boolean =>
    (edge.side === 'right' ? puzzle.wallsRight : puzzle.wallsBottom).includes(edge.cell);

  /** Applica una linea di muri: se il primo tratto è già muro li toglie tutti, altrimenti li
   * aggiunge tutti (come un pennello, coerente su tutta la linea in un colpo solo). */
  const applyWallLine = (a: Vertex, b: Vertex) => {
    const edges = wallsAlongLine(a, b);
    if (edges.length === 0) return;
    const shouldAdd = !isWallSet(edges[0]);
    for (const edge of edges) {
      if (isWallSet(edge) !== shouldAdd) onEdgeClick?.(edge);
    }
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editableWalls) return;
    const v = nearestVertex(e.clientX, e.clientY);
    if (!v) return;
    e.preventDefault();
    vertexDragRef.current = { start: v, moved: false };
    setPreviewLine({ a: v, b: v });
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (vertexDragRef.current) {
      e.preventDefault();
      const v = nearestVertex(e.clientX, e.clientY);
      if (!v) return;
      const { start } = vertexDragRef.current;
      if (v.vx !== start.vx || v.vy !== start.vy) vertexDragRef.current.moved = true;
      setPreviewLine({ a: start, b: snapToAxis(start, v) });
      return;
    }
    if (elementDragRef.current?.active) {
      e.preventDefault();
      const overId = cellIdFromElement(document.elementFromPoint(e.clientX, e.clientY));
      const { path, cursor } = elementDragRef.current;
      if (
        overId &&
        overId !== cursor &&
        !disabledSet.has(overId) &&
        isOrthogonallyAdjacent(cursor, overId) &&
        !isWallBetween(cursor, overId, puzzle.wallsRight, puzzle.wallsBottom)
      ) {
        // Il cursore si sposta sempre su una cella adiacente valida, anche se già visitata: così
        // tornando indietro su una cella del percorso si può ripartire in un'altra direzione da
        // lì (utile per formare un incrocio a T/croce in un unico trascinamento), senza perdere
        // le celle già toccate, che restano tutte nel percorso finale.
        elementDragRef.current.cursor = overId;
        if (!path.includes(overId)) {
          const nextPath = [...path, overId];
          elementDragRef.current.path = nextPath;
          setElementDragPath(nextPath);
        }
      }
      return;
    }
    const press = pressRef.current;
    if (press?.timer != null && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_CANCEL_PX) {
      window.clearTimeout(press.timer);
      pressRef.current = null;
      setPressingCell(null);
    }
  };

  const endDrag = () => {
    if (vertexDragRef.current) {
      const { start, moved } = vertexDragRef.current;
      const end = previewLine?.b ?? start;
      vertexDragRef.current = null;
      setPreviewLine(null);
      if (moved) {
        // Trascinamento: applica subito la linea (vincolata all'asse dominante in handlePointerMove).
        applyWallLine(start, end);
        setSelectedVertex(null);
      } else if (!selectedVertex) {
        // Primo tap: seleziona questo incrocio, in attesa del secondo per completare la linea.
        setSelectedVertex(start);
      } else if (selectedVertex.vx === start.vx && selectedVertex.vy === start.vy) {
        // Ri-tap sullo stesso incrocio già selezionato: deseleziona (ripensamento).
        setSelectedVertex(null);
      } else if (selectedVertex.vx === start.vx || selectedVertex.vy === start.vy) {
        // Secondo tap allineato (stessa riga o colonna): completa la linea tra i due punti.
        applyWallLine(selectedVertex, start);
        setSelectedVertex(null);
      } else {
        // Secondo tap non allineato: diventa il nuovo punto di partenza, invece di annullare tutto.
        setSelectedVertex(start);
      }
    }
    if (elementDragRef.current?.active) {
      const path = elementDragRef.current.path;
      elementDragRef.current = null;
      setElementDragPath([]);
      onElementDragComplete?.(path);
    }
  };

  const clearPress = () => {
    if (pressRef.current?.timer != null) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
    setPressingCell(null);
  };

  const handleCellPointerDown = (id: CellId) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (elementDragMode) {
      e.preventDefault();
      elementDragRef.current = { active: true, path: [id], cursor: id };
      setElementDragPath([id]);
      return;
    }
    if (!onCellClick && !onCellLongPress) return;
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
    if (!onCellLongPress) {
      // Nessun gestore di pressione prolungata: comportamento a click semplice, indipendente dalla durata.
      pressRef.current = { cell: id, timer: null, longFired: false, x, y };
      return;
    }
    const timer = window.setTimeout(() => {
      if (pressRef.current?.cell === id) {
        pressRef.current.longFired = true;
        onCellLongPress(id);
        setPressingCell(null);
      }
    }, LONG_PRESS_MS);
    pressRef.current = { cell: id, timer, longFired: false, x, y };
    setPressingCell(id);
  };

  const handleCellPointerUp = (id: CellId) => () => {
    const press = pressRef.current;
    if (!press || press.cell !== id) return;
    if (press.timer !== null) window.clearTimeout(press.timer);
    pressRef.current = null;
    setPressingCell(null);
    if (!press.longFired) onCellClick?.(id);
  };

  const colTemplate = [
    `${PERI_GAP}px`,
    ...Array.from({ length: 2 * width - 1 }, (_, i) => (i % 2 === 0 ? `${cellSize}px` : `${GAP}px`)),
    `${PERI_GAP}px`,
  ].join(' ');
  const rowTemplate = [
    `${PERI_GAP}px`,
    ...Array.from({ length: 2 * height - 1 }, (_, i) => (i % 2 === 0 ? `${cellSize}px` : `${GAP}px`)),
    `${PERI_GAP}px`,
  ].join(' ');

  const windowEdge = (id: CellId, side: Direction, gridRow: number, gridColumn: number) => {
    const has = windowSet.has(`${id}:${side}`);
    return (
      <div
        key={`${id}-w${side}`}
        className={`mk-window-edge ${has ? 'mk-window' : ''} ${editableWindows ? 'mk-editable' : ''}`}
        style={{ gridRow, gridColumn }}
        onClick={() => onWindowClick?.({ cellId: id, side })}
      />
    );
  };

  // Anteprima della linea di muri in corso di trascinamento: mappa "side:cell" -> se il rilascio
  // aggiungerebbe (true) o toglierebbe (false) quel muro, per colorare i tratti coinvolti.
  const previewEdges = new Map<string, boolean>();
  if (previewLine) {
    const edges = wallsAlongLine(previewLine.a, previewLine.b);
    if (edges.length > 0) {
      const shouldAdd = !isWallSet(edges[0]);
      for (const edge of edges) previewEdges.set(`${edge.side}:${edge.cell}`, shouldAdd);
    }
  }

  // Colore di evidenziazione di una cella (undefined per le celle disattivate, che non fanno mai
  // parte di una regione evidenziata).
  const regionColorAt = (id: CellId | null): 'positive' | 'negative' | undefined =>
    id && !disabledSet.has(id) ? cellHighlight?.(id) : undefined;

  /** Colore del contorno da disegnare tra due celle affiancate (o tra una cella e il bordo esterno
   * quando `thereId` è null): solo se i due lati hanno un'evidenziazione diversa (una sola delle
   * due, o due valori diversi), così il contorno segue solo il perimetro esterno della regione. */
  const regionBoundaryColor = (hereId: CellId, thereId: CellId | null): 'positive' | 'negative' | null => {
    const a = regionColorAt(hereId);
    const b = regionColorAt(thereId);
    return a === b ? null : a ?? b ?? null;
  };

  const regionEdge = (key: string, color: 'positive' | 'negative', gridRow: number | string, gridColumn: number | string) => (
    <div key={key} className={`mk-region-edge mk-region-edge-${color}`} style={{ gridRow, gridColumn }} />
  );

  const cells = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const id = cellId(r, c);
      const isDisabled = disabledSet.has(id);
      const bg = isDisabled ? undefined : areaColor(areaIndex.get(areas.cellArea[id]) ?? 0);
      const extraClassName = cellClassName?.(id) ?? '';
      cells.push(
        <div
          key={id}
          data-cell-id={id}
          className={`mk-cell ${isDisabled ? (disabledCellsHidden ? 'mk-cell-disabled-hidden' : 'mk-cell-disabled') : ''} ${extraClassName} ${pressingCell === id ? 'pressing' : ''} ${elementDragPath.includes(id) ? 'mk-cell-drag-path' : ''}`}
          style={{ gridRow: 2 * r + 2, gridColumn: 2 * c + 2, background: bg, ...(isDisabled ? undefined : cellStyle?.(id)) }}
          onPointerDown={handleCellPointerDown(id)}
          onPointerUp={handleCellPointerUp(id)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!isDisabled && renderCell?.(id)}
        </div>,
      );

      if (!isDisabled && extraClassName.split(' ').includes('locked')) {
        // Elemento a parte (non annidato in .mk-cell): un discendente non può mai stare sopra un
        // elemento "sopraelevato" con z-index proprio (es. gli overlay ad impronta fissa) se il
        // suo genitore diretto (.mk-cell) non ha a sua volta uno z-index esplicito, quindi il
        // marker della cella esclusa va disegnato come cella indipendente con z-index proprio.
        cells.push(<div key={`${id}-locked`} className="mk-locked-mark" style={{ gridRow: 2 * r + 2, gridColumn: 2 * c + 2 }} />);
      }

      if (c < width - 1) {
        const rightId = cellId(r, c + 1);
        const rightDisabled = disabledSet.has(rightId);
        if (isDisabled && rightDisabled) {
          cells.push(<div key={`${id}-r`} style={{ gridRow: 2 * r + 2, gridColumn: 2 * c + 3 }} />);
        } else if (isDisabled !== rightDisabled) {
          // Una delle due celle è disattivata: questo bordo interno diventa un bordo esterno
          // della mappa irregolare, con lo stesso controllo finestra del perimetro rettangolare.
          const activeId = isDisabled ? rightId : id;
          const side: Direction = isDisabled ? 'O' : 'E';
          cells.push(windowEdge(activeId, side, 2 * r + 2, 2 * c + 3));
        } else {
          const hasWall = puzzle.wallsRight.includes(id);
          const preview = previewEdges.get(`right:${id}`);
          cells.push(
            <div
              key={`${id}-r`}
              className={`mk-edge mk-edge-v ${hasWall ? 'mk-wall' : ''} ${editableWalls ? 'mk-editable' : ''} ${preview === true ? 'mk-edge-preview-add' : ''} ${preview === false ? 'mk-edge-preview-remove' : ''}`}
              style={{ gridRow: 2 * r + 2, gridColumn: 2 * c + 3 }}
            />,
          );
        }
        const rColor = regionBoundaryColor(id, rightId);
        if (rColor) cells.push(regionEdge(`${id}-hl-r`, rColor, 2 * r + 2, 2 * c + 3));
      }
      if (r < height - 1) {
        const bottomId = cellId(r + 1, c);
        const bottomDisabled = disabledSet.has(bottomId);
        if (isDisabled && bottomDisabled) {
          cells.push(<div key={`${id}-b`} style={{ gridRow: 2 * r + 3, gridColumn: 2 * c + 2 }} />);
        } else if (isDisabled !== bottomDisabled) {
          const activeId = isDisabled ? bottomId : id;
          const side: Direction = isDisabled ? 'N' : 'S';
          cells.push(windowEdge(activeId, side, 2 * r + 3, 2 * c + 2));
        } else {
          const hasWall = puzzle.wallsBottom.includes(id);
          const preview = previewEdges.get(`bottom:${id}`);
          cells.push(
            <div
              key={`${id}-b`}
              className={`mk-edge mk-edge-h ${hasWall ? 'mk-wall' : ''} ${editableWalls ? 'mk-editable' : ''} ${preview === true ? 'mk-edge-preview-add' : ''} ${preview === false ? 'mk-edge-preview-remove' : ''}`}
              style={{ gridRow: 2 * r + 3, gridColumn: 2 * c + 2 }}
            />,
          );
        }
        const bColor = regionBoundaryColor(id, bottomId);
        if (bColor) cells.push(regionEdge(`${id}-hl-b`, bColor, 2 * r + 3, 2 * c + 2));
      }

      if (!isDisabled) {
        if (r === 0) cells.push(windowEdge(id, 'N', 1, 2 * c + 2));
        if (r === height - 1) cells.push(windowEdge(id, 'S', 2 * height + 1, 2 * c + 2));
        if (c === 0) cells.push(windowEdge(id, 'O', 2 * r + 2, 1));
        if (c === width - 1) cells.push(windowEdge(id, 'E', 2 * r + 2, 2 * width + 1));
      }

      const outerColor = regionBoundaryColor(id, null);
      if (outerColor) {
        if (r === 0) cells.push(regionEdge(`${id}-hl-N`, outerColor, 1, 2 * c + 2));
        if (r === height - 1) cells.push(regionEdge(`${id}-hl-S`, outerColor, 2 * height + 1, 2 * c + 2));
        if (c === 0) cells.push(regionEdge(`${id}-hl-O`, outerColor, 2 * r + 2, 1));
        if (c === width - 1) cells.push(regionEdge(`${id}-hl-E`, outerColor, 2 * r + 2, 2 * width + 1));
      }
    }
  }

  // Pallini sugli incroci della griglia: punti di aggancio per il trascinamento/selezione dei
  // muri (solo linee dritte tra due incroci, vedi handlePointerDown/wallsAlongLine). Elementi
  // a parte, puramente visivi (l'interazione è gestita a livello di .mk-grid via nearestVertex),
  // quindi pointer-events:none.
  if (editableWalls) {
    for (let vy = 0; vy <= height; vy++) {
      for (let vx = 0; vx <= width; vx++) {
        const isSelected = selectedVertex?.vx === vx && selectedVertex?.vy === vy;
        const isEndpoint = previewLine && ((previewLine.a.vx === vx && previewLine.a.vy === vy) || (previewLine.b.vx === vx && previewLine.b.vy === vy));
        cells.push(
          <div
            key={`vertex-${vx}-${vy}`}
            data-vx={vx}
            data-vy={vy}
            className={`mk-vertex ${isSelected ? 'mk-vertex-selected' : ''} ${isEndpoint ? 'mk-vertex-endpoint' : ''}`}
            style={{ gridRow: 2 * vy + 1, gridColumn: 2 * vx + 1 }}
          />,
        );
      }
    }
  }

  // Overlay a immagine unica per oggetti ad impronta fissa (es. letto): elementi a parte (non
  // annidati in una .mk-cell), per poter coprire più celle in un solo elemento. z-index esplicito
  // per stare sopra lo sfondo colorato delle celle ma sotto i marker dei sospettati (z-index:2).
  for (const span of spanningImages) {
    cells.push(
      <div
        key={`span-${span.groupId}`}
        className="mk-spanning-image"
        style={{
          gridRow: `${2 * span.anchorRow + 2} / ${2 * span.anchorRow + 2 + 2 * span.heightCells - 1}`,
          gridColumn: `${2 * span.anchorCol + 2} / ${2 * span.anchorCol + 2 + 2 * span.widthCells - 1}`,
        }}
      >
        <img src={span.image} alt="" />
      </div>,
    );
  }

  // Etichette dei nomi delle aree: elementi a parte (non annidati in una .mk-cell), così non
  // vengono ritagliati dal suo overflow:hidden e possono sporgere fuori, sotto la zona.
  for (const label of areaLabels) {
    cells.push(
      <div
        key={`area-label-${label.row}-${label.colMin}-${label.colMax}`}
        className="mk-area-name"
        style={{ gridRow: 2 * label.row + 2, gridColumn: `${2 * label.colMin + 2} / ${2 * label.colMax + 3}` }}
      >
        {label.text}
      </div>,
    );
  }

  return (
    <div
      ref={gridElRef}
      className="mk-grid"
      style={
        {
          gridTemplateColumns: colTemplate,
          gridTemplateRows: rowTemplate,
          width: containerWidthPx,
          height: containerHeightPx,
          '--icon-croce': `url("${iconCroce}")`,
        } as CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={() => {
        endDrag();
        clearPress();
      }}
      onPointerCancel={() => {
        endDrag();
        clearPress();
      }}
    >
      {cells}
    </div>
  );
}
