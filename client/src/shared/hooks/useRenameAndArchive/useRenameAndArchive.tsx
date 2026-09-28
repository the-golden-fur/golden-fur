import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { RenameModal } from '../../components/RenameModal/RenameModal';

interface UseRenameAndArchiveOptions<T> {
  /** Singular, lower-case noun used in the dialog copy, e.g. "service". */
  entityLabel: string;
  getName: (item: T) => string;
  /** Resolves to an error message to show inside the Rename pop-up, or null
   * on success. The page updates its own list state here. */
  onRename: (item: T, name: string) => Promise<string | null>;
  /** Resolves to an error message, or null on success (the page removes the
   * row from its own list state here). A failure closes the dialog and is
   * handed to onArchiveError so the page can show it in its own banner. */
  onArchive: (item: T) => Promise<string | null>;
  onArchiveError?: (message: string) => void;
  /** What archiving does to this entity, shown in the confirm dialog. */
  archiveConsequence?: string;
}

interface UseRenameAndArchiveResult<T> {
  requestRename: (item: T) => void;
  requestArchive: (item: T) => void;
  /** Render once, anywhere inside the page's JSX. */
  dialogs: ReactNode;
}

/**
 * Shared Rename + Archive plumbing for the admin Config "..." menus
 * (Configure / Rename / Archive). Each page keeps its own list state and just
 * supplies what "rename" and "archive" mean for its entity; this owns which
 * row is being renamed/archived, the in-flight flag, and the two dialogs.
 */
export function useRenameAndArchive<T>({
  entityLabel,
  getName,
  onRename,
  onArchive,
  onArchiveError,
  archiveConsequence,
}: UseRenameAndArchiveOptions<T>): UseRenameAndArchiveResult<T> {
  const [renaming, setRenaming] = useState<T | null>(null);
  const [archiving, setArchiving] = useState<T | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  async function confirmArchive() {
    if (archiving === null) return;

    setIsArchiving(true);
    const error = await onArchive(archiving);
    setIsArchiving(false);
    setArchiving(null);

    if (error) onArchiveError?.(error);
  }

  const dialogs = (
    <>
      <RenameModal
        isOpen={renaming !== null}
        entityLabel={entityLabel}
        currentName={renaming !== null ? getName(renaming) : ''}
        onSubmit={(name) =>
          renaming !== null ? onRename(renaming, name) : Promise.resolve(null)
        }
        onClose={() => setRenaming(null)}
      />
      <ConfirmDialog
        isOpen={archiving !== null}
        title={`Archive ${entityLabel}?`}
        body={`"${archiving !== null ? getName(archiving) : ''}" will be archived${
          archiveConsequence ? ` - ${archiveConsequence}` : ''
        }. You can restore it from Settings > Config > Archive.`}
        confirmLabel="Archive"
        isConfirming={isArchiving}
        onConfirm={() => void confirmArchive()}
        onCancel={() => setArchiving(null)}
      />
    </>
  );

  return {
    requestRename: setRenaming,
    requestArchive: setArchiving,
    dialogs,
  };
}
