import { NextFunction, Request, Response } from "express";
import RoleBasePermission from "../models/roleBasePermission.model";
import User from "../models/user.model";
import { col, fn, Op } from "sequelize";

// GET all roles for dropdown
export const getRoleBasePermissionDrops = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const roles = await RoleBasePermission.findAll({
      attributes: ["role"],
      where: {
        role: {
          [Op.notIn]: ["user", "corporateUser", "corporate", "superadmin"],
        }, // Exclude user, corporateUser, and corporate roles
      },
    });
    const roleList = roles.map((r) => r.role);

    return res.status(200).json({
      success: true,
      message: "Roles fetched successfully for dropdown",
      data: roleList,
    });
  } catch (error) {
    next(error);
  }
};

// GET paginated roles with optional search

export const getRoleBasePermissions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Pagination
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 10);
    const offset = (page - 1) * limit;

    // Searching keyword
    const search = (req.query.search as string) || "";
    const where: any = {
      role: {
        [Op.notIn]: ["user", "corporateUser", "corporate", "superadmin"],
      }, // Exclude user, corporateUser, and corporate roles
    };

    if (search) {
      where[Op.or] = [
        { role: { [Op.iLike]: `%${search}%` } },
        { permissions: { [Op.contains]: [search] } }, // for ARRAY column search
      ];
    }

    // Fetch paginated roles
    const { count: total, rows: items } =
      await RoleBasePermission.findAndCountAll({
        where,
        limit,
        offset,
        order: [["createdAt", "DESC"]],
      });

    // Count how many users have each role (for embedding)
    const roleCounts = await User.findAll({
      attributes: ["role", [fn("COUNT", col("id")), "count"]],
      group: ["role"],
      raw: true,
    });

    // Create a lookup map → { admin: 3, manager: 2, ... }
    const countMap = roleCounts.reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.role] = Number(row.count);
        return acc;
      },
      {}
    );

    // Merge count into each role record
    const enrichedItems = items.map((item: any) => {
      const plain = item.toJSON ? item.toJSON() : item;
      return { ...plain, count: countMap[plain.role] || 0 };
    });

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      message: "All role permissions fetched successfully",
      meta: { total, page, limit, totalPages },
      data: enrichedItems,
    });
  } catch (error) {
    next(error);
  }
};
// GET role by role name
export const getRoleBasePermissionByRole = async (
  req: Request<{ role: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const item = await RoleBasePermission.findOne({
      where: { role: req.params.role },
    });
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Role permission not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Role permission fetched successfully",
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

// CREATE a new role
export const createRoleBasePermission = async (
  req: Request<{}, {}, Partial<RoleBasePermission>>,
  res: Response,
  next: NextFunction
) => {
  try {
    let { role, permissions } = req.body;
    if (!role || !permissions) {
      return res.status(400).json({
        success: false,
        message: "Validation failed. Please check your input.",
      });
    }

    // Convert role to lowercase
    role = role.toLowerCase();

    const existing = await RoleBasePermission.findOne({ where: { role } });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Role permission already exists" });
    }

    const newItem = await RoleBasePermission.create({ role, permissions });

    return res.status(201).json({
      success: true,
      message: "Role permission created successfully",
      data: newItem,
    });
  } catch (error) {
    next(error);
  }
};

// UPDATE a role
export const updateRoleBasePermission = async (
  req: Request<{}, {}, Partial<RoleBasePermission>>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { role, ...updates } = req.body;

    if (!role) {
      return res
        .status(400)
        .json({ success: false, message: "Role is required" });
    }

    const [updatedCount, updatedRows] = await RoleBasePermission.update(
      updates,
      {
        where: { role },
        returning: true,
      }
    );

    if (updatedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Role permission not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Role permission updated successfully",
      data: updatedRows[0],
    });
  } catch (error) {
    next(error);
  }
};

// DELETE a role
export const deleteRoleBasePermission = async (
  req: Request<{ role: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const deletedCount = await RoleBasePermission.destroy({
      where: { role: req.params.role },
    });
    if (deletedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Role permission not found" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Role permission deleted successfully" });
  } catch (error) {
    next(error);
  }
};
