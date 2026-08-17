import { useState } from 'react';
import { PenSquare } from 'lucide-react';
import { ComposeModal } from '../ComposeModal/ComposeModal';
import styles from './ComposeEntryPoint.module.css';

interface ComposeEntryPointProps {
  accessToken: string;
  viewerRole: string | null;
  /** Controlled open state - omit for self-managed state (StaffAuthGuard's
   * usage). CustomerAuthGuard passes both so the HelpMascot's "Contact
   * support" link can open this same modal from outside the Navbar. */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * The navbar mail/compose icon - owns its own open/close state by default,
 * same shape as NotificationBell owning its dropdown's. Opens ComposeModal
 * on click; there's nothing to show closed (unlike the bell) since this is a
 * write-only action trigger, not a second inbox surface - no badge here.
 */
export function ComposeEntryPoint({
  accessToken,
  viewerRole,
  isOpen: controlledIsOpen,
  onOpenChange,
}: ComposeEntryPointProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = onOpenChange ?? setInternalIsOpen;

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="New message"
        onClick={() => setIsOpen(true)}
      >
        <PenSquare size={18} aria-hidden="true" />
      </button>
      <ComposeModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        accessToken={accessToken}
        viewerRole={viewerRole}
        onSent={() => setIsOpen(false)}
        onDraftSaved={() => setIsOpen(false)}
      />
    </>
  );
}
