/**
 * Universal deleted-records archive (custom change,
 * 20260913202_custom_universal_deleted_records_archive.sql). One row per
 * physically-deleted row, from ANY table - captured by a database trigger,
 * not written by this feature's own code. `deleted_by` is nullable and will
 * be null for the overwhelming majority of deletes (the server's
 * service-role Supabase client has no `auth.uid()` inside the trigger) -
 * same limitation as activity_log.actor_staff_id.
 */
export interface DeletedRecordArchiveEntry {
  id: string;
  source_table: string;
  record_id: string | null;
  row_data: Record<string, unknown>;
  deleted_by: string | null;
  deleted_at: string;
  restored_at: string | null;
  restored_by: string | null;
}

export type DeletedRecordsSort = 'deleted_at_desc' | 'deleted_at_asc';
