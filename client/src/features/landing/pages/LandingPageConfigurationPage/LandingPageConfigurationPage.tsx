import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createLandingReview,
  deleteLandingReview,
  getLandingAdminContent,
  resetLandingImage,
  updateLandingContent,
  updateLandingReview,
  updateLandingSection,
  uploadLandingImage,
} from '../../api/landing.api';
import type {
  CreateLandingReviewPayload,
  LandingContentItem,
  LandingReview,
  LandingSectionKey,
} from '../../landing.types';
import { LANDING_EDITOR_SECTIONS } from './landingEditor.config';
import { LandingReviewsEditor } from './LandingReviewsEditor';
import { LandingSectionPanel } from './LandingSectionPanel';
import styles from './LandingPageConfigurationPage.module.css';

/** Superadmin-only: the landing page is one page shown to every visitor, so
 * a branch-scoped Admin has no access here at all - matched by the server's
 * Superadmin-only /maintenance/landing routes. */
const ALLOWED_VIEWER_ROLES = new Set(['Superadmin']);

function bySortOrder(a: LandingReview, b: LandingReview): number {
  return a.sort_order - b.sort_order;
}

function toValueMap(items: LandingContentItem[]) {
  return Object.fromEntries(items.map((item) => [item.key, item.value]));
}

/**
 * Custom change (editable landing page): the words, photos, sections and
 * customer reviews of the public landing page. Every save goes live straight
 * away - the landing page reads GET /public/landing each time it is opened.
 * Branch names, addresses and hours are edited in Settings › Branches.
 */
export function LandingPageConfigurationPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [values, setValues] = useState<Record<string, string | null>>({});
  const [sections, setSections] = useState<
    Partial<Record<LandingSectionKey, boolean>>
  >({});
  const [reviews, setReviews] = useState<LandingReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LandingReview | null>(null);

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

    void getLandingAdminContent(accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load the landing page.');
        return;
      }

      setValues(toValueMap(result.data.content));
      setSections(
        Object.fromEntries(
          result.data.sections.map((section) => [
            section.key,
            section.is_visible,
          ])
        )
      );
      setReviews([...result.data.reviews].sort(bySortOrder));
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

  const token = accessToken;

  /** Runs one save with the shared busy/error/message handling; resolves to
   * whether it worked. */
  async function run<T>(
    action: () => Promise<{ data: T | null; error: string | null }>,
    onSuccess: (data: T) => string
  ): Promise<boolean> {
    setIsBusy(true);
    setError(null);
    setMessage(null);

    const result = await action();
    setIsBusy(false);

    if (result.error || result.data === null) {
      setError(result.error ?? 'Could not save. Please try again.');
      return false;
    }

    setMessage(onSuccess(result.data));
    return true;
  }

  function mergeItems(items: LandingContentItem[]) {
    setValues((prev) => ({ ...prev, ...toValueMap(items) }));
  }

  function replaceReview(updated: LandingReview) {
    setReviews((prev) =>
      prev
        .map((review) => (review.id === updated.id ? updated : review))
        .sort(bySortOrder)
    );
  }

  function saveText(
    title: string,
    updates: Array<{ key: string; value: string }>
  ) {
    return run(
      () => updateLandingContent(token, updates),
      (items) => {
        mergeItems(items);
        return `${title} saved.`;
      }
    );
  }

  function toggleSection(key: LandingSectionKey, title: string, next: boolean) {
    void run(
      () => updateLandingSection(token, key, next),
      (section) => {
        setSections((prev) => ({ ...prev, [key]: section.is_visible }));
        return section.is_visible
          ? `${title} is shown on the landing page.`
          : `${title} is hidden from the landing page.`;
      }
    );
  }

  function uploadImage(key: string, file: File) {
    void run(
      () => uploadLandingImage(token, key, file),
      (item) => {
        mergeItems([item]);
        return 'Image uploaded.';
      }
    );
  }

  function resetImage(key: string) {
    void run(
      () => resetLandingImage(token, key),
      (item) => {
        mergeItems([item]);
        return 'Back to the original image.';
      }
    );
  }

  function addReview(payload: CreateLandingReviewPayload) {
    return run(
      () => createLandingReview(token, payload),
      (created) => {
        setReviews((prev) => [...prev, created].sort(bySortOrder));
        return 'Review added.';
      }
    );
  }

  function saveReview(review: LandingReview, payload: CreateLandingReviewPayload) {
    return run(
      () => updateLandingReview(review.id, token, payload),
      (updated) => {
        replaceReview(updated);
        return 'Review saved.';
      }
    );
  }

  function toggleReviewShown(review: LandingReview) {
    void run(
      () => updateLandingReview(review.id, token, { is_active: !review.is_active }),
      (updated) => {
        replaceReview(updated);
        return updated.is_active
          ? 'Review is shown on the landing page.'
          : 'Review is hidden from the landing page.';
      }
    );
  }

  /** Swaps a review's position with its neighbour's - two small saves rather
   * than renumbering the whole list (same as the FAQ screen). */
  async function moveReview(index: number, direction: -1 | 1) {
    const review = reviews[index];
    const neighbour = reviews[index + direction];
    if (!review || !neighbour) return;

    setIsBusy(true);
    setError(null);
    setMessage(null);
    const [moved, displaced] = await Promise.all([
      updateLandingReview(review.id, token, {
        sort_order: neighbour.sort_order,
      }),
      updateLandingReview(neighbour.id, token, {
        sort_order: review.sort_order,
      }),
    ]);
    setIsBusy(false);

    if (moved.error || displaced.error || !moved.data || !displaced.data) {
      setError(moved.error ?? displaced.error ?? 'Could not reorder the reviews.');
      // One half may have saved - show what the server now has.
      const reloaded = await getLandingAdminContent(token);
      if (reloaded.data) setReviews([...reloaded.data.reviews].sort(bySortOrder));
      return;
    }

    replaceReview(moved.data);
    replaceReview(displaced.data);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;

    setIsBusy(true);
    setError(null);
    setMessage(null);
    const result = await deleteLandingReview(target.id, token);
    setIsBusy(false);
    setDeleteTarget(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    setReviews((prev) => prev.filter((review) => review.id !== target.id));
    setMessage('Review deleted.');
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Landing Page</h1>
          <a
            className={styles.viewLink}
            href="/"
            target="_blank"
            rel="noopener noreferrer"
          >
            View live page
          </a>
        </div>
        <p className={styles.copy}>
          The words, photos and customer reviews on the public home page. Every
          change goes live as soon as it is saved.
        </p>

        {isLoading ? (
          <LoadingState label="Loading the landing page..." />
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <nav aria-label="Landing page sections">
              <ul className={styles.jumpList}>
                {LANDING_EDITOR_SECTIONS.map((section) => (
                  <li key={section.key}>
                    <a
                      className={styles.jumpLink}
                      href={`#landing-section-${section.key}`}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className={styles.status} aria-live="polite">
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
            </div>

            {LANDING_EDITOR_SECTIONS.map((section) => {
              const sectionKey =
                section.key === 'footer' ? null : section.key;

              return (
                <LandingSectionPanel
                  key={section.key}
                  section={section}
                  values={values}
                  isVisible={
                    sectionKey ? (sections[sectionKey] ?? true) : undefined
                  }
                  isBusy={isBusy}
                  onSaveText={(updates) => saveText(section.title, updates)}
                  onToggleVisible={(next) => {
                    if (sectionKey) toggleSection(sectionKey, section.title, next);
                  }}
                  onUploadImage={uploadImage}
                  onResetImage={resetImage}
                >
                  {section.key === 'reviews' ? (
                    <LandingReviewsEditor
                      reviews={reviews}
                      isBusy={isBusy}
                      onBlank={() => {
                        setMessage(null);
                        setError('Enter both the review and a name.');
                      }}
                      onAdd={addReview}
                      onSave={saveReview}
                      onToggleShown={toggleReviewShown}
                      onMove={(index, direction) =>
                        void moveReview(index, direction)
                      }
                      onDelete={setDeleteTarget}
                    />
                  ) : null}
                </LandingSectionPanel>
              );
            })}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete this review?"
        body={
          <>
            {deleteTarget?.name}’s review will be removed from the landing
            page. To take it off the page but keep it here, untick Shown
            instead.
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
