import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  DeletedRecordArchiveEntry,
  DeletedRecordsSort,
} from '../recordsArchive.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface ListDeletedRecordsParams {
  table?: string;
  search?: string;
  from?: string;
  to?: string;
  sort: DeletedRecordsSort;
  limit: number;
  offset: number;
}

export interface ListDeletedRecordsResult {
  rows: DeletedRecordArchiveEntry[];
  total: number;
}

/**
 * Query/filter/sort the universal archive - "search" matches anywhere in
 * the deleted row's own data via the generated `search_text` column (the
 * table's own migration comment explains why: a plain `ilike`, no
 * pg_trgm/tsvector setup, is enough at this project's scale).
 */
export async function listDeletedRecords({
  table,
  search,
  from,
  to,
  sort,
  limit,
  offset,
}: ListDeletedRecordsParams): Promise<ListDeletedRecordsResult> {
  let query = supabase
    .from('deleted_records_archive')
    .select('*', { count: 'exact' });

  if (table) query = query.eq('source_table', table);
  if (search) query = query.ilike('search_text', `%${search}%`);
  if (from) query = query.gte('deleted_at', from);
  if (to) query = query.lte('deleted_at', to);

  query = query
    .order('deleted_at', { ascending: sort === 'deleted_at_asc' })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throwWithStatus(400, error.message);

  return {
    rows: (data ?? []) as DeletedRecordArchiveEntry[],
    total: count ?? 0,
  };
}

/** Every distinct source_table currently in the archive, for the filter
 * dropdown - only tables that have actually had something deleted from
 * them ever show up, rather than every table in the schema. */
export async function listDeletedRecordTables(): Promise<string[]> {
  const { data, error } = await supabase
    .from('deleted_records_archive')
    .select('source_table');

  if (error) throwWithStatus(400, error.message);

  const tables = new Set((data ?? []).map((row) => row.source_table as string));
  return [...tables].sort((a, b) => a.localeCompare(b));
}

/**
 * Generic restore: row_data is a full to_jsonb(OLD) snapshot (every column,
 * already JSON-shaped the way PostgREST expects), so re-inserting it
 * verbatim into source_table works for any table without knowing its
 * columns ahead of time - the only thing that can fail is a Postgres
 * constraint (a new row already occupies that id, a referenced row is
 * itself gone, ...), surfaced as a plain 400 with Postgres's own message.
 * Dependent rows cascade-deleted alongside this one are archived as their
 * own separate entries (Postgres fires the same trigger per row) - this
 * does not attempt to reconstruct that tree automatically, so a caller
 * restoring a parent row also needs to find and restore each child entry.
 */
export async function restoreDeletedRecord(
  id: string,
  requesterId: string
): Promise<DeletedRecordArchiveEntry> {
  const { data: entry, error: fetchError } = await supabase
    .from('deleted_records_archive')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throwWithStatus(400, fetchError.message);
  if (!entry) throwWithStatus(404, 'Archived record not found');
  if (entry.restored_at) {
    throwWithStatus(409, 'This record has already been restored');
  }

  const { error: insertError } = await supabase
    .from(entry.source_table)
    .insert(entry.row_data);

  if (insertError) {
    throwWithStatus(
      400,
      `Could not restore into ${entry.source_table}: ${insertError.message}`
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('deleted_records_archive')
    .update({ restored_at: new Date().toISOString(), restored_by: requesterId })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (updateError) throwWithStatus(400, updateError.message);
  if (!updated) throwWithStatus(404, 'Archived record not found');

  return updated as DeletedRecordArchiveEntry;
}

/** Permanently removes one archive entry - the entry itself, not the
 * (already long gone) live row it once described. Excluded from the
 * capture trigger (see the archive table's own migration), so this never
 * re-archives itself. */
export async function purgeDeletedRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('deleted_records_archive')
    .delete()
    .eq('id', id);

  if (error) throwWithStatus(400, error.message);
}
