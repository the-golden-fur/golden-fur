import type { DateRangePreset } from '../QueueFilterBar/dateRangePreset';

/** The value stored on a `date-range` filter tile. `from`/`to` are only
 * meaningful for the 'custom' preset (either side may stay null = open-ended);
 * for every other preset they're derived from the preset at query time. */
export interface DateRangeValue {
  preset: DateRangePreset;
  from: string | null;
  to: string | null;
}

/** The value stored on a `number-range` filter tile. Either bound may stay
 * null = open-ended (e.g. only a max price set). */
export interface NumberRangeValue {
  min: number | null;
  max: number | null;
}

/** What a single filter tile holds. A plain string for single-select fields,
 * a `string[]` for {@link MultiSelectFilterField}, a {@link DateRangeValue}
 * for a date-range field, or a {@link NumberRangeValue} for a number-range
 * field. */
export type FilterValue =
  | string
  | string[]
  | DateRangeValue
  | NumberRangeValue
  | null;

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterFieldBase {
  /** Stable key - also the tile key; a field can only be added once. */
  id: string;
  label: string;
  /** Rendered greyed-out (and unselectable) in the "Filter" menu - e.g. Pet
   * before a Customer is chosen. */
  disabled?: boolean;
  /** The value a freshly-added tile starts at. */
  defaultValue: FilterValue;
  /** Text shown after "{label}: " on the tile pill. */
  formatValue: (value: FilterValue) => string;
}

export interface SelectFilterField extends FilterFieldBase {
  /** 'async-select' adds a type-to-filter box above the option list (for a
   * long, page-supplied option list like Customers). */
  type: 'select' | 'async-select';
  options: FilterOption[];
}

/** Same option list as {@link SelectFilterField}, but a tile of this type
 * holds a `string[]` and its popover stays open while multiple options are
 * toggled - for genuinely multi-valued fields (e.g. a cage's supported pet
 * types) where forcing a single choice would hide real matches. */
export interface MultiSelectFilterField extends FilterFieldBase {
  type: 'multi-select';
  options: FilterOption[];
}

export interface DateRangeFilterField extends FilterFieldBase {
  type: 'date-range';
}

/** A "between X and Y" numeric filter (e.g. price range). Either bound may
 * be left blank. */
export interface NumberRangeFilterField extends FilterFieldBase {
  type: 'number-range';
  /** Labels for the two inputs. Default to "Min"/"Max". */
  minLabel?: string;
  maxLabel?: string;
}

export type FilterField =
  | SelectFilterField
  | MultiSelectFilterField
  | DateRangeFilterField
  | NumberRangeFilterField;

export interface FilterTile {
  fieldId: string;
  value: FilterValue;
}

export interface SortDirectionOption {
  value: string;
  label: string;
}

export interface SortFieldDescriptor {
  id: string;
  label: string;
  /** First entry is the default direction when this field is picked. */
  directions: SortDirectionOption[];
}

export interface SortTile {
  fieldId: string;
  direction: string;
}
