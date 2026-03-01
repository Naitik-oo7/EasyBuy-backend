export const attachBulkOrderPrices = (product: any) => {
  if (!product) return product;

  // Always work with plain object
  const plainProduct =
    typeof product.toJSON === "function" ? product.toJSON() : product;

  const basePrice = plainProduct.price;

  if (plainProduct.bulkOrders && Array.isArray(plainProduct.bulkOrders)) {
    plainProduct.bulkOrders = plainProduct.bulkOrders.map((b: any) => {
      const bulk = typeof b.toJSON === "function" ? b.toJSON() : b; // safe convert
      return {
        ...bulk,
        price: Math.round(basePrice - (basePrice * bulk.percentage) / 100),
      };
    });

    // ✅ Find 5-pcs price (or lowest quantity tier)
    const bulk5 =
      plainProduct.bulkOrders.find((b: any) => b.quantity === 5) ||
      plainProduct.bulkOrders[0];

    // ✅ Add displayPrice separately — do not modify base price
    if (bulk5?.price) {
      plainProduct.displayPrice = bulk5.price;
    } else {
      plainProduct.displayPrice = basePrice; // fallback
    }
  } else {
    plainProduct.displayPrice = basePrice; // no bulkOrders case
  }

  return plainProduct;
};
