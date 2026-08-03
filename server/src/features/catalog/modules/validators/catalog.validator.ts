import { z } from 'zod';

/**
 * category/service_scope are free text at the validator layer too (see
 * catalog.types.ts) - kept to a documented convention, not a closed enum,
 * so admin-managed categories can grow without a code change.
 */
export const createProductValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    category: z.string().trim().min(1, 'Category is required'),
    service_scope: z.string().trim().min(1, 'Service scope is required'),
    price: z.number().nonnegative(),
  })
  .strict();

export const updateProductValidator = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
    service_scope: z.string().trim().min(1).optional(),
    price: z.number().nonnegative().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductValidator>;
export type UpdateProductInput = z.infer<typeof updateProductValidator>;

/**
 * #22: a customer's own food/medication "type" entry - only a name and
 * which of the two it is. No price (customer-owned rows are never billed,
 * see 20260803084) and no service_scope (always 'hotel' server-side).
 */
export const createCustomerCatalogItemValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    category: z.enum(['food', 'medication']),
  })
  .strict();

export const updateCustomerCatalogItemValidator = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
  })
  .strict();

export type CreateCustomerCatalogItemInput = z.infer<
  typeof createCustomerCatalogItemValidator
>;
export type UpdateCustomerCatalogItemInput = z.infer<
  typeof updateCustomerCatalogItemValidator
>;
