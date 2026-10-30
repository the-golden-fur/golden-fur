import makatiImage from '../../../assets/makatigodenfur.jpg';
import southwoodsImage from '../../../assets/southwodosgoldenfur.jpg';
import fallbackImage from '../../../assets/goldenfurbg.jpg';

/**
 * The photo shown on a branch's card in the booking flow's Branch step.
 * Matched on the branch name (case-insensitive) since branches are
 * admin-managed rows with no image column. A branch added later without its
 * own photo gets the general Golden Fur photo, so every card keeps the same
 * image-on-top layout.
 */
export function branchImageFor(branchName: string): string {
  const name = branchName.toLowerCase();

  if (name.includes('makati')) return makatiImage;
  if (name.includes('southwoods')) return southwoodsImage;
  return fallbackImage;
}
