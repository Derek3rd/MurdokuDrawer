import type { CellId, Clue, GlobalRule, Puzzle } from '../types/puzzle';
import { parseCellId } from '../types/puzzle';
import { isAdjacent, isAdjacentInDirection, isInDirection, type AreaMap } from './grid';

export type Positions = Record<string, CellId | null>;

/** Costruisce la mappa suspectId -> cella dalle soluzioni impostate nell'editor. */
export function solutionPositions(puzzle: Puzzle): Positions {
  const pos: Positions = {};
  for (const s of puzzle.suspects) pos[s.id] = s.solutionCellId;
  return pos;
}

function resolveTargetCell(
  targetType: 'suspect' | 'element' | 'cell',
  targetId: string,
  puzzle: Puzzle,
  positions: Positions,
): CellId | null {
  if (targetType === 'cell') return targetId;
  if (targetType === 'element') {
    return puzzle.elements.find((e) => e.id === targetId)?.cellId ?? null;
  }
  return positions[targetId] ?? null;
}

/**
 * Verifica un singolo indizio contro un set di posizioni (parziale o completo).
 * Ritorna true/false se verificabile, null se mancano ancora dati (posizioni
 * non note) per stabilirlo con certezza.
 */
export function checkClue(clue: Clue, puzzle: Puzzle, positions: Positions, areas: AreaMap): boolean | null {
  const subjectCell = positions[clue.suspectId];
  if (!subjectCell) return null;

  switch (clue.type) {
    case 'direction': {
      const targetCell = resolveTargetCell(clue.targetType, clue.targetId, puzzle, positions);
      if (!targetCell) return null;
      return clue.adjacent
        ? isAdjacentInDirection(subjectCell, targetCell, clue.direction)
        : isInDirection(subjectCell, targetCell, clue.direction);
    }
    case 'inArea':
      return areas.cellArea[subjectCell] === clue.areaId;
    case 'onElement': {
      const el = puzzle.elements.find((e) => e.id === clue.elementId);
      if (!el) return null;
      return el.cellId === subjectCell;
    }
    case 'nearElement': {
      const el = puzzle.elements.find((e) => e.id === clue.elementId);
      if (!el) return null;
      return isAdjacent(subjectCell, el.cellId);
    }
    case 'alone': {
      const myArea = areas.cellArea[subjectCell];
      return !puzzle.suspects.some(
        (s) => s.id !== clue.suspectId && positions[s.id] && areas.cellArea[positions[s.id] as CellId] === myArea,
      );
    }
    case 'together': {
      const otherCell = positions[clue.otherSuspectId];
      if (!otherCell) return null;
      return areas.cellArea[subjectCell] === areas.cellArea[otherCell];
    }
  }
}

export function checkGlobalRule(rule: GlobalRule, puzzle: Puzzle, positions: Positions, areas: AreaMap): boolean | null {
  switch (rule.type) {
    case 'allAreasHaveSuspect': {
      const occupiedAreas = new Set(
        Object.values(positions)
          .filter((c): c is CellId => !!c)
          .map((c) => areas.cellArea[c]),
      );
      if (occupiedAreas.size < areas.areaIds.length) {
        // Non ancora tutti i sospettati piazzati: non possiamo dire se fallirà,
        // ma se mancano meno aree libere che sospettati non ancora piazzati va bene comunque.
        const unplaced = puzzle.suspects.filter((s) => !positions[s.id]).length;
        const missingAreas = areas.areaIds.length - occupiedAreas.size;
        if (unplaced < missingAreas) return false;
        return null;
      }
      return true;
    }
    case 'evenCountInAreas': {
      let count = 0;
      let allKnown = true;
      for (const s of puzzle.suspects) {
        const c = positions[s.id];
        if (!c) {
          allKnown = false;
          continue;
        }
        if (rule.areaIds.includes(areas.cellArea[c])) count++;
      }
      if (!allKnown) return null;
      return count % 2 === 0;
    }
    case 'custom':
      return null; // regola libera, non verificabile automaticamente
  }
}

/** Verifica il vincolo "un sospettato per riga e uno per colonna". */
export function findRowColConflicts(positions: Positions): { suspectId: string; cellId: CellId }[] {
  const rows = new Map<number, string[]>();
  const cols = new Map<number, string[]>();
  const entries = Object.entries(positions).filter((e): e is [string, CellId] => !!e[1]);

  for (const [suspectId, cell] of entries) {
    const { row, col } = parseCellId(cell);
    rows.set(row, [...(rows.get(row) ?? []), suspectId]);
    cols.set(col, [...(cols.get(col) ?? []), suspectId]);
  }

  const conflicting = new Set<string>();
  for (const ids of rows.values()) if (ids.length > 1) ids.forEach((id) => conflicting.add(id));
  for (const ids of cols.values()) if (ids.length > 1) ids.forEach((id) => conflicting.add(id));

  return entries.filter(([id]) => conflicting.has(id)).map(([suspectId, cellId]) => ({ suspectId, cellId }));
}
