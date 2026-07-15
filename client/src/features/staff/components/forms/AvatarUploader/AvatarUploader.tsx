import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { uploadAvatar } from '../../../api/staff.api';
import { avatarFileSchema } from '../../../modules/validators/staff.validator';
import styles from './AvatarUploader.module.css';

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

interface AvatarUploaderProps {
  staffId: string;
  accessToken: string;
  currentAvatarUrl: string | null;
  onUploaded: (url: string) => void;
}

export function AvatarUploader({
  staffId,
  accessToken,
  currentAvatarUrl,
  onUploaded,
}: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justUploaded, setJustUploaded] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setJustUploaded(false);

    const parsed = avatarFileSchema.safeParse(file);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid file.');
      return;
    }

    const localPreview = safeObjectUrl(file);
    if (localPreview) {
      setPreviewUrl(localPreview);
    }
    setIsUploading(true);

    const result = await uploadAvatar(staffId, accessToken, file);
    setIsUploading(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Upload failed. Please try again.');
      return;
    }

    setPreviewUrl(result.data.profile_photo_url);
    setJustUploaded(true);
    onUploaded(result.data.profile_photo_url);
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
          <img
            className={`${styles.preview} ${justUploaded ? 'animate-fade-in' : ''}`}
            src={previewUrl}
            alt="Your avatar"
          />
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
      <button
        type="button"
        className={styles.button}
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? 'Uploading...' : 'Upload avatar'}
      </button>
      <input
        ref={inputRef}
        type="file"
        aria-label="Avatar file"
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
