import { areaLabel } from './areaLabel';
import type { Clue, Puzzle } from '../types/puzzle';

const DIRECTION_LABEL: Record<string, string> = { N: 'a Nord di', S: 'a Sud di', E: 'a Est di', O: 'a Ovest di' };

function targetLabel(clue: Extract<Clue, { type: 'direction' }>, puzzle: Puzzle): string {
  if (clue.targetType === 'suspect') return puzzle.suspects.find((s) => s.id === clue.targetId)?.name ?? '?';
  if (clue.targetType === 'element') return puzzle.elements.find((e) => e.id === clue.targetId)?.label ?? '?';
  return `cella ${clue.targetId}`;
}

export function describeClue(clue: Clue, puzzle: Puzzle): string {
  switch (clue.type) {
    case 'direction':
      return `è ${clue.adjacent ? 'subito ' : ''}${DIRECTION_LABEL[clue.direction]} ${targetLabel(clue, puzzle)}`;
    case 'inArea':
      return `è nell'${areaLabel(clue.areaId)}`;
    case 'onElement':
      return `è sull'oggetto "${puzzle.elements.find((e) => e.id === clue.elementId)?.label ?? '?'}"`;
    case 'nearElement':
      return `è vicino all'oggetto "${puzzle.elements.find((e) => e.id === clue.elementId)?.label ?? '?'}"`;
    case 'alone':
      return 'è da solo nella sua area';
    case 'together':
      return `è insieme a ${puzzle.suspects.find((s) => s.id === clue.otherSuspectId)?.name ?? '?'}`;
  }
}
