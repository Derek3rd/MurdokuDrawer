import type { AreaMap } from './grid';
import { areaCustomName } from './areaLabel';
import { resolveElementType, type CellId, type Puzzle } from '../types/puzzle';

export interface ClueHighlightSets {
  positiveCellIds: Set<CellId>;
  negativeCellIds: Set<CellId>;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Poche varianti plurali italiane comuni, per far coincidere "sedia" nel testo anche con "sedie". */
function italianPluralVariants(word: string): string[] {
  if (word.endsWith('o')) return [word.slice(0, -1) + 'i'];
  if (word.endsWith('a')) return [word.slice(0, -1) + 'e'];
  if (word.endsWith('e')) return [word.slice(0, -1) + 'i'];
  return [];
}

/** Termini di ricerca da un'etichetta oggetto (es. "Cassa/Barile" -> ["cassa","casse","barile","barili"]). */
function labelSearchTerms(label: string): string[] {
  const terms: string[] = [];
  for (const rawPart of label.split('/')) {
    const part = rawPart.trim().toLowerCase();
    if (!part) continue;
    terms.push(part);
    if (!part.includes(' ')) terms.push(...italianPluralVariants(part));
  }
  return terms;
}

function termMatches(clauseLower: string, term: string): boolean {
  if (term.includes(' ')) return clauseLower.includes(term);
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(clauseLower);
}

/**
 * Analizza il testo libero di un indizio e trova le celle da evidenziare: quelle di ogni area
 * nominata (per nome assegnato dal designer nell'editor) e quelle di ogni oggetto nominato (per
 * etichetta, su tutta la mappa, non solo dentro un'eventuale area citata nello stesso testo).
 * Il testo è diviso in clausole (separate da virgola, punto o punto e virgola): una clausola che
 * contiene "non" evidenzia in negativo, invece che in positivo, i riferimenti che contiene.
 */
export function highlightsForText(text: string, puzzle: Puzzle, areas: AreaMap): ClueHighlightSets {
  const positiveCellIds = new Set<CellId>();
  const negativeCellIds = new Set<CellId>();
  if (!text.trim()) return { positiveCellIds, negativeCellIds };

  const areaEntries = areas.areaIds
    .map((areaId) => ({ areaId, name: areaCustomName(areaId, puzzle.areaNames, areas)?.trim() }))
    .filter((e): e is { areaId: string; name: string } => !!e.name);

  const elementTypeLabel = new Map<string, string>();
  for (const el of puzzle.elements) {
    if (elementTypeLabel.has(el.type)) continue;
    const label = resolveElementType(el.type, puzzle.customElementTypes)?.label;
    if (label) elementTypeLabel.set(el.type, label);
  }

  for (const clause of text.split(/[.,;]+/)) {
    const clauseLower = clause.toLowerCase();
    if (!clauseLower.trim()) continue;
    const target = /\bnon\b/i.test(clause) ? negativeCellIds : positiveCellIds;

    for (const { areaId, name } of areaEntries) {
      if (termMatches(clauseLower, name.toLowerCase())) {
        for (const c of areas.areaCells[areaId] ?? []) target.add(c);
      }
    }

    for (const [type, label] of elementTypeLabel) {
      if (labelSearchTerms(label).some((t) => termMatches(clauseLower, t))) {
        for (const el of puzzle.elements) if (el.type === type) target.add(el.cellId);
      }
    }
  }

  return { positiveCellIds, negativeCellIds };
}

/** Unisce gli insiemi trovati in più testi (es. tutti gli indizi di uno stesso sospettato). */
export function mergeHighlights(sets: ClueHighlightSets[]): ClueHighlightSets {
  const positiveCellIds = new Set<CellId>();
  const negativeCellIds = new Set<CellId>();
  for (const s of sets) {
    for (const c of s.positiveCellIds) positiveCellIds.add(c);
    for (const c of s.negativeCellIds) negativeCellIds.add(c);
  }
  return { positiveCellIds, negativeCellIds };
}
