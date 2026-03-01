import { Request, Response, NextFunction } from "express";
import CorporateCredit from "../models/corporateCredit.model";
import CorporateCreditHistory from "../models/corporateCreditHistory.model";
import User from "../models/user.model";
import { Op } from "sequelize";
import { getFileUrl } from "../utils/awsS3";

//  Helper: Check if a user’s corporate allows credit system
const isCorporateCreditEnabled = async (userId: number): Promise<boolean> => {
  const user = await User.findByPk(userId);
  if (!user) return false;

  // If the user is a corporate itself
  if (user.role === "corporate") {
    return !!user.creditSystem;
  }

  // If the user is a corporate user → check their parent corporate
  if (user.corporateId) {
    const parentCorporate = await User.findByPk(user.corporateId);
    return !!parentCorporate?.creditSystem;
  }

  return false;
};

//  Assign credit to corporate user
export const assignCredit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, amount } = req.body;
    const corporateId = req.user?.id; // logged-in corporate

    // Check credit system from the corporate (parent)
    const corporate = await User.findByPk(corporateId);
    if (!corporate?.creditSystem) {
      return res
        .status(403)
        .json({ message: "Credit system is disabled for this corporate" });
    }

    // Ensure target user actually belongs to this corporate
    const targetUser = await User.findByPk(userId);
    if (!targetUser || targetUser.corporateId !== corporateId) {
      return res.status(403).json({
        message: "You can only assign credit to your own corporate users",
      });
    }

    // Create or update credit
    let credit = await CorporateCredit.findOne({ where: { userId } });
    if (!credit) {
      credit = await CorporateCredit.create({
        userId,
        corporateId,
        totalCredit: amount,
        usedCredit: 0,
        availableCredit: amount,
      });
    } else {
      credit.totalCredit += amount;
      credit.availableCredit += amount;
      await credit.save();
    }

    //  Log the change
    await CorporateCreditHistory.create({
      userId,
      corporateId,
      change: amount,
      reason: "Credit assigned by corporate",
    });

    return res.status(200).json({ success: true, data: credit });
  } catch (err) {
    next(err);
  }
};

//  Get credit history for a corporate user
export const getCreditHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.params;
    const history = await CorporateCreditHistory.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
};

//  Used internally during checkout
export const deductCredit = async (
  userId: number,
  quantity: number,
  reason: string
) => {
  //  Check if credit system enabled (for user's corporate)
  const allowed = await isCorporateCreditEnabled(userId);
  if (!allowed) {
    throw new Error("Credit system is disabled for this corporate");
  }

  const credit = await CorporateCredit.findOne({ where: { userId } });
  if (!credit || credit.availableCredit < quantity) {
    throw new Error("Insufficient credit");
  }

  credit.usedCredit += quantity;
  credit.availableCredit -= quantity;
  await credit.save();

  await CorporateCreditHistory.create({
    userId,
    corporateId: credit.corporateId,
    change: -quantity,
    reason,
  });

  return credit;
};

//  GET /corporateCredit/me
export const getMyCredit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    //  Check if their corporate allows credit system
    const creditAllowed = await isCorporateCreditEnabled(userId);
    if (!creditAllowed) {
      return res.status(403).json({
        message: "Credit system is disabled for your corporate account",
      });
    }

    // Fetch credit info
    const credit = await CorporateCredit.findOne({ where: { userId } });

    // Fetch credit history
    const history = await CorporateCreditHistory.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: {
        credit: credit || {
          totalCredit: 0,
          usedCredit: 0,
          availableCredit: 0,
        },
        history,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getCorporateUsersCredit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // Only corporate accounts can use this
    if (user.role !== "corporate") {
      return res.status(403).json({
        message: "Only corporate accounts can view their users' credits.",
      });
    }

    // Check if credit system is enabled
    const creditAllowed = await isCorporateCreditEnabled(user.id);
    if (!creditAllowed) {
      return res.status(403).json({
        message: "Credit system is disabled for your corporate account.",
      });
    }

    // 🔹 Pagination setup
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    // 🔹 Search & Filter
    const { search, status } = req.query;
    const where: any = { corporateId: user.id };

    if (status && typeof status === "string") {
      where.status = status;
    }

    if (search && typeof search === "string") {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // 1️⃣ Fetch corporate users
    const { count: total, rows: corporateUsers } = await User.findAndCountAll({
      where,
      attributes: ["id", "name", "email", "status", "image"], // 👈 include image
      order: [["createdAt", "DESC"]],
      offset,
      limit,
    });

    if (corporateUsers.length === 0) {
      return res.status(200).json({
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        data: [],
        message: "No corporate users found for this account.",
      });
    }

    // 2️⃣ Fetch credits for all users
    const userIds = corporateUsers.map((u) => u.id);
    const credits = await CorporateCredit.findAll({
      where: { userId: { [Op.in]: userIds } },
      attributes: ["userId", "totalCredit", "usedCredit", "availableCredit"],
    });

    // 3️⃣ Combine user & credit data
    const data = corporateUsers.map((u) => {
      const c = credits.find((x) => x.userId === u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        image: u.image
          ? getFileUrl(u.image, "users/profile") // 👈 add full URL
          : null,
        totalCredit: c?.totalCredit || 0,
        usedCredit: c?.usedCredit || 0,
        availableCredit: c?.availableCredit || 0,
      };
    });

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data,
    });
  } catch (err) {
    next(err);
  }
};
