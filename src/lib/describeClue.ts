import type { AreaMap } from './grid';
import { areaDisplayName } from './areaLabel';
import { elementCatalogEntry, type Clue, type Puzzle } from '../types/puzzle';

const DIRECTION_LABEL: Record<string, string> = { N: 'a Nord di', S: 'a Sud di', E: 'a Est di', O: 'a Ovest di' };

function elementLabel(elementId: string, puzzle: Puzzle): string {
  const el = puzzle.elements.find((e) => e.id === elementId);
  return el ? (elementCatalogEntry(el.type)?.label ?? '?') : '?';
}

function targetLabel(clue: Extract<Clue, { type: 'direction' }>, puzzle: Puzzle): string {
  if (clue.targetType === 'suspect') return puzzle.suspects.find((s) => s.id === clue.targetId)?.name ?? '?';
  if (clue.targetType === 'element') return elementLabel(clue.targetId, puzzle);
  return `cella ${clue.targetId}`;
}

export function describeClue(clue: Clue, puzzle: Puzzle, areas: AreaMap): string {
  switch (clue.type) {
    case 'direction':
      return `è ${clue.adjacent ? 'subito ' : ''}${DIRECTION_LABEL[clue.direction]} ${targetLabel(clue, puzzle)}`;
    case 'inArea':
      return `è nell'area "${areaDisplayName(clue.areaId, puzzle.areaNames, areas)}"`;
    case 'onElement':
      return `è sull'oggetto "${elementLabel(clue.elementId, puzzle)}"`;
    case 'nearElement':
      return `è vicino all'oggetto "${elementLabel(clue.elementId, puzzle)}"`;
    case 'alone':
      return 'è da solo nella sua area';
    case 'together':
      return `è insieme a ${puzzle.suspects.find((s) => s.id === clue.otherSuspectId)?.name ?? '?'}`;
  }
}
