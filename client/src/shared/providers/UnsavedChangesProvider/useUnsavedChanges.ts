import { useEffect } from 'react';
import type { UnsavedChangesSection } from './UnsavedChangesContext';
import { useUnsavedChangesContext } from './UnsavedChangesContext';

/**
 * Registers one draft (a form, or one in-progress row edit) with the
 * nearest UnsavedChangesProvider for the lifetime of the calling
 * component - re-registering whenever `isDirty`/`onSave`/`onDiscard`
 * change, so the provider's aggregate isAnyDirty stays live, and
 * unregistering on unmount. A no-op outside a provider (e.g. a Config
 * page rendered on its own standalone route, not embedded in Settings).
 */
export function useUnsavedChanges(section: UnsavedChangesSection): void {
  const context = useUnsavedChangesContext();
  const { id, label, isDirty, onSave, onDiscard } = section;
  // registerSection itself, not the whole context object - the provider
  // hands out a new `context` object every time ANY section's dirty state
  // changes anywhere in the app (its useMemo depends on `sections`), so
  // depending on `context` here would re-run this effect - and therefore
  // call registerSection again, producing another new context object -
  // every single time, an infinite render loop. registerSection is wrapped
  // in the provider's own useCallback with an empty dependency array, so
  // it's the one part of `context` that's actually stable to depend on.
  const registerSection = context?.registerSection;

  useEffect(() => {
    if (!registerSection) {
      return;
    }

    return registerSection({ id, label, isDirty, onSave, onDiscard });
  }, [registerSection, id, label, isDirty, onSave, onDiscard]);
}
