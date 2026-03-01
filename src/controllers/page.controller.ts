import { Request, Response, NextFunction } from "express";
import Page from "../models/page.model";
import { singleUpload, deleteImage, getFileUrl } from "../utils/awsS3";
import { Op } from "sequelize";
import { slugify } from "../utils/slugify";

// CREATE Page
export const createPage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const files = req.files as any;

    let image: string | undefined;
    let video: string | undefined;
    if (files) {
      // Validate that only one of image or video can exist
      if (files["image"] && files["video"]) {
        return res.status(400).json({
          message: "Only one of image or video can be uploaded, not both",
        });
      }

      if (files["image"])
        image = await singleUpload(files["image"][0], "pages/images");
      if (files["video"])
        video = await singleUpload(files["video"][0], "pages/videos");
    }

    const slug = req.body.slug
      ? slugify(req.body.slug)
      : slugify(req.body.title);

    const page = await Page.create({ ...req.body, image, video, slug });

    const jsonPage = page.toJSON();
    jsonPage.image = getFileUrl(jsonPage.image ?? null);
    jsonPage.video = getFileUrl(jsonPage.video ?? null);

    return res.status(201).json({ success: true, data: jsonPage });
  } catch (err) {
    next(err);
  }
};

// LIST Pages

export const listPages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Pagination params
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    // Filters
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || undefined;

    const where: any = {};

    // 🔍 Searching (title, description, meta fields)
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { metaTitle: { [Op.iLike]: `%${search}%` } },
        { metaDescription: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // ✅ Status filter
    if (status) {
      where.status = status;
    }

    // Fetch with count
    const { count: total, rows: pages } = await Page.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    // Normalize file URLs
    const normalized = pages.map((p) => {
      const json = p.toJSON();
      json.image = getFileUrl(json.image ?? null, "pages/images");
      json.video = getFileUrl(json.video ?? null, "pages/videos");
      return json;
    });

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: normalized,
    });
  } catch (err) {
    next(err);
  }
};

// GET Page by ID
export const getPageById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = await Page.findByPk(req.params.id);
    if (!page) return res.status(404).json({ message: "Page not found" });

    const jsonPage = page.toJSON();
    jsonPage.image = getFileUrl(jsonPage.image ?? null, "pages/images");
    jsonPage.video = getFileUrl(jsonPage.video ?? null, "pages/videos");

    return res.status(200).json({ success: true, data: jsonPage });
  } catch (err) {
    next(err);
  }
};

// UPDATE Page
export const updatePage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = await Page.findByPk(req.params.id);
    if (!page) return res.status(404).json({ message: "Page not found" });

    const files = req.files as any;

    // Validate that only one of image or video can exist
    if (files && files["image"] && files["video"]) {
      return res.status(400).json({
        message: "Only one of image or video can be uploaded, not both",
      });
    }

    // Handle file deletions when fields are explicitly set to null
    if (req.body.image === null && page.image) {
      try {
        await deleteImage(page.image);
      } catch (err) {
        console.error("Error deleting image:", err);
      }
      req.body.image = null;
    }

    if (req.body.video === null && page.video) {
      try {
        await deleteImage(page.video);
      } catch (err) {
        console.error("Error deleting video:", err);
      }
      req.body.video = null;
    }

    if (files) {
      if (files["image"]) {
        if (page.image) {
          try {
            await deleteImage(page.image);
          } catch {}
        }
        const key = await singleUpload(files["image"][0], "pages/images");

        req.body.image = key;
      }

      if (files["video"]) {
        if (page.video) {
          try {
            await deleteImage(page.video);
          } catch {}
        }
        const key = await singleUpload(files["video"][0], "pages/videos");

        req.body.video = key;
      }
    }

    await page.update(req.body);

    const jsonPage = page.toJSON();
    jsonPage.image = getFileUrl(jsonPage.image ?? null, "pages/images");
    jsonPage.video = getFileUrl(jsonPage.video ?? null, "pages/videos");

    return res.status(200).json({ success: true, data: jsonPage });
  } catch (err) {
    next(err);
  }
};

// DELETE Page
export const deletePage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = await Page.findByPk(req.params.id);
    if (!page) return res.status(404).json({ message: "Page not found" });

    if (page.image) await deleteImage(page.image);
    if (page.video) await deleteImage(page.video);

    await page.destroy();
    return res
      .status(200)
      .json({ success: true, message: "Page deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// GET Page by slug (public)
export const getPageBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = await Page.findOne({
      where: { slug: req.params.slug, status: "active" },
    });

    if (!page) return res.status(404).json({ message: "Page not found" });

    const jsonPage = page.toJSON();
    jsonPage.image = getFileUrl(jsonPage.image ?? null, "pages/images");
    jsonPage.video = getFileUrl(jsonPage.video ?? null, "pages/videos");

    return res.status(200).json({ success: true, data: jsonPage });
  } catch (err) {
    next(err);
  }
};

// PUBLIC LIST Pages (title and slug only)
export const listPublicPages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const pages = await Page.findAll({
      where: { status: "active" },
      attributes: ["title", "slug"],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: pages,
    });
  } catch (err) {
    next(err);
  }
};
