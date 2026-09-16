import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import styles from './ImageUploader.module.css';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

// jsdom (used in tests) doesn't implement createObjectURL - fall back to no
// local preview there instead of throwing; the real upload result still sets
// the final preview.
function safeObjectUrl(file: File): string | null {
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

interface ImageUploadResult {
  data: { image_url: string } | null;
  error: string | null;
}

interface ImageUploaderProps {
  currentImageUrl: string | null;
  /** Performs the actual upload (e.g. uploadServiceImage from
   * maintenance.api.ts) - kept generic so this component doesn't need to
   * know which entity/endpoint it's attached to, unlike the staff-specific
   * AvatarUploader it's modeled on. */
  uploadFn: (file: File) => Promise<ImageUploadResult>;
  onUploaded: (url: string) => void;
  onRemove?: () => void;
  alt?: string;
}

/**
 * Generic "drag an image in, see a preview, watch it upload" control
 * (Architectural-Change-History: "choose icon/image attachment" for a
 * service/package). Generalizes staff/components/forms/AvatarUploader's
 * dropzone/preview/progress UX so services/packages/service types don't
 * each need their own near-duplicate uploader.
 */
export function ImageUploader({
  currentImageUrl,
  uploadFn,
  onUploaded,
  onRemove,
  alt = 'Preview',
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
      setError('Unsupported file type. Use PNG, JPEG, or WEBP.');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError('File too large. Maximum size is 5MB.');
      return;
    }

    const localPreview = safeObjectUrl(file);
    if (localPreview) {
      setPreviewUrl(localPreview);
    }
    setIsUploading(true);

    const result = await uploadFn(file);
    setIsUploading(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Upload failed. Please try again.');
      return;
    }

    setPreviewUrl(result.data.image_url);
    onUploaded(result.data.image_url);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      void handleFile(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    setError(null);
    onRemove?.();
  };

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.dropzone} ${isDragOver ? styles.dragover : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {previewUrl ? (
          <img className={styles.preview} src={previewUrl} alt={alt} />
        ) : (
          <span className={styles.placeholder} aria-hidden="true">
            +
          </span>
        )}
        {isUploading ? (
          <span className={styles.spinnerOverlay} aria-label="Uploading">
            <span className={`${styles.spinner} animate-spin`} />
          </span>
        ) : null}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading
            ? 'Uploading...'
            : previewUrl
              ? 'Replace image'
              : 'Upload image'}
        </button>
        {previewUrl && onRemove ? (
          <button
            type="button"
            className={styles.removeButton}
            disabled={isUploading}
            onClick={handleRemove}
          >
            Remove
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        aria-label="Image file"
        accept="image/png,image/jpeg,image/webp"
        className={styles.hiddenInput}
        onChange={handleInputChange}
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
