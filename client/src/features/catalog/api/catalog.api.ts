import type {
  CreateProductPayload,
  ListProductsFilter,
  ProductCatalogItem,
  UpdateProductPayload,
} from '../catalog.types';

interface CatalogApiResult<T> {
  data: T | null;
  error: string | null;
}

// catalog.routes.ts (server) is mounted at the server root, same as
// hotel.routes.ts / discounts.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<CatalogApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function jsonHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function listProducts(
  accessToken: string,
  filter: ListProductsFilter = {}
): Promise<CatalogApiResult<ProductCatalogItem[]>> {
  const params = new URLSearchParams();
  if (filter.category) params.set('category', filter.category);
  if (filter.service_scope) params.set('service_scope', filter.service_scope);
  if (filter.active_only) params.set('active_only', 'true');

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/catalog/products${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ items: ProductCatalogItem[] }>(response);
  return { data: result.data?.items ?? null, error: result.error };
}

export async function createProduct(
  payload: CreateProductPayload,
  accessToken: string
): Promise<CatalogApiResult<ProductCatalogItem>> {
  const response = await fetch(`${API_BASE_URL}/catalog/products`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ item: ProductCatalogItem }>(response);
  return { data: result.data?.item ?? null, error: result.error };
}

export async function updateProduct(
  itemId: string,
  payload: UpdateProductPayload,
  accessToken: string
): Promise<CatalogApiResult<ProductCatalogItem>> {
  const response = await fetch(`${API_BASE_URL}/catalog/products/${itemId}`, {
    method: 'PATCH',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ item: ProductCatalogItem }>(response);
  return { data: result.data?.item ?? null, error: result.error };
}

/** Soft: moves the item to the archive. Server still requires is_active
 * === false first (see productCatalog.service.ts's archiveProduct guard). */
export async function archiveProduct(
  itemId: string,
  accessToken: string
): Promise<CatalogApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/catalog/products/${itemId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function restoreProduct(
  itemId: string,
  accessToken: string
): Promise<CatalogApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/catalog/products/${itemId}/restore`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function listArchivedProducts(
  accessToken: string
): Promise<CatalogApiResult<ProductCatalogItem[]>> {
  const response = await fetch(`${API_BASE_URL}/catalog/products/archived`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ items: ProductCatalogItem[] }>(response);
  return { data: result.data?.items ?? null, error: result.error };
}

export async function hardDeleteProduct(
  itemId: string,
  accessToken: string
): Promise<CatalogApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/catalog/products/${itemId}/permanent`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}
