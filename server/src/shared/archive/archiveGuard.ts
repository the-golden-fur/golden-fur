function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Shared enforcement for the "deactivate before archive/delete" rule used by
 * Products, Staff, and Customers/Pets: every CRUD action except Update
 * requires is_active === false first, so an admin can't accidentally
 * archive or delete something still in active use. Called from each
 * entity's archive/hard-delete service function rather than duplicated per
 * feature.
 */
export function assertInactiveBeforeArchive(
  isActive: boolean,
  entityLabel: string
): void {
  if (isActive) {
    throwWithStatus(
      403,
      `${entityLabel} must be deactivated before it can be archived`
    );
  }
}

/**
 * Row update applied when an admin-config row (services, packages, promos,
 * branches, rewards, ...) is archived. Archiving is a one-step "hide and
 * deactivate" - there is no separate Deactivate action any more - so the
 * inactive flag is set together with archived_at instead of being a
 * precondition. Staff/Customers/Pets still use assertInactiveBeforeArchive.
 */
export function archivePatch(): { archived_at: string; is_active: false } {
  return { archived_at: new Date().toISOString(), is_active: false };
}

export function assertArchivedBeforeHardDelete(
  archivedAt: string | null,
  entityLabel: string
): void {
  if (!archivedAt) {
    throwWithStatus(
      403,
      `${entityLabel} must be archived before it can be permanently deleted`
    );
  }
}
