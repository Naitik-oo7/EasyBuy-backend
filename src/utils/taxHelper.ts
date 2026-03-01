// interface TaxResult {
//   basePrice: number;
//   taxRate: number;
//   taxAmount: number;
//   cgst?: number;
//   sgst?: number;
//   igst?: number;
//   total: number;
// }

// // Helper function for consistent rounding
// const round2 = (v: number) => Math.round(v * 100) / 100;

// /**
//  * Calculate GST based on unit price and buyer/seller state
//  * Tax rate is determined by unit price, but tax is calculated on total cost
//  */
// export function calculateTax(
//   unitPrice: number,
//   quantity: number,
//   embroideryPrice: number,
//   buyerState: string,
//   sellerState: string
// ) {
//   // Ensure states are lowercase for consistent comparison
//   const normalizedBuyerState = buyerState.toLowerCase();
//   const normalizedSellerState = sellerState.toLowerCase();

//   // Determine tax rate based on unit price only
//   const taxRate = unitPrice > 2500 ? 18 : 5;

//   // Calculate total cost for tax calculation
//   const totalUnitCost = unitPrice + embroideryPrice;
//   const totalPrice = totalUnitCost * quantity;

//   // Calculate tax on total price but using the unit price determined rate
//   const taxAmount = round2((totalPrice * taxRate) / 100);
//   const sameState = normalizedBuyerState === normalizedSellerState;

//   if (sameState) {
//     const cgst = round2(taxAmount / 2);
//     const sgst = round2(taxAmount / 2);
//     return {
//       taxRate,
//       taxAmount,
//       cgst,
//       sgst,
//       igst: 0,
//       total: round2(totalPrice + taxAmount),
//     };
//   } else {
//     return {
//       taxRate,
//       taxAmount,
//       cgst: 0,
//       sgst: 0,
//       igst: taxAmount,
//       total: round2(totalPrice + taxAmount),
//     };
//   }
// }
interface TaxResult {
  basePrice: number;
  taxRate: number;
  taxAmount: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  total: number;
}

// Helper function for consistent rounding
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Calculate GST based on unit price and buyer/seller state
 * Tax rate is determined by unit price, but tax is calculated on total cost
 */
export function calculateTax(
  unitPrice: number,
  quantity: number,
  embroideryPrice: number,
  buyerState?: string,
  sellerState: string = "delhi"
) {
  // Ensure states are lowercase for consistent comparison
  const normalizedSellerState = sellerState.toLowerCase();
  const normalizedBuyerState = buyerState
    ? buyerState.toLowerCase()
    : undefined;

  // Determine tax rate based on unit price only
  const taxRate = unitPrice > 2500 ? 18 : 5;

  // Calculate total cost for tax calculation
  const totalUnitCost = unitPrice + embroideryPrice;
  const totalPrice = totalUnitCost * quantity;

  // Calculate tax on total price but using the unit price determined rate
  const taxAmount = round2((totalPrice * taxRate) / 100);

  // Handle missing or same-state buyer
  if (!normalizedBuyerState) {
    // ✅ No buyer state provided → apply tax without CGST/SGST/IGST split
    return {
      taxRate,
      taxAmount,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: round2(totalPrice + taxAmount),
    };
  }

  const sameState = normalizedBuyerState === normalizedSellerState;

  if (sameState) {
    const cgst = round2(taxAmount / 2);
    const sgst = round2(taxAmount / 2);
    return {
      taxRate,
      taxAmount,
      cgst,
      sgst,
      igst: 0,
      total: round2(totalPrice + taxAmount),
    };
  } else {
    return {
      taxRate,
      taxAmount,
      cgst: 0,
      sgst: 0,
      igst: taxAmount,
      total: round2(totalPrice + taxAmount),
    };
  }
}
