import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import {
  getMyCoupons,
  getMySpinCredits,
  listSpinWheelRewards,
  spinTheWheel,
} from '../../api/rewards.api';
import type { CustomerCoupon, SpinWheelReward } from '../../rewards.types';
import { SpinWheel } from '../../components/SpinWheel/SpinWheel';
import styles from './CustomerRewardsPage.module.css';

/** "My Rewards" (session 86) - spin-credit count, the spin wheel itself,
 * and the customer's coupon list (unused + already-used). */
export function CustomerRewardsPage() {
  const { accessToken } = useAuth();

  const [rewards, setRewards] = useState<SpinWheelReward[]>([]);
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [availableSpins, setAvailableSpins] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [resultRewardId, setResultRewardId] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    if (!accessToken) return;
    void Promise.all([
      listSpinWheelRewards(accessToken),
      getMyCoupons(accessToken),
      getMySpinCredits(accessToken),
    ]).then(([rewardsResult, couponsResult, creditsResult]) => {
      if (rewardsResult.data) setRewards(rewardsResult.data);
      if (couponsResult.data) setCoupons(couponsResult.data);
      if (creditsResult.data !== null) setAvailableSpins(creditsResult.data);
      setIsLoading(false);
    });
  };

  useEffect(refresh, [accessToken]);

  const handleSpin = async () => {
    if (!accessToken || availableSpins <= 0 || isSpinning) return;

    setIsSpinning(true);
    setMessage(null);

    const result = await spinTheWheel(accessToken);

    if (result.error || !result.data) {
      setIsSpinning(false);
      setMessage(result.error ?? 'Could not spin the wheel.');
      return;
    }

    setResultRewardId(result.data.rewardId);
  };

  const handleAnimationComplete = () => {
    setIsSpinning(false);
    setResultRewardId(null);
    setMessage('Coupon added to My Coupons!');
    refresh();
  };

  const unredeemedCoupons = coupons.filter((coupon) => !coupon.is_redeemed);
  const usedCoupons = coupons.filter((coupon) => coupon.is_redeemed);

  if (!accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load My Rewards.
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading...</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>My Rewards</h1>

        <section className={styles.spinSection}>
          <p className={styles.spinCount}>
            You have <strong>{availableSpins}</strong> spin
            {availableSpins === 1 ? '' : 's'} available.
          </p>

          <SpinWheel
            rewards={rewards}
            resultRewardId={resultRewardId}
            onAnimationComplete={handleAnimationComplete}
          />

          <button
            type="button"
            className={styles.spinButton}
            onClick={() => void handleSpin()}
            disabled={availableSpins <= 0 || isSpinning}
          >
            {isSpinning ? 'Spinning...' : 'Spin the wheel'}
          </button>

          {message ? (
            <p className={styles.successBanner} role="status">
              {message}
            </p>
          ) : null}
        </section>

        <section>
          <h2 className={styles.sectionTitle}>My Coupons</h2>
          {unredeemedCoupons.length === 0 ? (
            <p className={styles.copy}>
              No unused coupons yet - keep booking to earn a spin!
            </p>
          ) : (
            <ul className={styles.couponList}>
              {unredeemedCoupons.map((coupon) => (
                <li key={coupon.id} className={styles.couponCard}>
                  {coupon.discount_type === 'Percentage'
                    ? `${coupon.value}% off`
                    : `${formatCurrency(coupon.value)} off`}
                </li>
              ))}
            </ul>
          )}
        </section>

        {usedCoupons.length > 0 ? (
          <section>
            <h2 className={styles.sectionTitle}>Used coupons</h2>
            <ul className={styles.couponList}>
              {usedCoupons.map((coupon) => (
                <li
                  key={coupon.id}
                  className={`${styles.couponCard} ${styles.couponUsed}`}
                >
                  {coupon.discount_type === 'Percentage'
                    ? `${coupon.value}% off`
                    : `${formatCurrency(coupon.value)} off`}{' '}
                  - used
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
