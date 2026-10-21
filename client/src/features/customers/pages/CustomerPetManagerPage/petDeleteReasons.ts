import type { PetDeleteReason } from '../../customer.types';

/** Choices in Pet Manager's delete dialog, in display order. 'other' asks
 * for the customer's own text. */
export const PET_DELETE_REASONS: { value: PetDeleteReason; label: string }[] = [
  { value: 'passed_away', label: 'Passed away' },
  { value: 'rehomed', label: 'Rehomed / given away' },
  { value: 'duplicate', label: 'Added by mistake / duplicate' },
  { value: 'no_longer_using_clinic', label: 'No longer using the clinic' },
  { value: 'other', label: 'Other' },
];

export const PET_DELETE_REASON_OTHER_MAX_LENGTH = 200;
