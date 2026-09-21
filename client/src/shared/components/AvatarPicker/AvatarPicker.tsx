import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { avatarFileSchema } from '../../validators/avatarFileSchema';
import { PRESET_AVATARS } from '../../config/presetAvatars';
import styles from './AvatarPicker.module.css';

interface AvatarUploadResult {
  data: { profile_photo_url: string } | null;
  error: string | null;
}

interface AvatarPickerProps {
  currentUrl: string | null;
  /** Multipart upload - staff/customer each pass their own
   * uploadAvatar(id, accessToken, file) here. */
  upload: (file: File) => Promise<AvatarUploadResult>;
  /** "Choose preset" - staff/customer each pass their own
   * setAvatarPreset(id, accessToken, presetId) here. Still a server round
   * trip (not just picking a local URL) since the server resolves the
   * preset id itself rather than trusting a client-supplied URL. */
  selectPreset: (presetId: string) => Promise<AvatarUploadResult>;
  /** Fires once either flow succeeds, with the new photo URL. */
  onChanged: (url: string) => void;
}

type ActiveTab = 'upload' | 'preset';

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

/**
 * Settings > Profile's avatar control for both roles - "Upload" (drag/drop
 * or browse, same dropzone mechanics the staff-only AvatarUploader had) and
 * "Choose preset" (a small curated gallery, PRESET_AVATARS) as two tabs
 * sharing one current-avatar preview and one error/loading state. Replaces
 * AvatarUploader, which customers never had an equivalent of.
 */
export function AvatarPicker({
  currentUrl,
  upload,
  selectPreset,
  onChanged,
}: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justChanged, setJustChanged] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setJustChanged(false);

    const parsed = avatarFileSchema.safeParse(file);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid file.');
      return;
    }

    const localPreview = safeObjectUrl(file);
    if (localPreview) {
      setPreviewUrl(localPreview);
    }
    setIsBusy(true);

    const result = await upload(file);
    setIsBusy(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Upload failed. Please try again.');
      return;
    }

    setPreviewUrl(result.data.profile_photo_url);
    setJustChanged(true);
    onChanged(result.data.profile_photo_url);
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

  const handlePresetClick = async (presetId: string, presetUrl: string) => {
    setError(null);
    setJustChanged(false);
    setPreviewUrl(presetUrl);
    setIsBusy(true);

    const result = await selectPreset(presetId);
    setIsBusy(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not set that avatar. Please try again.');
      return;
    }

    setPreviewUrl(result.data.profile_photo_url);
    setJustChanged(true);
    onChanged(result.data.profile_photo_url);
  };

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.dropzone} ${isDragOver && activeTab === 'upload' ? styles.dragover : ''}`}
        onDragOver={(event) => {
          if (activeTab !== 'upload') return;
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={activeTab === 'upload' ? handleDrop : undefined}
      >
        {previewUrl ? (
          <img
            className={`${styles.preview} ${justChanged ? 'animate-fade-in' : ''}`}
            src={previewUrl}
            alt="Your avatar"
          />
        ) : (
          <span className={styles.placeholder} aria-hidden="true">
            +
          </span>
        )}
        {isBusy ? (
          <span className={styles.spinnerOverlay} aria-label="Saving avatar">
            <span className={`${styles.spinner} animate-spin`} />
          </span>
        ) : null}
      </div>

      <div className={styles.tabList} role="tablist" aria-label="Avatar source">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'upload'}
          className={
            activeTab === 'upload'
              ? `${styles.tab} ${styles.tabActive}`
              : styles.tab
          }
          onClick={() => setActiveTab('upload')}
        >
          Upload
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'preset'}
          className={
            activeTab === 'preset'
              ? `${styles.tab} ${styles.tabActive}`
              : styles.tab
          }
          onClick={() => setActiveTab('preset')}
        >
          Choose preset
        </button>
      </div>

      {activeTab === 'upload' ? (
        <>
          <button
            type="button"
            className={styles.button}
            disabled={isBusy}
            onClick={() => inputRef.current?.click()}
          >
            {isBusy ? 'Uploading...' : 'Upload avatar'}
          </button>
          <input
            ref={inputRef}
            type="file"
            aria-label="Avatar file"
            accept="image/png,image/jpeg,image/webp"
            className={styles.hiddenInput}
            onChange={handleInputChange}
          />
        </>
      ) : (
        <div
          className={styles.presetGrid}
          role="group"
          aria-label="Preset avatars"
        >
          {PRESET_AVATARS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetButton}
              disabled={isBusy}
              aria-label={preset.label}
              aria-pressed={previewUrl === preset.url}
              onClick={() => void handlePresetClick(preset.id, preset.url)}
            >
              <img src={preset.url} alt="" className={styles.presetThumb} />
            </button>
          ))}
        </div>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
