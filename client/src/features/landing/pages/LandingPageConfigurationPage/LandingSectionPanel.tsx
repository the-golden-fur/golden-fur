import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { DEFAULT_LANDING_IMAGES } from '../../landing.content';
import { LANDING_TEXT_MAX_LENGTH } from '../../landing.types';
import type {
  LandingEditorField,
  LandingEditorSection,
} from './landingEditor.config';
import styles from './LandingPageConfigurationPage.module.css';

interface LandingSectionPanelProps {
  section: LandingEditorSection;
  /** Saved value of every slot - text, or an uploaded image URL / null. */
  values: Record<string, string | null>;
  /** undefined for a section that is always shown (the footer). */
  isVisible: boolean | undefined;
  isBusy: boolean;
  onSaveText: (updates: Array<{ key: string; value: string }>) => Promise<boolean>;
  onToggleVisible: (isVisible: boolean) => void;
  onUploadImage: (key: string, file: File) => void;
  onResetImage: (key: string) => void;
  /** Extra content under the fields - the reviews list for Reviews. */
  children?: ReactNode;
}

const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp';

function TextField({
  field,
  value,
  onChange,
}: {
  field: LandingEditorField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {field.label}
      </label>
      {field.multiline ? (
        <textarea
          id={id}
          className={styles.input}
          rows={3}
          maxLength={LANDING_TEXT_MAX_LENGTH}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className={styles.input}
          type="text"
          maxLength={LANDING_TEXT_MAX_LENGTH}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

function ImageField({
  field,
  value,
  isBusy,
  onUpload,
  onReset,
}: {
  field: LandingEditorField;
  value: string | null;
  isBusy: boolean;
  onUpload: (file: File) => void;
  onReset: () => void;
}) {
  const inputId = useId();
  const isCustom = value !== null;

  return (
    <div className={styles.imageField}>
      <img
        className={styles.imagePreview}
        src={value ?? DEFAULT_LANDING_IMAGES[field.key]}
        alt=""
      />
      <div className={styles.imageMeta}>
        <span className={styles.fieldLabel}>{field.label}</span>
        <span className={styles.copy}>
          {isCustom ? 'Uploaded image' : 'Original image'} · PNG, JPEG or WebP,
          up to 5 MB
        </span>
        <div className={styles.actions}>
          <label
            htmlFor={inputId}
            className={`${styles.textButton} ${isBusy ? styles.isDisabled : ''}`}
          >
            Replace
          </label>
          <input
            id={inputId}
            className={styles.visuallyHidden}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            disabled={isBusy}
            aria-label={`Replace ${field.label}`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onUpload(file);
            }}
          />
          {isCustom ? (
            <button
              type="button"
              className={styles.textButton}
              disabled={isBusy}
              onClick={onReset}
            >
              Use original
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One landing-page section in the editor: its show/hide switch, its text
 * fields (saved together with one Save) and its images (each saved the
 * moment a file is picked).
 */
export function LandingSectionPanel({
  section,
  values,
  isVisible,
  isBusy,
  onSaveText,
  onToggleVisible,
  onUploadImage,
  onResetImage,
  children,
}: LandingSectionPanelProps) {
  const headingId = useId();
  const textFields = section.fields.filter((field) => field.kind === 'text');
  const imageFields = section.fields.filter((field) => field.kind === 'image');

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const draftValue = (key: string) => drafts[key] ?? values[key] ?? '';
  const changed = textFields.filter(
    (field) =>
      drafts[field.key] !== undefined &&
      drafts[field.key] !== (values[field.key] ?? '')
  );
  const hasBlank = textFields.some(
    (field) => draftValue(field.key).trim() === ''
  );

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changed.length === 0 || hasBlank) return;

    const saved = await onSaveText(
      changed.map((field) => ({
        key: field.key,
        value: draftValue(field.key).trim(),
      }))
    );
    if (saved) setDrafts({});
  }

  return (
    <section
      className={styles.panel}
      id={`landing-section-${section.key}`}
      aria-labelledby={headingId}
    >
      <header className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <h2 className={styles.sectionTitle} id={headingId}>
            {section.title}
            {isVisible === false ? (
              <span className={styles.hiddenTag}>Hidden</span>
            ) : null}
          </h2>
          {section.note ? <p className={styles.copy}>{section.note}</p> : null}
        </div>
        {isVisible !== undefined ? (
          <label className={styles.shownToggle}>
            <input
              type="checkbox"
              checked={isVisible}
              disabled={isBusy}
              onChange={() => onToggleVisible(!isVisible)}
            />
            Shown on the page
          </label>
        ) : null}
      </header>

      {imageFields.length > 0 ? (
        <div className={styles.imageGrid}>
          {imageFields.map((field) => (
            <ImageField
              key={field.key}
              field={field}
              value={values[field.key] ?? null}
              isBusy={isBusy}
              onUpload={(file) => onUploadImage(field.key, file)}
              onReset={() => onResetImage(field.key)}
            />
          ))}
        </div>
      ) : null}

      {textFields.length > 0 ? (
        <form className={styles.fields} onSubmit={(e) => void handleSave(e)}>
          {textFields.map((field) => (
            <TextField
              key={field.key}
              field={field}
              value={draftValue(field.key)}
              onChange={(value) =>
                setDrafts((prev) => ({ ...prev, [field.key]: value }))
              }
            />
          ))}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isBusy || changed.length === 0 || hasBlank}
            >
              Save {section.title}
            </button>
            {changed.length > 0 ? (
              <button
                type="button"
                className={styles.textButton}
                onClick={() => setDrafts({})}
              >
                Discard changes
              </button>
            ) : null}
            {hasBlank ? (
              <span className={styles.fieldError} role="alert">
                Fill in every field before saving.
              </span>
            ) : null}
          </div>
        </form>
      ) : null}

      {children}
    </section>
  );
}
