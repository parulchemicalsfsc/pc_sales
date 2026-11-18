/**
 * Returns the product's standard rate — the single source of truth
 * set by the admin in the Product Pricing module.
 *
 * All pages (Take Order, Invoice, Sales) must use this function
 * so that price shown everywhere matches what admin configured.
 */
export function getProductRate(
  product: any,
  _region?: string,
  _category?: string
): number {
  if (!product) return 0;

  // standard_rate is the single source of truth — written by the admin
  // Product Pricing module and read everywhere else.
  const std = Number(product.standard_rate);
  if (!isNaN(std) && std > 0) return std;

  // Legacy fallback columns (kept for backwards compatibility)
  if (Number(product.rate_gujarat) > 0) return Number(product.rate_gujarat);

  return 0;
}
