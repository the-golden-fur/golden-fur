import styles from './SessionExpiryModal.module.css';

interface SessionExpiryModalProps {
  isOpen: boolean;
  remainingMs: number;
  onStaySignedIn: () => void;
}

function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(Math.ceil(remainingMs / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function SessionExpiryModal({
  isOpen,
  remainingMs,
  onStaySignedIn,
}: SessionExpiryModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      aria-label="Session expiry warning"
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expiry-title"
      >
        <p className={styles.eyebrow}>Session timeout</p>
        <h2 id="session-expiry-title" className={styles.title}>
          Your staff session is about to expire
        </h2>
        <p className={styles.copy}>
          You will be signed out in {formatRemainingTime(remainingMs)} unless
          you stay signed in.
        </p>
        <button
          className={styles.action}
          type="button"
          onClick={onStaySignedIn}
        >
          Stay signed in
        </button>
      </section>
    </div>
  );
}
