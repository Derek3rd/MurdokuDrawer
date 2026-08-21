import type { AreaMap } from './grid';
import type { AreaName } from '../types/puzzle';

export function areaLabel(areaId: string): string {
  const n = areaId.split('-')[1];
  return `Area ${n}`;
}

/** Nome personalizzato dell'area, se assegnato dal designer, altrimenti undefined. */
export function areaCustomName(areaId: string, areaNames: AreaName[], areas: AreaMap): string | undefined {
  return areaNames.find((a) => areas.cellArea[a.cellId] === areaId)?.name;
}

/** Nome da mostrare per l'area: quello personalizzato se presente, altrimenti "Area N". */
export function areaDisplayName(areaId: string, areaNames: AreaName[], areas: AreaMap): string {
  return areaCustomName(areaId, areaNames, areas) ?? areaLabel(areaId);
}
