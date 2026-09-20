import { createContext, useContext } from 'react';

export interface UnsavedChangesSection {
  /** Stable id for this draft - e.g. 'profile', or `cage-edit-${cageId}` for
   * a page that only ever has one row mid-edit at a time. Registering again
   * with the same id replaces the previous registration (see
   * useUnsavedChanges). */
  id: string;
  /** Shown in the bottom bar and the leave-confirmation dialog, e.g.
   * "Profile" or "Cage: Kennel 3". */
  label: string;
  isDirty: boolean;
  /** Must throw/reject on failure - the provider keeps the section
   * registered as dirty and surfaces the error rather than assuming success. */
  onSave: () => Promise<void>;
  onDiscard: () => void;
}

export interface UnsavedChangesContextValue {
  /** Registers or replaces a section by id. Returns an unregister function -
   * call it (or let useUnsavedChanges's cleanup call it) when the section
   * unmounts or stops being relevant. */
  registerSection: (section: UnsavedChangesSection) => () => void;
  dirtySections: UnsavedChangesSection[];
  isAnyDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  saveAll: () => Promise<void>;
  discardAll: () => void;
  /** Runs `action` immediately if nothing is dirty. Otherwise opens the
   * "You have unsaved changes" confirmation and runs `action` only after
   * the user picks Discard, or after Save succeeds - never on Cancel. Used
   * for Settings' own tab/tile switching and for guardedNavigate. */
  guardIfDirty: (action: () => void) => void;
}

export const UnsavedChangesContext =
  createContext<UnsavedChangesContextValue | null>(null);

/**
 * Non-throwing accessor - returns null outside a provider (Settings mounts
 * one for the duration it's open; nothing else in the app does), so callers
 * like Navbar can no-op when there's nothing to guard instead of every
 * caller needing to know whether it's currently inside Settings.
 */
export function useUnsavedChangesContext(): UnsavedChangesContextValue | null {
  return useContext(UnsavedChangesContext);
}
