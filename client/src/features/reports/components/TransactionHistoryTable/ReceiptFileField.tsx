import { useEffect, useId, useMemo, useRef } from 'react';
import { FileText, Plus, X } from 'lucide-react';
import { RECEIPT_ACCEPTED_TYPES } from './receiptFile';
import styles from './TransactionHistoryTable.module.css';

interface ReceiptFileFieldProps {
  file: File | null;
  onChange: (file: File | null) => void;
  /** Shown under the label - e.g. the "recommended for non-cash" nudge. */
  hint?: string;
  label?: string;
}

/**
 * Custom change (payment receipts): the receipt picker used by "Mark as paid"
 * and "Upload receipt" on the Transactions page - a photo, screenshot or PDF
 * of the payment, kept as proof (mainly for GCash, Maya, Card and Bank
 * Transfer payments).
 *
 * The browser's own "Choose file" control is replaced by a dashed "+ Add
 * image" tile. The real file input stays inside it (visually hidden, still
 * focusable), so keyboard users tab to the tile and press Enter/Space as
 * usual. Once a file is chosen the tile becomes a thumbnail (or a PDF tile)
 * with a small remove button.
 */
export function ReceiptFileField({
  file,
  onChange,
  hint,
  label = 'Receipt (optional)',
}: ReceiptFileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const isImage = Boolean(file?.type.startsWith('image/'));
  // jsdom (tests) has no createObjectURL - the tile then just shows the name.
  const previewUrl = useMemo(
    () =>
      file && isImage && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : null,
    [file, isImage]
  );

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const clear = () => {
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={styles.field}>
      <span>{label}</span>

      {file ? (
        <div className={styles.receiptPreview}>
          <div className={styles.receiptTile}>
            {previewUrl ? (
              <img
                className={styles.receiptThumb}
                src={previewUrl}
                alt={`Receipt preview: ${file.name}`}
              />
            ) : (
              <FileText aria-hidden="true" size={28} />
            )}
            <button
              type="button"
              className={styles.receiptRemove}
              aria-label="Remove receipt"
              onClick={clear}
            >
              <X aria-hidden="true" size={14} />
            </button>
          </div>
          <span className={styles.receiptName}>{file.name}</span>
        </div>
      ) : (
        <label className={`${styles.receiptTile} ${styles.receiptAdd}`}>
          <input
            ref={inputRef}
            className={styles.visuallyHidden}
            type="file"
            accept={RECEIPT_ACCEPTED_TYPES.join(',')}
            aria-label={label}
            aria-describedby={hintId}
            onChange={(event) => onChange(event.target.files?.[0] ?? null)}
          />
          <Plus aria-hidden="true" size={22} />
          <span className={styles.receiptAddText}>Add image</span>
        </label>
      )}

      <p className={styles.copy} id={hintId}>
        {hint ? `${hint} ` : ''}PNG, JPG, WEBP or PDF, up to 5 MB.
      </p>
    </div>
  );
}
