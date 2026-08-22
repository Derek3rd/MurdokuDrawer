import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cellId, type CellId, type Direction, type WindowEdge } from '../types/puzzle';
import { computeAreas } from '../lib/grid';
import type { Puzzle } from '../types/puzzle';
import './GridCanvas.css';

const GAP = 10; // px, spessore della fascia cliccabile/trascinabile per i muri interni
const PERI_GAP = 14; // px, spessore della fascia cliccabile per le finestre sul perimetro
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
  /** Click/tap breve su una cella. */
  onCellClick?: (cell: CellId) => void;
  /** Pressione prolungata (long-press) su una cella. Se assente, le celle si comportano come un click semplice. */
  onCellLongPress?: (cell: CellId) => void;
  onEdgeClick?: (edge: Edge) => void;
  editableWalls?: boolean;
  /** Finestre segnate sul perimetro esterno rettangolare della griglia. */
  windows?: WindowEdge[];
  onWindowClick?: (edge: WindowEdge) => void;
  editableWindows?: boolean;
}

function edgeFromElement(el: Element | null): Edge | null {
  if (!(el instanceof HTMLElement)) return null;
  const side = el.dataset.side;
  const cell = el.dataset.cell;
  if ((side === 'right' || side === 'bottom') && cell) return { side, cell };
  return null;
}

export function GridCanvas({
  puzzle,
  renderCell,
  cellClassName,
  cellStyle,
  onCellClick,
  onCellLongPress,
  onEdgeClick,
  editableWalls = false,
  windows = [],
  onWindowClick,
  editableWindows = false,
}: GridCanvasProps) {
  const { width, height } = puzzle;
  const areas = computeAreas(puzzle);
  const areaIndex = new Map(areas.areaIds.map((id, i) => [id, i]));
  const disabledSet = new Set(puzzle.disabledCells ?? []);
  const windowSet = new Set(windows.map((w) => `${w.cellId}:${w.side}`));
  const dragRef = useRef<{ active: boolean; visited: Set<string> } | null>(null);
  const pressRef = useRef<{ cell: CellId; timer: number | null; longFired: boolean; x: number; y: number } | null>(
    null,
  );
  const [pressingCell, setPressingCell] = useState<CellId | null>(null);

  const paintEdge = (edge: Edge) => {
    const key = `${edge.side}:${edge.cell}`;
    if (dragRef.current?.visited.has(key)) return;
    dragRef.current?.visited.add(key);
    onEdgeClick?.(edge);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editableWalls) return;
    const edge = edgeFromElement(e.target as Element);
    if (!edge) return;
    e.preventDefault();
    dragRef.current = { active: true, visited: new Set() };
    paintEdge(edge);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.active) {
      e.preventDefault();
      const edge = edgeFromElement(document.elementFromPoint(e.clientX, e.clientY));
      if (edge) paintEdge(edge);
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
    if (dragRef.current) dragRef.current.active = false;
  };

  const clearPress = () => {
    if (pressRef.current?.timer != null) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
    setPressingCell(null);
  };

  const handleCellPointerDown = (id: CellId) => (e: ReactPointerEvent<HTMLDivElement>) => {
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
    ...Array.from({ length: 2 * width - 1 }, (_, i) => (i % 2 === 0 ? '1fr' : `${GAP}px`)),
    `${PERI_GAP}px`,
  ].join(' ');
  const rowTemplate = [
    `${PERI_GAP}px`,
    ...Array.from({ length: 2 * height - 1 }, (_, i) => (i % 2 === 0 ? '1fr' : `${GAP}px`)),
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

  const cells = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const id = cellId(r, c);
      const isDisabled = disabledSet.has(id);
      const bg = isDisabled ? undefined : areaColor(areaIndex.get(areas.cellArea[id]) ?? 0);
      cells.push(
        <div
          key={id}
          className={`mk-cell ${isDisabled ? 'mk-cell-disabled' : ''} ${cellClassName?.(id) ?? ''} ${pressingCell === id ? 'pressing' : ''}`}
          style={{ gridRow: 2 * r + 2, gridColumn: 2 * c + 2, background: bg, ...(isDisabled ? undefined : cellStyle?.(id)) }}
          onPointerDown={handleCellPointerDown(id)}
          onPointerUp={handleCellPointerUp(id)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!isDisabled && renderCell?.(id)}
        </div>,
      );

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
          cells.push(
            <div
              key={`${id}-r`}
              className={`mk-edge mk-edge-v ${hasWall ? 'mk-wall' : ''} ${editableWalls ? 'mk-editable' : ''}`}
              style={{ gridRow: 2 * r + 2, gridColumn: 2 * c + 3 }}
              data-side="right"
              data-cell={id}
            />,
          );
        }
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
          cells.push(
            <div
              key={`${id}-b`}
              className={`mk-edge mk-edge-h ${hasWall ? 'mk-wall' : ''} ${editableWalls ? 'mk-editable' : ''}`}
              style={{ gridRow: 2 * r + 3, gridColumn: 2 * c + 2 }}
              data-side="bottom"
              data-cell={id}
            />,
          );
        }
      }

      if (!isDisabled) {
        if (r === 0) cells.push(windowEdge(id, 'N', 1, 2 * c + 2));
        if (r === height - 1) cells.push(windowEdge(id, 'S', 2 * height + 1, 2 * c + 2));
        if (c === 0) cells.push(windowEdge(id, 'O', 2 * r + 2, 1));
        if (c === width - 1) cells.push(windowEdge(id, 'E', 2 * r + 2, 2 * width + 1));
      }
    }
  }

  return (
    <div
      className="mk-grid"
      style={{ gridTemplateColumns: colTemplate, gridTemplateRows: rowTemplate }}
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
