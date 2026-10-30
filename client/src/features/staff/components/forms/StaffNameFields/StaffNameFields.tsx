import { useId } from 'react';
import {
  staffDisplayName,
  type StaffNameValues,
} from '../../../utils/staffName';

interface StaffNameFieldsProps {
  value: StaffNameValues;
  onChange: (value: StaffNameValues) => void;
  /** Styling hooks so this drops into each host form's own field layout. */
  fieldClassName: string;
  labelClassName: string;
  inputClassName: string;
  hintClassName?: string;
}

/**
 * Staff names (20261030290): First / Middle / Last (the legal name) plus an
 * optional Nickname, with a live "Shown as" line - the nickname if set, else
 * "First Last", the same rule the database uses for display_name. Shared by
 * Create staff account and Manage account.
 */
export function StaffNameFields({
  value,
  onChange,
  fieldClassName,
  labelClassName,
  inputClassName,
  hintClassName,
}: StaffNameFieldsProps) {
  const set = (key: keyof StaffNameValues) => (text: string) =>
    onChange({ ...value, [key]: text });
  const shownAs = staffDisplayName(value);
  const hintId = useId();

  return (
    <>
      <label className={fieldClassName}>
        <span className={labelClassName}>First name</span>
        <input
          className={inputClassName}
          value={value.first_name}
          autoComplete="off"
          aria-required="true"
          onChange={(event) => set('first_name')(event.target.value)}
        />
      </label>
      <label className={fieldClassName}>
        <span className={labelClassName}>Middle name (optional)</span>
        <input
          className={inputClassName}
          value={value.middle_name}
          autoComplete="off"
          onChange={(event) => set('middle_name')(event.target.value)}
        />
      </label>
      <label className={fieldClassName}>
        <span className={labelClassName}>Last name</span>
        <input
          className={inputClassName}
          value={value.last_name}
          autoComplete="off"
          aria-required="true"
          onChange={(event) => set('last_name')(event.target.value)}
        />
      </label>
      <div className={fieldClassName}>
        <label className={fieldClassName}>
          <span className={labelClassName}>Nickname (optional)</span>
          <input
            className={inputClassName}
            value={value.nickname}
            autoComplete="off"
            aria-describedby={hintId}
            onChange={(event) => set('nickname')(event.target.value)}
          />
        </label>
        <span className={hintClassName} id={hintId}>
          Shown around the app instead of their full name.
          {shownAs ? ` Shown as: ${shownAs}` : ''}
        </span>
      </div>
    </>
  );
}
