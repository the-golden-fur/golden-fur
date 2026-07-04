import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../../auth/api/auth.api';

interface UnavailabilityStatusBadgeProps {
  staffId: string;
  accessToken: string | null;
}

export function UnavailabilityStatusBadge({
  accessToken,
  staffId,
}: UnavailabilityStatusBadgeProps) {
  const [status, setStatus] = useState<
    'available' | 'checking' | 'error' | 'unavailable'
  >('checking');

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
        .select('id')
        .eq('staff_id', staffId)
        .lte('start_time', now)
        .gt('end_time', now)
        .limit(1);

      if (!isMounted) {
        return;
      }

      if (error) {
        setStatus('error');
        return;
      }

      setStatus(
        Array.isArray(data) && data.length > 0 ? 'unavailable' : 'available'
      );
    };

    void loadStatus();

    return () => {
      isMounted = false;
    };
  }, [accessToken, staffId]);

  const hasActiveBlock = status === 'unavailable';
  const label =
    status === 'checking'
      ? 'Checking availability'
      : status === 'error'
        ? 'Unable to check availability'
        : hasActiveBlock
          ? 'Currently unavailable'
          : 'Available for bookings';

  return (
    <span
      aria-label={label}
      title={label}
      style={{
        alignItems: 'center',
        alignSelf: 'flex-start',
        background:
          status === 'error'
            ? '#fffbeb'
            : hasActiveBlock
              ? '#fef2f2'
              : '#ecfdf5',
        border: `1px solid ${
          status === 'error'
            ? '#fde68a'
            : hasActiveBlock
              ? '#fecaca'
              : '#a7f3d0'
        }`,
        borderRadius: '999px',
        color:
          status === 'error'
            ? '#92400e'
            : hasActiveBlock
              ? '#991b1b'
              : '#065f46',
        display: 'inline-flex',
        fontSize: '0.8125rem',
        fontWeight: 700,
        gap: '0.4rem',
        lineHeight: 1,
        minHeight: '2rem',
        padding: '0 0.75rem',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
