import { Request, Response, NextFunction } from "express";
import { Op } from "sequelize";
import Option from "../models/option.model";

// CREATE OPTION
export const createOption = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, optionType, status, orderBy } = req.body;
    if (!name || !optionType) {
      return res
        .status(400)
        .json({ message: "name and optionType are required" });
    }

    // If orderBy is not provided, set it to 0 initially (will be renumbered by hooks)
    const option = await Option.create({
      name,
      optionType,
      status,
      orderBy: orderBy !== undefined ? orderBy : 0,
    });
    return res.status(201).json({ success: true, data: option });
  } catch (err) {
    next(err);
  }
};

// LIST OPTIONS
export const listOptions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "50"));
    const offset = (page - 1) * limit;

    const { search, status, type } = req.query;

    // build dynamic where clause
    const where: any = {};

    // ✅ status filter (supports multi-value)
    if (status) {
      const statuses = (status as string).split(",");
      where.status = statuses.length > 1 ? { [Op.in]: statuses } : statuses[0];
    }

    // ✅ search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { optionType: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (type) {
      const types = (type as string).split(",");
      where.optionType = types.length > 1 ? { [Op.in]: types } : types[0];
    }

    const { count: total, rows: options } = await Option.findAndCountAll({
      where,
      limit,
      offset,
      order: [
        ["orderBy", "ASC"],
        ["id", "ASC"],
      ], // Order by orderBy field first, then by id
    });

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: options,
    });
  } catch (err) {
    next(err);
  }
};

// GET OPTION BY ID
export const getOptionById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const option = await Option.findByPk(req.params.id);
    if (!option) return res.status(404).json({ message: "Option not found" });
    return res.status(200).json({ success: true, data: option });
  } catch (err) {
    next(err);
  }
};

// UPDATE OPTION
export const updateOption = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const option = await Option.findByPk(req.params.id);
    if (!option) return res.status(404).json({ message: "Option not found" });

    await option.update(req.body);
    return res.status(200).json({ success: true, data: option });
  } catch (err) {
    next(err);
  }
};

// DELETE OPTION
export const deleteOption = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const optionId = Number(req.params.id);
    const option = await Option.findByPk(optionId);
    if (!option) {
      return res.status(404).json({ message: "Option not found" });
    }

    // --- Check references ---

    // 1. Products using this option in sizes[]
    const productsUsing = await Option.sequelize!.query(
      `SELECT id, title 
   FROM "product" 
   WHERE sizes::jsonb @> CAST(:arr AS jsonb) 
   LIMIT 1`, // Use raw query type
      { replacements: { arr: JSON.stringify([optionId]) }, type: "SELECT" }
    );

    if (productsUsing.length) {
      return res.status(400).json({
        success: false,
        message: `Option is linked to product: ${
          (productsUsing[0] as any).title
        }. Cannot delete.`,
      });
    }

    // 2. CartProducts (sizes JSON)
    const cartProductsUsing = await Option.sequelize!.query(
      `SELECT id FROM "cart_product" WHERE sizes::text LIKE :pattern LIMIT 1`,
      { replacements: { pattern: '%"' + optionId + '"%' }, type: "SELECT" }
    );
    if (cartProductsUsing.length) {
      return res.status(400).json({
        success: false,
        message: `Option is linked to cart products. Cannot delete.`,
      });
    }

    // 3. OrderProducts (sizes JSON)
    const orderProductsUsing = await Option.sequelize!.query(
      `SELECT id FROM "order_products" WHERE sizes::text LIKE :pattern LIMIT 1`,
      { replacements: { pattern: '%"' + optionId + '"%' }, type: "SELECT" }
    );
    if (orderProductsUsing.length) {
      return res.status(400).json({
        success: false,
        message: `Option is linked to past orders. Cannot delete.`,
      });
    }

    // --- If no links, delete safely ---
    await option.destroy();
    return res.status(200).json({ success: true, message: "Option deleted" });
  } catch (err) {
    next(err);
  }
};

/** 🟢 Public API — Get active color options for FE filter */
export const listColorOptionsPublic = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search } = req.query;

    const where: any = {
      optionType: "color",
      status: "active",
    };

    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }

    const colors = await Option.findAll({
      where,
      order: [
        ["orderBy", "ASC"],
        ["id", "ASC"],
      ], // Order by orderBy field first, then by id
      attributes: ["id", "name", "orderBy"],
    });

    return res.status(200).json({
      success: true,
      data: colors,
    });
  } catch (err) {
    next(err);
  }
};
