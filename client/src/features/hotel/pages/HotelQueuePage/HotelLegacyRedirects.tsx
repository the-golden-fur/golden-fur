import { Navigate, useParams } from 'react-router';

/**
 * Queue redesign: the standalone Hotel Check-in/Checkout pages retired in
 * favor of HotelQueuePage's tabs. These three keep the old URLs working -
 * HotelBookingPicker's own "already checked in -> go to checkout" link
 * still points at /staff/hotel/checkout/:stayId, and old bookmarks/links
 * may too - by redirecting into the merged queue with the right tab (and
 * stay, if any) preselected via query params.
 */
export function HotelCheckInRedirect() {
  return <Navigate to="/staff/hotel/queue" replace />;
}

export function HotelCheckoutRedirect() {
  return <Navigate to="/staff/hotel/queue?tab=check-out" replace />;
}

export function HotelCheckoutStayRedirect() {
  const { stayId } = useParams<{ stayId: string }>();
  return (
    <Navigate
      to={`/staff/hotel/queue?tab=check-out&stayId=${encodeURIComponent(stayId ?? '')}`}
      replace
    />
  );
}
