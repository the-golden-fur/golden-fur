import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import type { ProductCatalogItem } from '../catalog.types.ts';
import type {
  CreateProductInput,
  UpdateProductInput,
} from '../modules/validators/catalog.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Postgres unique_violation / foreign_key_violation. */
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

interface ListProductsParams {
  category?: string;
  serviceScope?: string;
  activeOnly?: boolean;
}

/**
 * Collapses foodCatalog.service.ts + medicationCatalog.service.ts (which
 * were byte-for-byte parallel, one per table) into one set of functions
 * over the shared product_catalog table (migration 20260731067), filterable
 * by category/service_scope so each feature (hotel food picker, hotel
 * medication picker, Misc Sale) can show the right slice. Mirrors
 * breeds.service.ts's admin-CRUD shape, same as the two tables it replaces.
 */
export async function listProducts({
  category,
  serviceScope,
  activeOnly,
}: ListProductsParams = {}): Promise<ProductCatalogItem[]> {
  let query = supabase
    .from('product_catalog')
    .select('*')
    .is('archived_at', null);

  if (category) {
    query = query.eq('category', category);
  }

  if (serviceScope) {
    query = query.eq('service_scope', serviceScope);
  }

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('category').order('name');

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

export async function createProduct(
  input: CreateProductInput
): Promise<ProductCatalogItem> {
  const { data, error } = await supabase
    .from('product_catalog')
    .insert({
      name: input.name,
      category: input.category,
      service_scope: input.service_scope,
      price: input.price,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(
        409,
        `A "${input.category}" item named "${input.name}" already exists`
      );
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(400, 'Failed to create product catalog item');

  return data;
}

export async function updateProduct(
  itemId: string,
  updates: UpdateProductInput
): Promise<ProductCatalogItem> {
  const { data, error } = await supabase
    .from('product_catalog')
    .update(updates)
    .eq('id', itemId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(
        409,
        'A product with this name already exists in this category'
      );
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(404, 'Product catalog item not found');

  return data;
}

async function getProductOrThrow(itemId: string): Promise<ProductCatalogItem> {
  const { data, error } = await supabase
    .from('product_catalog')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Product catalog item not found');

  return data;
}

/**
 * Deactivate-first CRUD safety (archive workflow): archiving is soft - the
 * row moves to the archive list via archived_at, it is not deleted. Only
 * hardDeleteProduct below actually removes the row.
 */
export async function archiveProduct(itemId: string): Promise<void> {
  const product = await getProductOrThrow(itemId);
  assertInactiveBeforeArchive(product.is_active, 'This product');

  const { error } = await supabase
    .from('product_catalog')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) throwWithStatus(400, error.message);
}

export async function restoreProduct(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('product_catalog')
    .update({ archived_at: null })
    .eq('id', itemId);

  if (error) throwWithStatus(400, error.message);
}

export async function listArchivedProducts(): Promise<ProductCatalogItem[]> {
  const { data, error } = await supabase
    .from('product_catalog')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

export async function hardDeleteProduct(itemId: string): Promise<void> {
  const product = await getProductOrThrow(itemId);
  assertArchivedBeforeHardDelete(product.archived_at, 'This product');

  const { error } = await supabase
    .from('product_catalog')
    .delete()
    .eq('id', itemId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This product is still referenced elsewhere (a check-in or a sale) and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
