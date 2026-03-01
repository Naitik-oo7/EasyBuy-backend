import { Request, Response, NextFunction } from "express";
import { col, fn, Op } from "sequelize";
import Tags from "../models/tags.model";
import { slugify } from "../utils/slugify";
import Tagged from "../models/tagged.model";

// CREATE TAG
export const createTag = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    const slug = slugify(name);
    const namespace = "product"; // default for now

    const exists = await Tags.findOne({ where: { slug, namespace } });
    if (exists) {
      return res.status(400).json({ message: "Tag already exists" });
    }

    const tag = await Tags.create({ namespace, slug, name });
    return res.status(201).json({ success: true, data: tag });
  } catch (err) {
    next(err);
  }
};

// LIST TAGS

export const listTags = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const { search } = req.query;

    const where: Record<string | symbol, any> = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count: total, rows } = await Tags.findAndCountAll({
      where,
      limit,
      offset,
      order: [["id", "DESC"]],
      attributes: [
        "id",
        "name",
        "slug",
        [
          fn("COUNT", col("tagged.id")),
          "totalProducts", // 👈 count products per tag
        ],
      ],
      include: [
        {
          model: Tagged,
          as: "tagged",
          attributes: [],
        },
      ],
      group: ["Tags.id"],
      distinct: true,
      subQuery: false,
    });

    return res.status(200).json({
      success: true,
      meta: {
        total: Array.isArray(total) ? total.length : total,
        page,
        limit,
        totalPages: Math.ceil(
          (Array.isArray(total) ? total.length : total) / limit
        ),
      },
      data: rows,
    });
  } catch (err) {
    next(err);
  }
};
// GET TAG BY ID
export const getTagById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const tag = await Tags.findByPk(req.params.id);
    if (!tag) return res.status(404).json({ message: "Tag not found" });
    return res.status(200).json({ success: true, data: tag });
  } catch (err) {
    next(err);
  }
};

// UPDATE TAG
export const updateTag = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const tag = await Tags.findByPk(req.params.id);
    if (!tag) return res.status(404).json({ message: "Tag not found" });

    if (req.body.name) {
      req.body.slug = slugify(req.body.name);
    }

    await tag.update(req.body);
    return res.status(200).json({ success: true, data: tag });
  } catch (err) {
    next(err);
  }
};

// DELETE TAG
export const deleteTag = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const tag = await Tags.findByPk(req.params.id);
    if (!tag) return res.status(404).json({ message: "Tag not found" });

    await tag.destroy();
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};
