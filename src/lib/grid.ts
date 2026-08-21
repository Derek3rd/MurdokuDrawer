import { cellId, parseCellId, type CellId, type Puzzle } from '../types/puzzle';

export interface AreaMap {
  /** areaId per ogni CellId */
  cellArea: Record<CellId, string>;
  /** elenco di CellId per ogni areaId, nell'ordine di scoperta */
  areaCells: Record<string, CellId[]>;
  areaIds: string[];
}

/**
 * Calcola le aree (componenti connesse) a partire dai muri disegnati
 * nell'editor. Due celle adiacenti stanno nella stessa area se e solo
 * se non c'è un muro tra di loro.
 */
export function computeAreas(puzzle: Pick<Puzzle, 'width' | 'height' | 'wallsRight' | 'wallsBottom'>): AreaMap {
  const { width, height } = puzzle;
  const wallsRight = new Set(puzzle.wallsRight);
  const wallsBottom = new Set(puzzle.wallsBottom);

  const cellArea: Record<CellId, string> = {};
  const areaCells: Record<string, CellId[]> = {};
  const areaIds: string[] = [];
  const visited = new Set<CellId>();

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const start = cellId(row, col);
      if (visited.has(start)) continue;

      const areaId = `area-${areaIds.length + 1}`;
      areaIds.push(areaId);
      const stack = [start];
      visited.add(start);
      const cells: CellId[] = [];

      while (stack.length > 0) {
        const current = stack.pop() as CellId;
        cells.push(current);
        cellArea[current] = areaId;
        const { row: r, col: c } = parseCellId(current);

        const neighbors: Array<{ id: CellId; blocked: boolean }> = [];
        if (c + 1 < width) neighbors.push({ id: cellId(r, c + 1), blocked: wallsRight.has(current) });
        if (c - 1 >= 0) neighbors.push({ id: cellId(r, c - 1), blocked: wallsRight.has(cellId(r, c - 1)) });
        if (r + 1 < height) neighbors.push({ id: cellId(r + 1, c), blocked: wallsBottom.has(current) });
        if (r - 1 >= 0) neighbors.push({ id: cellId(r - 1, c), blocked: wallsBottom.has(cellId(r - 1, c)) });

        for (const n of neighbors) {
          if (!n.blocked && !visited.has(n.id)) {
            visited.add(n.id);
            stack.push(n.id);
          }
        }
      }

      areaCells[areaId] = cells;
    }
  }

  return { cellArea, areaCells, areaIds };
}

export function isAdjacent(a: CellId, b: CellId): boolean {
  const ca = parseCellId(a);
  const cb = parseCellId(b);
  const dr = Math.abs(ca.row - cb.row);
  const dc = Math.abs(ca.col - cb.col);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

/** True se `a` si trova nella direzione `dir` rispetto a `b` (a è dir di b). */
export function isInDirection(a: CellId, b: CellId, dir: 'N' | 'S' | 'E' | 'O'): boolean {
  const ca = parseCellId(a);
  const cb = parseCellId(b);
  switch (dir) {
    case 'N':
      return ca.col === cb.col && ca.row < cb.row;
    case 'S':
      return ca.col === cb.col && ca.row > cb.row;
    case 'E':
      return ca.row === cb.row && ca.col > cb.col;
    case 'O':
      return ca.row === cb.row && ca.col < cb.col;
  }
}

export function isAdjacentInDirection(a: CellId, b: CellId, dir: 'N' | 'S' | 'E' | 'O'): boolean {
  return isInDirection(a, b, dir) && isAdjacent(a, b);
}
