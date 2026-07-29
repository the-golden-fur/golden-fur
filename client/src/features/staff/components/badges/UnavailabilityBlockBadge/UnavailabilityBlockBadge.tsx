import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../../../../shared/auth/api/auth.api';
import styles from './UnavailabilityBlockBadge.module.css';

interface UnavailabilityBlockBadgeProps {
  staffId: string;
  accessToken: string | null;
  /** Bump this after creating/cancelling a block to force a re-check. */
  refreshKey?: number;
}

type BadgeStatus = 'available' | 'blocked' | 'checking' | 'error';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function UnavailabilityBlockBadge({
  accessToken,
  staffId,
  refreshKey = 0,
}: UnavailabilityBlockBadgeProps) {
  const [status, setStatus] = useState<BadgeStatus>('checking');
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
  const [isFullDay, setIsFullDay] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadStatus = async () => {
      setStatus('checking');

      const client = getSupabaseClient();
      if (!client) {
        setStatus('error');
        return;
      }

      const {
        data: { session },
      } = await client.auth.getSession();

      if (!session?.access_token) {
        if (isMounted) {
          setStatus('error');
        }
        return;
      }

      const now = new Date().toISOString();
      const { data, error } = await client
        .from('staff_unavailability_blocks')
        .select('id, end_time, is_full_day')
        .eq('staff_id', staffId)
        .lte('start_time', now)
        .gt('end_time', now)
        .order('end_time', { ascending: true })
        .limit(1);

      if (!isMounted) {
        return;
      }

      if (error) {
        setStatus('error');
        return;
      }

      const activeBlock = Array.isArray(data) ? data[0] : undefined;

      if (activeBlock) {
        setBlockedUntil(activeBlock.end_time as string);
        setIsFullDay(Boolean(activeBlock.is_full_day));
        setStatus('blocked');
      } else {
        setBlockedUntil(null);
        setIsFullDay(false);
        setStatus('available');
      }
    };

    void loadStatus();

    return () => {
      isMounted = false;
    };
  }, [accessToken, staffId, refreshKey]);

  const label =
    status === 'checking'
      ? 'Checking availability'
      : status === 'error'
        ? 'Unable to check availability'
        : status === 'blocked'
          ? isFullDay
            ? 'Full day off'
            : `Off until ${blockedUntil ? formatTime(blockedUntil) : ''}`
          : 'Available';

  const variantClass =
    status === 'blocked'
      ? styles.blocked
      : status === 'error'
        ? styles.error
        : styles.neutral;

  return (
    <span
      aria-label={label}
      title={label}
      className={`${styles.badge} ${variantClass}`}
    >
      {label}
    </span>
  );
}
