/**
 * Custom change (optional Extra Long Coat, 20261014265): a service or
 * package only has Extra Long Coat (XLC) prices once a Superadmin switches
 * has_extra_long_coat on. These two helpers are the whole rule.
 */

interface CoatCell {
  weight_class: string;
  coat_type: string;
}

/** An item's cells as the API sends them: without its XLC cells when it has
 * no XLC prices, so no screen can show one. Any Superadmin-set XLC price
 * stays in the database for when the switch goes back on. */
export function dropExtraLongCoat<T extends CoatCell>(
  cells: T[],
  hasExtraLongCoat: boolean
): T[] {
  return hasExtraLongCoat
    ? cells
    : cells.filter((cell) => cell.coat_type !== 'XLC');
}

/** The cell a pet is charged: its own weight x coat cell, or - for an XLC
 * pet on an item with no XLC prices - the Long Coat cell for its size.
 * Undefined when neither exists (the caller falls back to the flat price). */
export function findPetCell<T extends CoatCell>(
  cells: T[] | null | undefined,
  pet: { weight_class: string | null; coat_type: string | null }
): T | undefined {
  if (!pet.weight_class || !pet.coat_type) return undefined;

  const find = (coatType: string) =>
    (cells ?? []).find(
      (cell) =>
        cell.weight_class === pet.weight_class && cell.coat_type === coatType
    );

  return (
    find(pet.coat_type) ?? (pet.coat_type === 'XLC' ? find('LC') : undefined)
  );
}
