/**
 * Cage size vs pet size (pets.weight_class) comparison, shared by every
 * screen where staff can pick a specific cage (Hotel/Daycare check-in, the
 * walk-in booking cage picker). A size mismatch is a soft rule - staff may
 * still knowingly use a different-size cage (e.g. the pet's own size is
 * full) - so this only drives a warning, never a block.
 */
const SIZE_ORDER = ['S', 'M', 'L', 'XL'];

export type CageSizeFit = 'match' | 'too_small' | 'too_large' | 'unknown';

export type CageSizeMismatch = Extract<CageSizeFit, 'too_small' | 'too_large'>;

export const CAGE_SIZE_MISMATCH_LABEL: Record<CageSizeMismatch, string> = {
  too_small: 'Too small',
  too_large: 'Too large',
};

/** 'unknown' when either size is missing/unrecognised (e.g. a pet with no
 * weight class yet) - callers show no warning for it. */
export function getCageSizeFit(
  petSize: string | null | undefined,
  cageSize: string | null | undefined
): CageSizeFit {
  const petIndex = SIZE_ORDER.indexOf(petSize ?? '');
  const cageIndex = SIZE_ORDER.indexOf(cageSize ?? '');

  if (petIndex === -1 || cageIndex === -1) return 'unknown';
  if (cageIndex < petIndex) return 'too_small';
  if (cageIndex > petIndex) return 'too_large';
  return 'match';
}

export function isCageSizeMismatch(fit: CageSizeFit): fit is CageSizeMismatch {
  return fit === 'too_small' || fit === 'too_large';
}

export function describeCageSizeMismatch(
  fit: CageSizeMismatch,
  petSize: string,
  cageLabel: string,
  cageSize: string
): string {
  const reason =
    fit === 'too_small'
      ? 'The cage is too small for this pet.'
      : 'The cage is larger than this pet needs.';

  return `Cage ${cageLabel} is size ${cageSize}, but this pet is size ${petSize}. ${reason}`;
}
