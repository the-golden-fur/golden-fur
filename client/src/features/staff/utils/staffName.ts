/** The parts of a staff member's name (staff names, 20261030290). */
export interface StaffNameParts {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
}

const clean = (value: string | null | undefined) => value?.trim() ?? '';

/**
 * The name shown around the app: the nickname, else "First Last". Mirrors
 * the database trigger staff_profiles_sync_display_name, which is what
 * actually sets display_name - this copy only powers the live "Shown as"
 * preview in the staff name forms. Empty when neither is filled in yet.
 */
export function staffDisplayName(parts: StaffNameParts): string {
  const nickname = clean(parts.nickname);
  if (nickname) return nickname;

  const first = clean(parts.first_name);
  const last = clean(parts.last_name);
  return first && last ? `${first} ${last}` : '';
}

/** "First Middle Last", or null when no legal name is recorded (staff
 * created before names were split). */
export function staffLegalName(parts: StaffNameParts): string | null {
  const full = [parts.first_name, parts.middle_name, parts.last_name]
    .map(clean)
    .filter(Boolean)
    .join(' ');
  return full || null;
}

/** The editable form of a staff name (the staff name form fields). */
export interface StaffNameValues {
  first_name: string;
  middle_name: string;
  last_name: string;
  nickname: string;
}

export const EMPTY_STAFF_NAME: StaffNameValues = {
  first_name: '',
  middle_name: '',
  last_name: '',
  nickname: '',
};
