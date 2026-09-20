import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal } from '../../components/Modal/Modal';
import {
  UnsavedChangesContext,
  type UnsavedChangesContextValue,
  type UnsavedChangesSection,
} from './UnsavedChangesContext';
import styles from './UnsavedChangesProvider.module.css';

interface UnsavedChangesProviderProps {
  children: ReactNode;
}

/**
 * Mounted once by SettingsPage, for the duration it's open. Any descendant
 * can call useUnsavedChanges to register a draft (a form, or one
 * in-progress row edit); while at least one is dirty, this renders a
 * Discord-style bottom bar (Save changes / Discard) and warns on an actual
 * browser tab close/refresh. guardIfDirty - used by SettingsPage's own
 * tab/tile switching and by useGuardedNavigate - opens a blocking
 * confirmation (Save / Discard / Cancel) before letting the caller's
 * action through.
 *
 * Scope: Settings-embedded forms/pages only. A Config page reached via its
 * own standalone route (outside Settings) has no provider in its tree, so
 * useUnsavedChanges silently no-ops there - this session's ask was "when
 * editing things in Settings page," not every route in the app.
 *
 * In-app browser back/forward (popstate) isn't guarded - the app doesn't
 * use a data router (see App.tsx), so there's no clean hook for it here;
 * the known workaround (push a dummy history entry while dirty, intercept
 * popstate, re-push on cancel) is a deliberate v1 gap, not an oversight.
 */
export function UnsavedChangesProvider({
  children,
}: UnsavedChangesProviderProps) {
  const [sections, setSections] = useState<Map<string, UnsavedChangesSection>>(
    new Map()
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const registerSection = useCallback((section: UnsavedChangesSection) => {
    setSections((prev) => {
      const next = new Map(prev);
      next.set(section.id, section);
      return next;
    });

    return () => {
      setSections((prev) => {
        if (!prev.has(section.id)) {
          return prev;
        }
        const next = new Map(prev);
        next.delete(section.id);
        return next;
      });
    };
  }, []);

  const dirtySections = useMemo(
    () => Array.from(sections.values()).filter((section) => section.isDirty),
    [sections]
  );
  const isAnyDirty = dirtySections.length > 0;

  const saveAll = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      for (const section of dirtySections) {
        await section.onSave();
      }
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Could not save changes.'
      );
      setIsSaving(false);
      throw error;
    }

    setIsSaving(false);
  }, [dirtySections]);

  const discardAll = useCallback(() => {
    setSaveError(null);
    for (const section of dirtySections) {
      section.onDiscard();
    }
  }, [dirtySections]);

  const guardIfDirty = useCallback(
    (action: () => void) => {
      if (!isAnyDirty) {
        action();
        return;
      }

      pendingActionRef.current = action;
      setIsConfirmOpen(true);
    },
    [isAnyDirty]
  );

  const runPendingAction = () => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setIsConfirmOpen(false);
    action?.();
  };

  const handleConfirmSave = async () => {
    try {
      await saveAll();
    } catch {
      return; // stays open, saveError is shown - don't run the pending action
    }
    runPendingAction();
  };

  const handleConfirmDiscard = () => {
    discardAll();
    runPendingAction();
  };

  const handleCancel = () => {
    pendingActionRef.current = null;
    setIsConfirmOpen(false);
    setSaveError(null);
  };

  // Real browser tab close/refresh - the only text browsers still allow is
  // their own generic "leave site?" prompt, triggered by preventDefault.
  useEffect(() => {
    if (!isAnyDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnyDirty]);

  const value: UnsavedChangesContextValue = useMemo(
    () => ({
      registerSection,
      dirtySections,
      isAnyDirty,
      isSaving,
      saveError,
      saveAll,
      discardAll,
      guardIfDirty,
    }),
    [
      registerSection,
      dirtySections,
      isAnyDirty,
      isSaving,
      saveError,
      saveAll,
      discardAll,
      guardIfDirty,
    ]
  );

  const handleBarSave = () => {
    void saveAll().catch(() => {
      // saveError is already set and shown in the bar - nothing else to do.
    });
  };

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      {isAnyDirty ? (
        <div className={styles.bar} role="status">
          <span className={styles.message}>
            You have unsaved changes
            {dirtySections.length > 1
              ? ` (${dirtySections.length} sections)`
              : null}
          </span>
          {saveError ? (
            <span className={styles.error} role="alert">
              {saveError}
            </span>
          ) : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.discardButton}
              onClick={discardAll}
              disabled={isSaving}
            >
              Discard
            </button>
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleBarSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : null}
      <Modal
        isOpen={isConfirmOpen}
        title="You have unsaved changes"
        onClose={handleCancel}
        closeOnBackdropClick={false}
      >
        <div className={styles.confirmBody}>
          <p className={styles.confirmCopy}>
            {dirtySections.length === 1
              ? `Save or discard your changes to ${dirtySections[0].label} before continuing.`
              : `Save or discard your changes (${dirtySections.map((s) => s.label).join(', ')}) before continuing.`}
          </p>
          {saveError ? (
            <p className={styles.error} role="alert">
              {saveError}
            </p>
          ) : null}
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.discardButton}
              onClick={handleConfirmDiscard}
              disabled={isSaving}
            >
              Discard
            </button>
            <button
              type="button"
              className={styles.saveButton}
              onClick={() => void handleConfirmSave()}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </Modal>
    </UnsavedChangesContext.Provider>
  );
}
