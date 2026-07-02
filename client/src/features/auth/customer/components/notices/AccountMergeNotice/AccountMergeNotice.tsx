import styles from './AccountMergeNotice.module.css';

interface AccountMergeNoticeProps {
  message?: string;
}

export function AccountMergeNotice({
  message = 'Your account was linked successfully.',
}: AccountMergeNoticeProps) {
  return (
    <p className={styles.notice} role="status">
      {message}
    </p>
  );
}
