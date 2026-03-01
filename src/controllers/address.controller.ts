import { Request, Response, NextFunction } from "express";
import Address from "../models/address.model";
import User from "../models/user.model";

/**
 * Helper: resolve the target user ID depending on role
 */
export async function resolveTargetUserId(req: Request): Promise<number> {
  const loggedUser = req.user!;
  let targetUserId = loggedUser.id;

  // 🧩 Superadmin and Admin can act on any user if userId is provided (body or query)
  if (
    (loggedUser.role === "superadmin" || loggedUser.role === "admin") &&
    (req.body.userId || req.query.userId)
  ) {
    targetUserId = Number(req.body.userId || req.query.userId);
    return targetUserId;
  }

  // 🧩 Corporate can act only on its own corporate users
  if (
    loggedUser.role === "corporate" &&
    (req.body.userId || req.query.userId)
  ) {
    const requestedId = Number(req.body.userId || req.query.userId);
    const u = await User.findByPk(requestedId);
    if (!u || u.corporateId !== loggedUser.id) {
      throw new Error("Forbidden");
    }
    targetUserId = requestedId;
  }

  return targetUserId;
}

/**
 * Create Address
 */
export const createAddress = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const targetUserId = await resolveTargetUserId(req);
    const user = await User.findByPk(targetUserId!);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { addressType, email } = req.body;
    if (!["shipping", "business"].includes(addressType)) {
      return res.status(400).json({ message: "Invalid address type" });
    }

    if (req.body.isDefault) {
      await Address.update(
        { isDefault: false },
        { where: { userId: targetUserId!, addressType } }
      );
    }

    // Use city as-is and ensure state is lowercase for consistency
    const normalizedCity = req.body.city;
    const normalizedState = req.body.state
      ? req.body.state.toLowerCase()
      : req.body.state;

    const address = await Address.create({
      ...req.body,
      userId: targetUserId,
      email: email ?? user.email,
      city: normalizedCity,
      state: normalizedState,
    });

    return res.status(201).json({ success: true, data: address });
  } catch (err: any) {
    if (err.message === "Forbidden") {
      return res.status(403).json({ message: "Forbidden" });
    }
    next(err);
  }
};

/**
 * Get Address by ID
 */
export const getAddressById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const address = await Address.findOne({
      where: { id: req.params.id },
    });
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }
    return res.status(200).json({ success: true, data: address });
  } catch (err) {
    next(err);
  }
};

/**
 * List Addresses
 */
export const listAddresses = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const targetUserId = await resolveTargetUserId(req);

    const addresses = await Address.findAll({
      where: { userId: targetUserId },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({ success: true, data: addresses });
  } catch (err: any) {
    if (err.message === "Forbidden") {
      return res.status(403).json({ message: "Forbidden" });
    }
    next(err);
  }
};

/**
 * Update Address
 */
export const updateAddress = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const targetUserId = await resolveTargetUserId(req);

    const address = await Address.findOne({
      where: { id: req.params.id, userId: targetUserId! },
    });
    if (!address) return res.status(404).json({ message: "Address not found" });

    if (req.body.isDefault) {
      await Address.update(
        { isDefault: false },
        { where: { userId: targetUserId!, addressType: address.addressType } }
      );
    }

    // Use city as-is and ensure state is lowercase for consistency
    const normalizedCity = req.body.city;
    const normalizedState = req.body.state
      ? req.body.state.toLowerCase()
      : req.body.state;

    //  If no email in body, fallback to current user's email
    let emailToUse = req.body.email;
    if (!emailToUse) {
      const user = await User.findByPk(targetUserId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      emailToUse = user.email;
    }

    await address.update({
      ...req.body,
      email: emailToUse,
      city: normalizedCity,
      state: normalizedState,
    });

    return res.status(200).json({ success: true, data: address });
  } catch (err: any) {
    if (err.message === "Forbidden") {
      return res.status(403).json({ message: "Forbidden" });
    }
    next(err);
  }
};

/**
 * Delete Address
 */
export const deleteAddress = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const targetUserId = await resolveTargetUserId(req);

    const address = await Address.findOne({
      where: { id: req.params.id, userId: targetUserId! },
    });
    if (!address) return res.status(404).json({ message: "Address not found" });

    await address.destroy();
    return res.status(200).json({ success: true });
  } catch (err: any) {
    if (err.message === "Forbidden") {
      return res.status(403).json({ message: "Forbidden" });
    }
    next(err);
  }
};
