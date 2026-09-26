import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { getPromoWheel, spinTheWheel } from '../../api/rewards.api';
import { notifySpinCreditsChanged } from '../../providers/spinCreditsEvents';
import { useSpinCredits } from '../../providers/useSpinCredits';
import type { PromoWheel } from '../../rewards.types';
import { SpinWheel } from '../SpinWheel/SpinWheel';
import styles from './SpinWheelPopup.module.css';

/** Routes where the pop-up never opens on its own: My Rewards already shows
 * every wheel, and MFA verification must not be interrupted. */
const SUPPRESSED_PREFIXES = ['/portal/rewards', '/portal/mfa'];

function dismissedStorageKey(userId: string): string {
  return `goldenfur:spin-popup-dismissed:${userId}`;
}

function readDismissedAt(userId: string | null): number | null {
  if (!userId) return null;
  try {
    const raw = window.sessionStorage.getItem(dismissedStorageKey(userId));
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function writeDismissedAt(userId: string, value: number) {
  try {
    window.sessionStorage.setItem(dismissedStorageKey(userId), String(value));
  } catch {
    // Best-effort - worst case the pop-up reappears on a later page load.
  }
}

/**
 * Session 114: "As an admin, I want to be able to set conditions that will
 * make the coupon spin wheel pop-up." Whenever the signed-in customer has
 * unspun spins (from any spin-wheel promo's trigger - bookings, a big
 * payment, or a daily/streak login), this opens over whatever portal page
 * they're on, showing one button per promo with its spin count and that
 * promo's own wheel.
 *
 * "Skip for now" keeps every spin (they stay spinnable from My Rewards and
 * the navbar chip keeps counting them) and remembers - for this browser
 * session - how many spins were waiting, so the pop-up only comes back once
 * the customer earns ANOTHER one.
 *
 * The outcome is always decided server-side by spin_wheel(); the wheel
 * animation only ever renders that result.
 */
export function SpinWheelPopup() {
  const { accessToken, user } = useAuth();
  const { pathname } = useLocation();
  const { summary, total, refresh } = useSpinCredits();
  const userId = user?.id ?? null;

  const [dismissedAt, setDismissedAt] = useState<number | null>(() =>
    readDismissedAt(userId)
  );
  // Once the customer starts spinning, keep the pop-up open (even as the
  // count drops to 0) until they close it themselves.
  const [isPinnedOpen, setIsPinnedOpen] = useState(false);
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [wheel, setWheel] = useState<PromoWheel | null>(null);
  const [wheelError, setWheelError] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [resultRewardId, setResultRewardId] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);

  // A spin made elsewhere (My Rewards) lowers the count below the level the
  // pop-up was dismissed at - track it down, so the NEXT earned spin (not
  // just one that beats the old, higher number) re-opens the pop-up.
  // "Adjusting state when a prop changes" (react.dev), not an effect.
  if (dismissedAt !== null && total < dismissedAt) {
    setDismissedAt(total);
  }

  useEffect(() => {
    if (userId && dismissedAt !== null) writeDismissedAt(userId, dismissedAt);
  }, [userId, dismissedAt]);

  const isSuppressedRoute = SUPPRESSED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const shouldAutoOpen =
    total > 0 &&
    !isSuppressedRoute &&
    (dismissedAt === null || total > dismissedAt);
  const isOpen = isPinnedOpen || shouldAutoOpen;

  const activePromoId =
    wheel && (isSpinning || resultRewardId)
      ? wheel.promoId
      : summary.byPromo.some((group) => group.promoId === selectedPromoId)
        ? selectedPromoId
        : (summary.byPromo[0]?.promoId ?? null);

  const activeCount =
    summary.byPromo.find((group) => group.promoId === activePromoId)?.count ??
    0;

  useEffect(() => {
    if (!isOpen || !accessToken || !activePromoId) return;
    if (wheel?.promoId === activePromoId) return;

    let active = true;
    void getPromoWheel(accessToken, activePromoId).then((result) => {
      if (!active) return;
      if (result.error || !result.data) {
        setWheelError(result.error ?? 'Could not load this wheel.');
        return;
      }
      setWheelError(null);
      setWheel(result.data);
    });

    return () => {
      active = false;
    };
  }, [isOpen, accessToken, activePromoId, wheel?.promoId]);

  function handleClose() {
    if (isSpinning) return;
    if (userId) setDismissedAt(total);
    setIsPinnedOpen(false);
    setResultRewardId(null);
    setResultText(null);
    setSpinError(null);
  }

  function selectPromo(promoId: string) {
    if (isSpinning) return;
    setSelectedPromoId(promoId);
    setResultRewardId(null);
    setResultText(null);
    setSpinError(null);
  }

  async function handleSpin() {
    if (!accessToken || !activePromoId || isSpinning) return;

    setIsPinnedOpen(true);
    setIsSpinning(true);
    setResultRewardId(null);
    setResultText(null);
    setSpinError(null);

    const result = await spinTheWheel(accessToken, { promoId: activePromoId });

    if (result.error || !result.data) {
      setIsSpinning(false);
      setSpinError(result.error ?? 'Could not spin the wheel.');
      return;
    }

    setResultRewardId(result.data.rewardId);
  }

  function handleAnimationComplete() {
    const reward = wheel?.rewards.find((item) => item.id === resultRewardId);
    setIsSpinning(false);
    setResultText(
      reward
        ? `You won: ${reward.label}! It's waiting in My Coupons.`
        : "You won a coupon! It's waiting in My Coupons."
    );
    refresh();
    notifySpinCreditsChanged();
  }

  if (!isOpen) return null;

  const hasSpinsLeft = activeCount > 0;

  return (
    <Modal
      isOpen={isOpen}
      title="You've earned a spin!"
      onClose={handleClose}
      closeOnBackdropClick={!isSpinning}
    >
      <div className={styles.body}>
        <p className={styles.count} role="status">
          You have <strong>{total}</strong> spin{total === 1 ? '' : 's'}{' '}
          waiting.
        </p>

        {summary.byPromo.length > 1 ? (
          <div
            className={styles.promoPicker}
            role="group"
            aria-label="Choose a wheel"
          >
            {summary.byPromo.map((group) => (
              <button
                key={group.promoId}
                type="button"
                className={
                  group.promoId === activePromoId
                    ? `${styles.promoPill} ${styles.promoPillActive}`
                    : styles.promoPill
                }
                aria-pressed={group.promoId === activePromoId}
                onClick={() => selectPromo(group.promoId)}
                disabled={isSpinning}
              >
                {group.promoName} ×{group.count}
              </button>
            ))}
          </div>
        ) : summary.byPromo[0] ? (
          <p className={styles.promoName}>{summary.byPromo[0].promoName}</p>
        ) : null}

        {wheelError ? (
          <p className={styles.error} role="alert">
            {wheelError}
          </p>
        ) : wheel && wheel.promoId === activePromoId ? (
          <SpinWheel
            rewards={wheel.rewards}
            resultRewardId={resultRewardId}
            onAnimationComplete={handleAnimationComplete}
          />
        ) : (
          <p className={styles.muted}>Loading wheel...</p>
        )}

        {resultText ? (
          <p className={styles.result} role="status">
            {resultText}
          </p>
        ) : null}

        {spinError ? (
          <p className={styles.error} role="alert">
            {spinError}
          </p>
        ) : null}

        <div className={styles.actions}>
          {hasSpinsLeft ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleSpin()}
              disabled={isSpinning || !wheel || wheel.rewards.length === 0}
            >
              {isSpinning
                ? 'Spinning...'
                : resultText
                  ? 'Spin again'
                  : 'Spin now'}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleClose}
            disabled={isSpinning}
          >
            {total === 0 ? 'Close' : 'Skip for now'}
          </button>
        </div>

        <p className={styles.muted}>
          Skipped spins are saved - spin them any time from{' '}
          <Link to="/portal/rewards" onClick={handleClose}>
            My Rewards
          </Link>
          .
        </p>
      </div>
    </Modal>
  );
}
