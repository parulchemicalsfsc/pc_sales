/**
 * Utility to calculate product rates based on Product Pricing Management (custom_rates).
 * Supports case-insensitive region & category matching, category synonyms, and fallbacks.
 */
export function getProductRate(
  product: any,
  region?: string,
  category?: string
): number {
  if (!product) return 0;

  let customRates = product.custom_rates;
  if (typeof customRates === "string") {
    try {
      customRates = JSON.parse(customRates);
    } catch {
      customRates = null;
    }
  }

  if (customRates && typeof customRates === "object") {
    const targetRegion = (region || "Gujarat").trim().toLowerCase();
    const targetCategory = (category || "Sabhasad").trim().toLowerCase();

    // 1. Find region key case-insensitively
    let matchedRegionRates: Record<string, any> | undefined;
    for (const rKey of Object.keys(customRates)) {
      if (rKey.trim().toLowerCase() === targetRegion) {
        matchedRegionRates = customRates[rKey];
        break;
      }
    }

    // Fallback to "Gujarat" if requested region isn't configured in custom_rates
    if (!matchedRegionRates) {
      for (const rKey of Object.keys(customRates)) {
        if (rKey.trim().toLowerCase() === "gujarat") {
          matchedRegionRates = customRates[rKey];
          break;
        }
      }
    }

    if (matchedRegionRates && typeof matchedRegionRates === "object") {
      // 2. Exact category match (case-insensitive)
      for (const cKey of Object.keys(matchedRegionRates)) {
        if (cKey.trim().toLowerCase() === targetCategory) {
          const val = Number(matchedRegionRates[cKey]);
          if (!isNaN(val) && val > 0) {
            return val;
          }
        }
      }

      // 3. Synonym matching for categories
      const categorySynonyms: Record<string, string[]> = {
        sabhasad: ["customer", "farmer", "retailer", "individual"],
        customer: ["sabhasad", "farmer", "retailer"],
        mantri: ["distributor", "wholesaler"],
        distributor: ["mantri", "wholesaler"],
        doctor: ["dr", "physician", "retailer"],
        shopkeeper: ["retailer", "dealer"],
        "field officer": ["fo", "staff"],
      };

      const synonyms = categorySynonyms[targetCategory] || [];
      for (const syn of synonyms) {
        for (const cKey of Object.keys(matchedRegionRates)) {
          if (cKey.trim().toLowerCase() === syn) {
            const val = Number(matchedRegionRates[cKey]);
            if (!isNaN(val) && val > 0) {
              return val;
            }
          }
        }
      }
    }
  }

  // 4. Region specific column fallback (rate_gujarat, rate_maharashtra, rate_mp)
  const regLower = (region || "Gujarat").trim().toLowerCase();
  const rKey = regLower === "madhya pradesh" ? "mp" : regLower;
  const baseField = `rate_${rKey}` as keyof typeof product;
  if (product[baseField] && Number(product[baseField]) > 0) {
    return Number(product[baseField]);
  }

  // 5. Standard rate fallback
  if (product.standard_rate && Number(product.standard_rate) > 0) {
    return Number(product.standard_rate);
  }

  // 6. rate_gujarat fallback
  if (product.rate_gujarat && Number(product.rate_gujarat) > 0) {
    return Number(product.rate_gujarat);
  }

  return 0;
}
