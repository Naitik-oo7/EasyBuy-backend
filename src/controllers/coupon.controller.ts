// controllers/coupon.controller.ts
import { Request, Response, NextFunction } from "express";
import Coupon from "../models/coupon.model";
import CouponUsage from "../models/couponUsage.model";
import { Op } from "sequelize";

// CREATE coupon
export const createCoupon = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code, discount, type, status, maxUsage } = req.body;

    if (!code || !discount) {
      return res
        .status(400)
        .json({ message: "code and discount are required" });
    }

    // Validate coupon type if provided
    if (type && type !== "fixed" && type !== "percentage") {
      return res
        .status(400)
        .json({
          message: "Coupon type must be either 'fixed' or 'percentage'",
        });
    }

    // Validate discount value based on type
    if (type === "percentage" && (discount <= 0 || discount > 100)) {
      return res
        .status(400)
        .json({ message: "Percentage discount must be between 1 and 100" });
    }

    if (type === "fixed" && discount <= 0) {
      return res
        .status(400)
        .json({ message: "Fixed discount must be greater than 0" });
    }

    const exists = await Coupon.findOne({ where: { code } });
    if (exists) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    // Ensure type is stored in lowercase
    const normalizedType = type ? type.toLowerCase() : type;

    const coupon = await Coupon.create({
      code,
      discount,
      type: normalizedType,
      status,
      maxUsage,
      totalUsage: 0, // default start
    });

    return res.status(201).json({ success: true, data: coupon });
  } catch (err) {
    next(err);
  }
};

// LIST coupons
export const listCoupons = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const { search, status } = req.query;

    const where: Record<string | symbol, any> = {};

    // ✅ Apply status filter if provided (else return all)
    if (status && typeof status === "string" && status.trim() !== "") {
      where.status = status.trim();
    }

    // 🔍 Apply search filter (by coupon code)
    if (search && typeof search === "string" && search.trim() !== "") {
      where[Op.or] = [{ code: { [Op.iLike]: `%${search.trim()}%` } }];
    }

    const { count: total, rows: coupons } = await Coupon.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: coupons,
    });
  } catch (err) {
    next(err);
  }
};

// GET coupon by ID
export const getCouponById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    return res.status(200).json({ success: true, data: coupon });
  } catch (err) {
    next(err);
  }
};

// UPDATE coupon
export const updateCoupon = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });

    // Validate coupon type if provided
    if (
      req.body.type &&
      req.body.type !== "fixed" &&
      req.body.type !== "percentage"
    ) {
      return res
        .status(400)
        .json({
          message: "Coupon type must be either 'fixed' or 'percentage'",
        });
    }

    // Validate discount value based on type if both type and discount are provided
    if (req.body.type && req.body.discount) {
      if (
        req.body.type === "percentage" &&
        (req.body.discount <= 0 || req.body.discount > 100)
      ) {
        return res
          .status(400)
          .json({ message: "Percentage discount must be between 1 and 100" });
      }

      if (req.body.type === "fixed" && req.body.discount <= 0) {
        return res
          .status(400)
          .json({ message: "Fixed discount must be greater than 0" });
      }
    } else if (req.body.discount) {
      // If only discount is provided, validate against existing type
      if (
        coupon.type === "percentage" &&
        (req.body.discount <= 0 || req.body.discount > 100)
      ) {
        return res
          .status(400)
          .json({ message: "Percentage discount must be between 1 and 100" });
      }

      if (coupon.type === "fixed" && req.body.discount <= 0) {
        return res
          .status(400)
          .json({ message: "Fixed discount must be greater than 0" });
      }
    }

    // Ensure type is stored in lowercase if provided
    if (req.body.type) {
      req.body.type = req.body.type.toLowerCase();
    }

    await coupon.update(req.body);
    return res.status(200).json({ success: true, data: coupon });
  } catch (err) {
    next(err);
  }
};

// DELETE coupon
export const deleteCoupon = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });

    await coupon.destroy();
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * APPLY coupon (validate + attach to user/cart later)
 */
export const applyCoupon = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code } = req.body;
    const userId = req.user?.id!; // assuming user ID is in req.user from auth middleware

    if (!code) {
      return res.status(400).json({ message: "Coupon code is required" });
    }

    const coupon = await Coupon.findOne({ where: { code } });
    if (!coupon) {
      return res.status(404).json({ message: "Invalid coupon code" });
    }

    if (coupon.status !== "active") {
      return res.status(400).json({ message: "Coupon is inactive" });
    }

    // Check usage for this user
    let usage = await CouponUsage.findOne({
      where: { couponId: coupon.id, userId: userId },
    });

    if (!usage) {
      usage = await CouponUsage.create({
        couponId: coupon.id,
        userId: userId,
        usedCount: 0,
      });
    }

    if (coupon.maxUsage && usage.usedCount >= coupon.maxUsage) {
      return res
        .status(400)
        .json({ message: "Coupon usage limit reached for this user" });
    }

    return res.status(200).json({ success: true, data: coupon });
  } catch (err) {
    next(err);
  }
};

/**
 * MARK coupon as used (call this after successful order)
 */
export const markCouponUsed = async (couponId: number, userId: number) => {
  const coupon = await Coupon.findByPk(couponId);
  if (!coupon) return;

  // Update total usage
  await coupon.update({ totalUsage: coupon.totalUsage + 1 });

  // Update user usage
  let usage = await CouponUsage.findOne({
    where: { couponId: couponId, userId: userId },
  });
  if (!usage) {
    usage = await CouponUsage.create({
      couponId: couponId,
      userId: userId,
      usedCount: 0,
    });
  }
  await usage.update({ usedCount: usage.usedCount + 1 });
};
