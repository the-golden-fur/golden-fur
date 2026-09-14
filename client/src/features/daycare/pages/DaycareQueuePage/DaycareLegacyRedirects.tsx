import { Navigate } from 'react-router';

/**
 * Daycare Queue redesign: these three old standalone Check-in/Checkout URLs
 * (and, before that, the Check In/Check Out tab query params they used to
 * redirect into) no longer have a matching destination - the queue is a
 * single list now, and check-in/checkout both moved to their own places
 * (DaycareCheckInFormPage; the Boarding Checklist's per-pet Check Out
 * section). All three just land on the bare queue rather than disappearing
 * outright, so an old bookmark still goes somewhere useful.
 */
export function DaycareCheckInRedirect() {
  return <Navigate to="/staff/daycare/queue" replace />;
}

export function DaycareCheckoutRedirect() {
  return <Navigate to="/staff/daycare/queue" replace />;
}

export function DaycareCheckoutSessionRedirect() {
  return <Navigate to="/staff/daycare/queue" replace />;
}
