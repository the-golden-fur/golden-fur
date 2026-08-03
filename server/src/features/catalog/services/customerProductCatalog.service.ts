import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { ProductCatalogItem } from '../catalog.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const UNIQUE_VIOLATION = '23505';

const CUSTOMER_CATEGORIES = ['food', 'medication'] as const;
export type CustomerCatalogCategory = (typeof CUSTOMER_CATEGORIES)[number];

/**
 * #22: customers maintain their own reusable food/medication "types" for
 * future hotel bookings - staff no longer buy these on a customer's behalf
 * (see 20260803084_m05_remove_staff_supplied_billing.sql). Repurposes the
 * same product_catalog table the staff Product Catalog admin page uses
 * (20260731067) rather than a parallel system: owner_customer_id scopes a
 * row to one customer; the staff-managed global rows (owner_customer_id
 * null) stay visible for reference but are never writable here. Deliberately
 * a leaner CRUD than productCatalog.service.ts's staff-admin functions - no
 * price, no is_active/deactivate-first workflow, no hard delete - a
 * customer's own type list has none of the billing/POS concerns those exist
 * for.
 */
export async function listCustomerCatalog({
  customerId,
  category,
}: {
  customerId: string;
  category?: CustomerCatalogCategory;
}): Promise<ProductCatalogItem[]> {
  let query = supabase
    .from('product_catalog')
    .select('*')
    .is('archived_at', null)
    .eq('service_scope', 'hotel')
    .in('category', CUSTOMER_CATEGORIES)
    .or(`owner_customer_id.eq.${customerId},owner_customer_id.is.null`);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query.order('category').order('name');

  if (error) throwWithStatus(400, error.message);
  return data ?? [];
}

export async function createCustomerCatalogItem({
  customerId,
  name,
  category,
}: {
  customerId: string;
  name: string;
  category: CustomerCatalogCategory;
}): Promise<ProductCatalogItem> {
  const { data, error } = await supabase
    .from('product_catalog')
    .insert({
      name,
      category,
      service_scope: 'hotel',
      price: 0,
      owner_customer_id: customerId,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(
        409,
        `You already have a "${category}" type named "${name}"`
      );
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(400, 'Failed to create catalog item');
  return data;
}

async function assertOwnedByCustomer(
  itemId: string,
  customerId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('product_catalog')
    .select('owner_customer_id')
    .eq('id', itemId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Catalog item not found');
  if (data.owner_customer_id !== customerId) {
    throwWithStatus(403, 'You do not own this catalog item');
  }
}

export async function updateCustomerCatalogItem({
  customerId,
  itemId,
  name,
}: {
  customerId: string;
  itemId: string;
  name: string;
}): Promise<ProductCatalogItem> {
  await assertOwnedByCustomer(itemId, customerId);

  const { data, error } = await supabase
    .from('product_catalog')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(409, 'You already have a type with this name');
    }
    throwWithStatus(400, error.message);
  }
  if (!data) throwWithStatus(404, 'Catalog item not found');
  return data;
}

/** Soft-archive only, no hard delete - a customer's past hotel bookings may
 * still reference this row via food_catalog_id/medication_catalog_id. */
export async function archiveCustomerCatalogItem({
  customerId,
  itemId,
}: {
  customerId: string;
  itemId: string;
}): Promise<void> {
  await assertOwnedByCustomer(itemId, customerId);

  const { error } = await supabase
    .from('product_catalog')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) throwWithStatus(400, error.message);
}
