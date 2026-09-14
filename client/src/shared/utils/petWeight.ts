import type { WeightUnitPreference } from '../providers/ThemeProvider/themeContext';

/**
 * Pet weight is always stored canonically in kilograms (pets.weight_kg).
 * These helpers convert to/from the unit a user chose to see
 * (Architectural-Change-History) and to the unit staff typed a value in.
 * Display rounds to 1 dp; anything written back to the API is rounded to 2 dp
 * (the column's precision) so a kg -> lbs -> kg round-trip through an edit
 * form doesn't drift the stored value or flip a weight class near a cut-off.
 */
export const KG_PER_LB = 0.45359237;

export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

export function kgToLbs(kg: number): number {
  return kg / KG_PER_LB;
}

function round(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

/** kg value from the canonical store -> the number to show in `unit`, 1 dp. */
export function toDisplayValue(kg: number, unit: WeightUnitPreference): number {
  return round(unit === 'lbs' ? kgToLbs(kg) : kg, 1);
}

/** A number a user typed in `entryUnit` -> canonical kg, 2 dp. */
export function toCanonicalKg(
  value: number,
  entryUnit: WeightUnitPreference
): number {
  return round(entryUnit === 'lbs' ? lbsToKg(value) : value, 2);
}

/** Canonical kg -> a labelled string in the viewer's unit, e.g. "20.4 kg" /
 * "45.0 lb". */
export function formatWeight(kg: number, unit: WeightUnitPreference): string {
  const value = toDisplayValue(kg, unit);
  return `${value.toFixed(1)} ${unit === 'lbs' ? 'lb' : 'kg'}`;
}

/** The short label for a unit, for input suffixes / toggle buttons. */
export function weightUnitLabel(unit: WeightUnitPreference): string {
  return unit === 'lbs' ? 'lb' : 'kg';
}
