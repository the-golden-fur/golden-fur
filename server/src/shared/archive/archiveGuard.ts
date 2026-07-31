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
