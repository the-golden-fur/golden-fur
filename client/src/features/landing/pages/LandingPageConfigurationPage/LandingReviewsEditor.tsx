import { useId, useState, type FormEvent } from 'react';
import {
  LANDING_REVIEW_DETAIL_MAX_LENGTH,
  LANDING_REVIEW_NAME_MAX_LENGTH,
  LANDING_REVIEW_QUOTE_MAX_LENGTH,
  type CreateLandingReviewPayload,
  type LandingReview,
} from '../../landing.types';
import styles from './LandingPageConfigurationPage.module.css';

interface ReviewDraft {
  quote: string;
  name: string;
  detail: string;
  rating: number;
}

const BLANK_DRAFT: ReviewDraft = { quote: '', name: '', detail: '', rating: 5 };

function ReviewFields({
  draft,
  onChange,
}: {
  draft: ReviewDraft;
  onChange: (draft: ReviewDraft) => void;
}) {
  const quoteId = useId();
  const nameId = useId();
  const detailId = useId();
  const ratingId = useId();

  return (
    <>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={quoteId}>
          Review
        </label>
        <textarea
          id={quoteId}
          className={styles.input}
          rows={3}
          maxLength={LANDING_REVIEW_QUOTE_MAX_LENGTH}
          value={draft.quote}
          onChange={(event) => onChange({ ...draft, quote: event.target.value })}
        />
      </div>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={nameId}>
            Name
          </label>
          <input
            id={nameId}
            className={styles.input}
            type="text"
            maxLength={LANDING_REVIEW_NAME_MAX_LENGTH}
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={detailId}>
            Service · branch (optional)
          </label>
          <input
            id={detailId}
            className={styles.input}
            type="text"
            maxLength={LANDING_REVIEW_DETAIL_MAX_LENGTH}
            placeholder="e.g. Grooming · Makati"
            value={draft.detail}
            onChange={(event) =>
              onChange({ ...draft, detail: event.target.value })
            }
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={ratingId}>
            Stars
          </label>
          <select
            id={ratingId}
            className={styles.input}
            value={draft.rating}
            onChange={(event) =>
              onChange({ ...draft, rating: Number(event.target.value) })
            }
          >
            {[5, 4, 3, 2, 1].map((stars) => (
              <option key={stars} value={stars}>
                {stars}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}

function toPayload(draft: ReviewDraft): CreateLandingReviewPayload | null {
  const quote = draft.quote.trim();
  const name = draft.name.trim();
  if (quote === '' || name === '') return null;

  return { quote, name, detail: draft.detail.trim(), rating: draft.rating };
}

interface LandingReviewsEditorProps {
  reviews: LandingReview[];
  isBusy: boolean;
  onBlank: () => void;
  onAdd: (payload: CreateLandingReviewPayload) => Promise<boolean>;
  onSave: (
    review: LandingReview,
    payload: CreateLandingReviewPayload
  ) => Promise<boolean>;
  onToggleShown: (review: LandingReview) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (review: LandingReview) => void;
}

/**
 * The reviews themselves - same list editing as the Mascot FAQs screen
 * (FaqConfigurationPage): every action saves on its own.
 */
export function LandingReviewsEditor({
  reviews,
  isBusy,
  onBlank,
  onAdd,
  onSave,
  onToggleShown,
  onMove,
  onDelete,
}: LandingReviewsEditorProps) {
  const [newDraft, setNewDraft] = useState<ReviewDraft>(BLANK_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ReviewDraft>(BLANK_DRAFT);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = toPayload(newDraft);
    if (!payload) return onBlank();

    if (await onAdd(payload)) setNewDraft(BLANK_DRAFT);
  }

  async function handleSaveEdit(
    event: FormEvent<HTMLFormElement>,
    review: LandingReview
  ) {
    event.preventDefault();
    const payload = toPayload(editDraft);
    if (!payload) return onBlank();

    if (await onSave(review, payload)) setEditingId(null);
  }

  return (
    <div className={styles.reviews}>
      <h3 className={styles.subTitle}>Reviews</h3>

      {reviews.length === 0 ? (
        <p className={styles.copy}>
          No reviews yet - the section shows only its title until you add one.
        </p>
      ) : (
        <ol className={styles.list} aria-label="Reviews">
          {reviews.map((review, index) => (
            <li key={review.id} className={styles.item}>
              <span className={styles.position} aria-hidden="true">
                {index + 1}
              </span>

              {editingId === review.id ? (
                <form
                  className={styles.editForm}
                  onSubmit={(event) => void handleSaveEdit(event, review)}
                >
                  <ReviewFields draft={editDraft} onChange={setEditDraft} />
                  <div className={styles.actions}>
                    <button
                      type="submit"
                      className={styles.primaryButton}
                      disabled={isBusy}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.itemBody}>
                  <p className={styles.reviewQuote}>“{review.quote}”</p>
                  <p className={styles.copy}>
                    {'★'.repeat(review.rating)} · {review.name}
                    {review.detail ? ` · ${review.detail}` : ''}
                    {review.is_active ? null : (
                      <span className={styles.hiddenTag}>Hidden</span>
                    )}
                  </p>

                  <div className={styles.actions}>
                    <label className={styles.shownToggle}>
                      <input
                        type="checkbox"
                        checked={review.is_active}
                        disabled={isBusy}
                        onChange={() => onToggleShown(review)}
                      />
                      Shown
                    </label>
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={isBusy || index === 0}
                      onClick={() => onMove(index, -1)}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={isBusy || index === reviews.length - 1}
                      onClick={() => onMove(index, 1)}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={isBusy}
                      onClick={() => {
                        setEditingId(review.id);
                        setEditDraft({
                          quote: review.quote,
                          name: review.name,
                          detail: review.detail,
                          rating: review.rating,
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`${styles.textButton} ${styles.dangerButton}`}
                      disabled={isBusy}
                      onClick={() => onDelete(review)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <form className={styles.addForm} onSubmit={(e) => void handleAdd(e)}>
        <h3 className={styles.subTitle}>Add a review</h3>
        <ReviewFields draft={newDraft} onChange={setNewDraft} />
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={isBusy}
        >
          Add review
        </button>
      </form>
    </div>
  );
}
