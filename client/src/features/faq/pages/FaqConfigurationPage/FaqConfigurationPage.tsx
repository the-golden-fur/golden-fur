import { useEffect, useId, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { listStaff } from '../../../staff/api/staff.api';
import { createFaq, deleteFaq, listFaqs, updateFaq } from '../../api/faq.api';
import {
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_QUESTION_MAX_LENGTH,
  type FaqItem,
} from '../../faq.types';
import styles from './FaqConfigurationPage.module.css';

/** Superadmin-only: the FAQs are one list shown to every visitor at every
 * branch, so a branch-scoped Admin has no access here at all - matched by
 * the server's Superadmin-only /maintenance/faqs routes. */
const ALLOWED_VIEWER_ROLES = new Set(['Superadmin']);

const BLANK_ERROR = 'Enter both a question and an answer.';

function bySortOrder(a: FaqItem, b: FaqItem): number {
  return a.sort_order - b.sort_order;
}

interface FaqFieldsProps {
  question: string;
  answer: string;
  onQuestionChange: (value: string) => void;
  onAnswerChange: (value: string) => void;
}

/** The question + answer inputs, shared by the add form and a row's edit
 * form. */
function FaqFields({
  question,
  answer,
  onQuestionChange,
  onAnswerChange,
}: FaqFieldsProps) {
  const questionId = useId();
  const answerId = useId();

  return (
    <>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={questionId}>
          Question
        </label>
        <input
          id={questionId}
          className={styles.input}
          type="text"
          maxLength={FAQ_QUESTION_MAX_LENGTH}
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={answerId}>
          Answer
        </label>
        <textarea
          id={answerId}
          className={styles.input}
          rows={3}
          maxLength={FAQ_ANSWER_MAX_LENGTH}
          value={answer}
          onChange={(event) => onAnswerChange(event.target.value)}
        />
      </div>
    </>
  );
}

/**
 * Custom change (configurable mascot FAQs): the questions and answers behind
 * the help mascot's "FAQs" button. A Superadmin adds, edits, reorders, hides
 * and deletes them here; the mascot shows the shown ones, in this order, the
 * next time its popup is opened (HelpMascot.tsx reads GET /public/faqs).
 *
 * Every action saves on its own - there is no page-level Save - so the list
 * on screen is always what the mascot will show.
 */
export function FaqConfigurationPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<FaqItem | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    void listFaqs(accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load the FAQs.');
        return;
      }

      setFaqs([...result.data].sort(bySortOrder));
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <LoadingState />
        </div>
      </main>
    );
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  function startAction() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
  }

  function replaceFaq(updated: FaqItem) {
    setFaqs((prev) =>
      prev
        .map((faq) => (faq.id === updated.id ? updated : faq))
        .sort(bySortOrder)
    );
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    const question = newQuestion.trim();
    const answer = newAnswer.trim();

    if (question === '' || answer === '') {
      setMessage(null);
      setError(BLANK_ERROR);
      return;
    }

    startAction();
    const result = await createFaq(accessToken, { question, answer });
    setIsBusy(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not add the FAQ.');
      return;
    }

    const created = result.data;
    setFaqs((prev) => [...prev, created].sort(bySortOrder));
    setNewQuestion('');
    setNewAnswer('');
    setMessage('FAQ added.');
  }

  function startEditing(faq: FaqItem) {
    setEditingId(faq.id);
    setEditQuestion(faq.question);
    setEditAnswer(faq.answer);
    setError(null);
    setMessage(null);
  }

  async function handleSaveEdit(
    event: FormEvent<HTMLFormElement>,
    faq: FaqItem
  ) {
    event.preventDefault();
    if (!accessToken) return;

    const question = editQuestion.trim();
    const answer = editAnswer.trim();

    if (question === '' || answer === '') {
      setMessage(null);
      setError(BLANK_ERROR);
      return;
    }

    startAction();
    const result = await updateFaq(faq.id, accessToken, { question, answer });
    setIsBusy(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not save the FAQ.');
      return;
    }

    replaceFaq(result.data);
    setEditingId(null);
    setMessage('FAQ saved.');
  }

  async function handleToggleShown(faq: FaqItem) {
    if (!accessToken) return;

    startAction();
    const result = await updateFaq(faq.id, accessToken, {
      is_active: !faq.is_active,
    });
    setIsBusy(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not update the FAQ.');
      return;
    }

    replaceFaq(result.data);
    setMessage(
      result.data.is_active
        ? 'FAQ is shown on the mascot.'
        : 'FAQ is hidden from the mascot.'
    );
  }

  /** Swaps an FAQ's position with its neighbour's - two small saves rather
   * than renumbering the whole list. */
  async function handleMove(index: number, direction: -1 | 1) {
    if (!accessToken) return;

    const faq = faqs[index];
    const neighbour = faqs[index + direction];
    if (!faq || !neighbour) return;

    startAction();
    const [moved, displaced] = await Promise.all([
      updateFaq(faq.id, accessToken, { sort_order: neighbour.sort_order }),
      updateFaq(neighbour.id, accessToken, { sort_order: faq.sort_order }),
    ]);
    setIsBusy(false);

    if (moved.error || displaced.error || !moved.data || !displaced.data) {
      setError(moved.error ?? displaced.error ?? 'Could not reorder the FAQs.');
      // One half may have saved - show what the server now has.
      const reloaded = await listFaqs(accessToken);
      if (reloaded.data) setFaqs([...reloaded.data].sort(bySortOrder));
      return;
    }

    const movedFaq = moved.data;
    const displacedFaq = displaced.data;
    setFaqs((prev) =>
      prev
        .map((item) =>
          item.id === movedFaq.id
            ? movedFaq
            : item.id === displacedFaq.id
              ? displacedFaq
              : item
        )
        .sort(bySortOrder)
    );
  }

  async function confirmDelete() {
    if (!accessToken || !deleteTarget) return;

    const target = deleteTarget;

    startAction();
    const result = await deleteFaq(target.id, accessToken);
    setIsBusy(false);
    setDeleteTarget(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    setFaqs((prev) => prev.filter((faq) => faq.id !== target.id));
    setMessage('FAQ deleted.');
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Mascot FAQs</h1>
        <p className={styles.copy}>
          The questions and answers behind the help mascot’s “FAQs” button, on
          every page. Changes save straight away and show the next time the
          popup is opened.
        </p>

        {error ? (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        {isLoading ? (
          <LoadingState label="Loading FAQs..." />
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <>
            {faqs.length === 0 ? (
              <p className={styles.copy}>
                No FAQs yet. Until you add one, the mascot shows its built-in
                questions.
              </p>
            ) : (
              <ol className={styles.list} aria-label="FAQs">
                {faqs.map((faq, index) => (
                  <li key={faq.id} className={styles.item}>
                    <span className={styles.position} aria-hidden="true">
                      {index + 1}
                    </span>

                    {editingId === faq.id ? (
                      <form
                        className={styles.editForm}
                        onSubmit={(event) => void handleSaveEdit(event, faq)}
                      >
                        <FaqFields
                          question={editQuestion}
                          answer={editAnswer}
                          onQuestionChange={setEditQuestion}
                          onAnswerChange={setEditAnswer}
                        />
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
                        <p className={styles.question}>
                          {faq.question}
                          {faq.is_active ? null : (
                            <span className={styles.hiddenTag}>Hidden</span>
                          )}
                        </p>
                        <p className={styles.answer}>{faq.answer}</p>

                        <div className={styles.actions}>
                          <label className={styles.shownToggle}>
                            <input
                              type="checkbox"
                              checked={faq.is_active}
                              disabled={isBusy}
                              onChange={() => void handleToggleShown(faq)}
                            />
                            Shown
                          </label>
                          <button
                            type="button"
                            className={styles.textButton}
                            disabled={isBusy || index === 0}
                            onClick={() => void handleMove(index, -1)}
                          >
                            Move up
                          </button>
                          <button
                            type="button"
                            className={styles.textButton}
                            disabled={isBusy || index === faqs.length - 1}
                            onClick={() => void handleMove(index, 1)}
                          >
                            Move down
                          </button>
                          <button
                            type="button"
                            className={styles.textButton}
                            disabled={isBusy}
                            onClick={() => startEditing(faq)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`${styles.textButton} ${styles.dangerButton}`}
                            disabled={isBusy}
                            onClick={() => setDeleteTarget(faq)}
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

            <form
              className={styles.form}
              onSubmit={(event) => void handleAdd(event)}
            >
              <h2 className={styles.sectionTitle}>Add an FAQ</h2>
              <FaqFields
                question={newQuestion}
                answer={newAnswer}
                onQuestionChange={setNewQuestion}
                onAnswerChange={setNewAnswer}
              />
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isBusy}
              >
                Add FAQ
              </button>
            </form>
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete this FAQ?"
        body={
          <>
            “{deleteTarget?.question}” will be removed from the mascot. To take
            it off the mascot but keep it here, untick Shown instead.
          </>
        }
        confirmLabel="Delete"
        tone="danger"
        isConfirming={isBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
