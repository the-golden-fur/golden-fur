function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Custom change (per-item weight x coat pricing): whether a service's or
 * package's price varies by the pet's weight class and coat type is a
 * pricing decision for every branch, so only a Superadmin may switch it.
 * An Admin's save that leaves the switch exactly as it was still goes
 * through, so Admins keep editing everything else on the item.
 *
 * `requesterRole` undefined = an internal caller (no request behind it),
 * which isn't checked.
 */
export function assertCanSetPricingMatrix({
  requesterRole,
  next,
  current,
}: {
  requesterRole: string | undefined;
  /** The value being saved; undefined = not being changed. */
  next: boolean | undefined;
  current: boolean;
}): void {
  if (requesterRole === undefined || requesterRole === 'Superadmin') return;
  if (next === undefined || next === current) return;

  throwWithStatus(
    403,
    'Only a Superadmin can change whether a price varies by weight class and coat type'
  );
}
