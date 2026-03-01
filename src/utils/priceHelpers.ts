// utils/priceHelpers.ts
/**
 * Get applicable bulk price for a product based on quantity
 * Returns { price, tier } or null if no tier matches
 *
 * product: Sequelize instance or plain object with { price, bulkOrders }
 */
export const getApplicableBulkPrice = (product: any, quantity: number) => {
  if (!product) return null;

  const plain =
    typeof product.toJSON === "function" ? product.toJSON() : product;
  const base = Number(plain.price || 0);

  if (!Array.isArray(plain.bulkOrders) || plain.bulkOrders.length === 0) {
    return null;
  }

  // sort bulk tiers in descending order (highest threshold first)
  const tiers = plain.bulkOrders
    .map((b: any) => (typeof b.toJSON === "function" ? b.toJSON() : b))
    .filter((b: any) => typeof b.quantity === "number")
    .sort((a: any, b: any) => b.quantity - a.quantity);

  for (const tier of tiers) {
    if (quantity >= tier.quantity) {
      const price = Math.round(base - (base * Number(tier.percentage)) / 100);
      return { price, tier };
    }
  }

  return null;
};
