import type {
  CoatType,
  PricingCell,
  PricingCellsPayload,
  WeightClass,
} from '../../maintenance.types';

/** `${weight}:${coat}`, e.g. "L:LC" - one of the 8 grid cells. */
export type CellKey = `${WeightClass}:${CoatType}`;

export function cellKey(weightClass: WeightClass, coatType: CoatType): CellKey {
  return `${weightClass}:${coatType}`;
}

/** A Superadmin's typed-in cell prices while editing, as strings straight
 * from the inputs. A missing key follows the shared formula. */
export type CellDrafts = Partial<Record<CellKey, string>>;

/** The item's saved custom cells as editor drafts. */
export function draftsFromCells(
  cells: PricingCell[] | null | undefined
): CellDrafts {
  const drafts: CellDrafts = {};

  for (const cell of cells ?? []) {
    if (cell.is_custom) {
      drafts[cellKey(cell.weight_class, cell.coat_type)] = String(cell.price);
    }
  }

  return drafts;
}

/**
 * What to send so the saved cells match the drafts: every changed or new
 * custom cell with its price, and null for each saved custom cell that was
 * put back on the formula. `cells` is empty when nothing changed; `error` is
 * set (and nothing should be saved) when a typed price isn't a valid amount.
 */
export function pricingCellsChanges(
  saved: CellDrafts,
  drafts: CellDrafts
): { cells: PricingCellsPayload['cells']; error: string | null } {
  const cells: PricingCellsPayload['cells'] = [];
  const keys = new Set([
    ...(Object.keys(saved) as CellKey[]),
    ...(Object.keys(drafts) as CellKey[]),
  ]);

  for (const key of keys) {
    const [weightClass, coatType] = key.split(':') as [WeightClass, CoatType];
    const draft = drafts[key]?.trim();

    if (draft === undefined || draft === '') {
      if (saved[key] !== undefined) {
        cells.push({
          weight_class: weightClass,
          coat_type: coatType,
          price: null,
        });
      }
      continue;
    }

    const price = Number(draft);
    if (!Number.isFinite(price) || price < 0) {
      const coat = coatType === 'SC' ? 'short' : 'long';
      return {
        cells: [],
        error: `Enter a valid price (0 or more) for ${weightClass}, ${coat} coat.`,
      };
    }

    if (saved[key] === undefined || Number(saved[key]) !== price) {
      cells.push({ weight_class: weightClass, coat_type: coatType, price });
    }
  }

  return { cells, error: null };
}
