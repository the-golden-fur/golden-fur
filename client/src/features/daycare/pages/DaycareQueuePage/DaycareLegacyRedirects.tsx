import { Navigate, useParams } from 'react-router';

/**
 * Queue redesign: the standalone Daycare Check-in/Checkout pages retired in
 * favor of DaycareQueuePage's tabs. These three keep the old URLs working -
 * mirrors HotelLegacyRedirects.tsx.
 */
export function DaycareCheckInRedirect() {
  return <Navigate to="/staff/daycare/queue" replace />;
}

export function DaycareCheckoutRedirect() {
  return <Navigate to="/staff/daycare/queue?tab=check-out" replace />;
}

export function DaycareCheckoutSessionRedirect() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return (
    <Navigate
      to={`/staff/daycare/queue?tab=check-out&sessionId=${encodeURIComponent(sessionId ?? '')}`}
      replace
    />
  );
}
