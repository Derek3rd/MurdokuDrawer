import type { ReactNode } from 'react';
import { cellId, type CellId } from '../types/puzzle';
import { computeAreas } from '../lib/grid';
import type { Puzzle } from '../types/puzzle';
import './GridCanvas.css';

const GAP = 10; // px, spessore della fascia cliccabile per i muri
const AREA_PALETTE = [
  '#fde2e4', '#e2ece9', '#d6e2e9', '#fff1d6', '#e8e8e4', '#f0d9ff',
  '#d0f4de', '#ffd6a5', '#cdeafd', '#f6dfeb', '#e4f1d6', '#f9e2d0',
];

export function areaColor(areaIndex: number): string {
  return AREA_PALETTE[areaIndex % AREA_PALETTE.length];
}

interface GridCanvasProps {
  puzzle: Pick<Puzzle, 'width' | 'height' | 'wallsRight' | 'wallsBottom'>;
  renderCell?: (cell: CellId) => ReactNode;
  cellClassName?: (cell: CellId) => string | undefined;
  onCellClick?: (cell: CellId) => void;
  onEdgeClick?: (edge: { side: 'right' | 'bottom'; cell: CellId }) => void;
  editableWalls?: boolean;
}

export function GridCanvas({
  puzzle,
  renderCell,
  cellClassName,
  onCellClick,
  onEdgeClick,
  editableWalls = false,
}: GridCanvasProps) {
  const { width, height } = puzzle;
  const areas = computeAreas(puzzle);
  const areaIndex = new Map(areas.areaIds.map((id, i) => [id, i]));

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
          className={`mk-cell ${cellClassName?.(id) ?? ''}`}
          style={{ gridRow: 2 * r + 1, gridColumn: 2 * c + 1, background: bg }}
          onClick={() => onCellClick?.(id)}
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
            onClick={(e) => {
              e.stopPropagation();
              onEdgeClick?.({ side: 'right', cell: id });
            }}
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
            onClick={(e) => {
              e.stopPropagation();
              onEdgeClick?.({ side: 'bottom', cell: id });
            }}
          />,
        );
      }
    }
  }

  return (
    <div className="mk-grid" style={{ gridTemplateColumns: colTemplate, gridTemplateRows: rowTemplate }}>
      {cells}
    </div>
  );
}
