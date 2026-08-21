export function areaLabel(areaId: string): string {
  const n = areaId.split('-')[1];
  return `Area ${n}`;
}
