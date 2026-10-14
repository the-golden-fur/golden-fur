import {
  COAT_TYPES,
  WEIGHT_CLASSES,
  type CoatType,
  type PricingCell,
  type WeightClass,
} from '../../../maintenance/maintenance.types';
import { matrixPriceFor } from '../../utils/petMatrixPrice';
import styles from './PriceMatrixTable.module.css';

const WEIGHT_CLASS_LABEL: Record<WeightClass, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'XL',
};

const COAT_TYPE_LABEL: Record<CoatType, string> = {
  SC: 'Short coat',
  LC: 'Long coat',
  XLC: 'Extra long coat',
};

interface PriceMatrixTableProps {
  /** The item's weight x coat cells (service_pricing_tiers / pricing_tiers). */
  cells: PricingCell[] | undefined;
  /** What a cell with no price of its own costs - the item's base_price /
   * bundled_price, the same fallback the booking itself uses. */
  fallbackPrice: number;
  /** Optional Extra Long Coat (20261014265): the item's has_extra_long_coat
   * - false leaves the Extra long column out, so a customer only ever sees
   * an XLC price a Superadmin switched on. */
  showExtraLongCoat: boolean;
}

/**
 * Read-only table of every weight x coat price of a Grooming service or
 * package - shown on the Services step for a pet that hasn't been assessed
 * yet, so the customer can see what each size/coat would cost before staff
 * record their pet's.
 */
export function PriceMatrixTable({
  cells,
  fallbackPrice,
  showExtraLongCoat,
}: PriceMatrixTableProps) {
  const coatTypes = showExtraLongCoat
    ? COAT_TYPES
    : COAT_TYPES.filter((coat) => coat !== 'XLC');

  return (
    <table className={styles.table}>
      <caption className={styles.caption}>Prices in PHP</caption>
      <thead>
        <tr>
          <th scope="col">
            <span className={styles.visuallyHidden}>Size</span>
          </th>
          {coatTypes.map((coat) => (
            <th key={coat} scope="col" title={COAT_TYPE_LABEL[coat]}>
              {COAT_TYPE_LABEL[coat].replace(' coat', '')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {WEIGHT_CLASSES.map((weight) => (
          <tr key={weight}>
            <th scope="row" title={WEIGHT_CLASS_LABEL[weight]}>
              {WEIGHT_CLASS_LABEL[weight]}
            </th>
            {coatTypes.map((coat) => (
              <td key={coat}>
                {matrixPriceFor(cells, weight, coat, fallbackPrice).toFixed(2)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
