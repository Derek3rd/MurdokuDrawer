import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cellId, type CellId } from '../types/puzzle';
import { computeAreas } from '../lib/grid';
import type { Puzzle } from '../types/puzzle';
import './GridCanvas.css';

const GAP = 10; // px, spessore della fascia cliccabile/trascinabile per i muri
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
  puzzle: Pick<Puzzle, 'width' | 'height' | 'wallsRight' | 'wallsBottom'>;
  renderCell?: (cell: CellId) => ReactNode;
  cellClassName?: (cell: CellId) => string | undefined;
  /** Click/tap breve su una cella. */
  onCellClick?: (cell: CellId) => void;
  /** Pressione prolungata (long-press) su una cella. Se assente, le celle si comportano come un click semplice. */
  onCellLongPress?: (cell: CellId) => void;
  onEdgeClick?: (edge: Edge) => void;
  editableWalls?: boolean;
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
  onCellClick,
  onCellLongPress,
  onEdgeClick,
  editableWalls = false,
}: GridCanvasProps) {
  const { width, height } = puzzle;
  const areas = computeAreas(puzzle);
  const areaIndex = new Map(areas.areaIds.map((id, i) => [id, i]));
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

  const colTemplate = Array.from({ length: 2 * width - 1 }, (_, i) => (i % 2 === 0 ? '1fr' : `${GAP}px`)).join(' ');
  const rowTemplate = Array.from({ length: 2 * height - 1 }, (_, i) => (i % 2 === 0 ? '1fr' : `${GAP}px`)).join(' ');

  const cells = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const id = cellId(r, c);
      const bg = areaColor(areaIndex.get(areas.cellArea[id]) ?? 0);
      cells.push(
        <div
          key={id}
          className={`mk-cell ${cellClassName?.(id) ?? ''} ${pressingCell === id ? 'pressing' : ''}`}
          style={{ gridRow: 2 * r + 1, gridColumn: 2 * c + 1, background: bg }}
          onPointerDown={handleCellPointerDown(id)}
          onPointerUp={handleCellPointerUp(id)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {renderCell?.(id)}
        </div>,
      );

      if (c < width - 1) {
        const hasWall = puzzle.wallsRight.includes(id);
        cells.push(
          <div
            key={`${id}-r`}
            className={`mk-edge mk-edge-v ${hasWall ? 'mk-wall' : ''} ${editableWalls ? 'mk-editable' : ''}`}
            style={{ gridRow: 2 * r + 1, gridColumn: 2 * c + 2 }}
            data-side="right"
            data-cell={id}
          />,
        );
      }
      if (r < height - 1) {
        const hasWall = puzzle.wallsBottom.includes(id);
        cells.push(
          <div
            key={`${id}-b`}
            className={`mk-edge mk-edge-h ${hasWall ? 'mk-wall' : ''} ${editableWalls ? 'mk-editable' : ''}`}
            style={{ gridRow: 2 * r + 2, gridColumn: 2 * c + 1 }}
            data-side="bottom"
            data-cell={id}
          />,
        );
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
