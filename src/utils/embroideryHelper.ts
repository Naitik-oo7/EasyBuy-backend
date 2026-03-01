// utils/embroideryHelper.ts

/**
 * Tiered embroidery charges (per piece) based on quantity
 * Example:
 * - qty >= 20 → 50 per piece
 * - qty >= 5  → 75 per piece
 * - qty >= 1  → 150 per piece
 */
export const EMBROIDERY_CHARGES: { minQty: number; charge: number }[] = [
  { minQty: 20, charge: 50 },
  { minQty: 5, charge: 75 },
  { minQty: 1, charge: 150 },
];

/**
 * Calculate total embroidery charge for a quantity.
 * Returns total charge (not per-unit).
 */
export const calculateEmbroideryCharge = (quantity: number): number => {
  for (const tier of EMBROIDERY_CHARGES) {
    if (quantity >= tier.minQty) {
      return tier.charge * quantity;
    }
  }
  return 0;
};
