// utils/codeHelper.ts
export function generatePaymentCode(length = 10): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Reorders items in a list to ensure unique sequential ordering
 * @param items Array of items with orderBy property
 * @param itemId ID of the item being reordered
 * @param newOrder New order value for the item
 * @returns Updated array with unique sequential ordering
 */
export function reorderItems<T extends { id: number; orderBy: number }>(
  items: T[],
  itemId: number,
  newOrder: number
): T[] {
  // Sort items by current order
  const sortedItems = [...items].sort((a, b) => a.orderBy - b.orderBy);

  // Find the item being reordered
  const itemIndex = sortedItems.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) return sortedItems;

  // Remove the item from its current position
  const [movedItem] = sortedItems.splice(itemIndex, 1);

  // Ensure newOrder is within bounds
  const clampedNewOrder = Math.max(0, Math.min(newOrder, sortedItems.length));

  // Insert at new position
  sortedItems.splice(clampedNewOrder, 0, movedItem!);

  // Renumber all items sequentially
  return sortedItems.map((item, index) => ({
    ...item,
    orderBy: index,
  }));
}
