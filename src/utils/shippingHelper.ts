import ShippingRate from "../models/shippingRate.model";

// Helper function for consistent rounding
const round2 = (v: number) => Math.round(v * 100) / 100;

export const calculateShipping = async (weight: number, state: string) => {
  // Ensure state is lowercase for consistent lookup
  const normalizedState = state.toLowerCase();

  const rate = await ShippingRate.findOne({
    where: { state: normalizedState, status: "active" },
  });
  if (!rate) throw new Error(`No shipping rate found for state: ${state}`);

  const weightUnits = Math.ceil(weight / 500); // per 500g
  let taxableAmount: number;

  if (weightUnits < 1) {
    taxableAmount = rate.standardRate;
  } else {
    taxableAmount =
      rate.standardRate + (weightUnits - 1) * rate.additional_rate;
  }

  const finalAmount = round2(taxableAmount);
  const taxAmount = round2(finalAmount * 0.18); // GST on shipping

  return {
    taxableAmount: round2(taxableAmount),
    finalAmount,
    taxAmount,
    totalWithTax: round2(finalAmount + taxAmount),
  };
};
