import { Request, Response, NextFunction } from "express";
import ShippingRate from "../models/shippingRate.model";

// Create shipping rate
export const createShippingRate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { state, standardRate, additional_rate, status } = req.body;
    if (!state || !standardRate) {
      return res
        .status(400)
        .json({ message: "state and standardRate are required" });
    }

    // Ensure state is lowercase for consistency
    const normalizedState = state.toLowerCase();

    const rate = await ShippingRate.create({
      state: normalizedState,
      standardRate,
      additional_rate,
      status: status || "active",
    });
    return res.status(201).json({ success: true, data: rate });
  } catch (err) {
    next(err);
  }
};

// List all shipping rates (with optional search)
export const listShippingRates = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { state, status } = req.query;
    const where: any = {};

    // Ensure state search is lowercase for consistency
    if (state) where.state = (state as string).toLowerCase();
    if (status) where.status = status;

    const rates = await ShippingRate.findAll({
      where,
      order: [["state", "ASC"]],
    });
    return res.status(200).json({ success: true, data: rates });
  } catch (err) {
    next(err);
  }
};

// Get list of all states from shipping rates
export const listShippingStates = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const states = await ShippingRate.findAll({
      attributes: ["state"],
      group: ["state"],
      order: [["state", "ASC"]],
      raw: true,
    });

    // Extract just the state names from the result
    const stateList = states.map((record: any) => record.state);

    return res.status(200).json({ success: true, data: stateList });
  } catch (err) {
    next(err);
  }
};

// Get shipping rate by ID
export const getShippingRateById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const rate = await ShippingRate.findByPk(req.params.id);
    if (!rate)
      return res.status(404).json({ message: "Shipping rate not found" });
    return res.status(200).json({ success: true, data: rate });
  } catch (err) {
    next(err);
  }
};

// Update shipping rate
export const updateShippingRate = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const rate = await ShippingRate.findByPk(req.params.id);
    if (!rate)
      return res.status(404).json({ message: "Shipping rate not found" });

    await rate.update(req.body);
    return res.status(200).json({ success: true, data: rate });
  } catch (err) {
    next(err);
  }
};

// Delete shipping rate
export const deleteShippingRate = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const rate = await ShippingRate.findByPk(req.params.id);
    if (!rate)
      return res.status(404).json({ message: "Shipping rate not found" });

    await rate.destroy();
    return res
      .status(200)
      .json({ success: true, message: "Shipping rate deleted successfully" });
  } catch (err) {
    next(err);
  }
};
