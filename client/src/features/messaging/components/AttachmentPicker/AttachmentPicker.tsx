import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { uploadAttachment } from '../../api/messaging.api';
import type { PendingAttachment } from '../../messaging.types';
import styles from './AttachmentPicker.module.css';

interface AttachmentPickerProps {
  accessToken: string;
  attachments: PendingAttachment[];
  onChange: (attachments: PendingAttachment[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Attaches files to a Mail/Announcement message or a thread reply. Each
 * selected file uploads immediately (POST /messages/attachments, returning
 * a plain descriptor - no message exists yet at this point) and appears as
 * a chip; the compose/reply call sends the accumulated descriptors along
 * with the message body, which is what actually links them to a message
 * row server-side.
 */
export function AttachmentPicker({
  accessToken,
  attachments,
  onChange,
}: AttachmentPickerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    const uploaded: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      const result = await uploadAttachment(file, accessToken);
      if (result.data) {
        uploaded.push(result.data);
      } else if (result.error) {
        setError(result.error);
      }
    }

    setIsUploading(false);
    if (uploaded.length > 0) {
      onChange([...attachments, ...uploaded]);
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeAttachment(fileUrl: string) {
    onChange(attachments.filter((attachment) => attachment.fileUrl !== fileUrl));
  }

  return (
    <div className={styles.wrapper}>
      <input
        ref={inputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        onChange={(event) => void handleFilesSelected(event.target.files)}
      />
      <button
        type="button"
        className={styles.attachButton}
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={14} aria-hidden="true" />
        {isUploading ? 'Uploading...' : 'Attach files'}
      </button>

      {error ? (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      ) : null}

      {attachments.length > 0 ? (
        <ul className={styles.chips}>
          {attachments.map((attachment) => (
            <li key={attachment.fileUrl} className={styles.chip}>
              <span className={styles.chipName}>{attachment.fileName}</span>
              <span className={styles.chipSize}>{formatFileSize(attachment.fileSize)}</span>
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Remove ${attachment.fileName}`}
                onClick={() => removeAttachment(attachment.fileUrl)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
