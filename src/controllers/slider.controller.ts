// controllers/slider.controller.ts
import { Request, Response, NextFunction } from "express";
import Slider from "../models/slider.model";
import Category from "../models/category.model";
import { deleteImage, singleUpload, getFileUrl } from "../utils/awsS3";
import { Op } from "sequelize";

// Utility: format slider response
const formatSliderResponse = async (slider: any) => {
  const plain = slider.toJSON ? slider.toJSON() : slider;

  // // If slider has a categoryId, fetch the category to get its slug
  // let categorySlug = null;
  // if (plain.categoryId) {
  //   const category = await Category.findByPk(plain.categoryId, {
  //     attributes: ["slug"],
  //   });
  //   if (category) {
  //     categorySlug = category.slug;
  //   }
  // }

  return {
    id: plain.id,
    title: plain.title,
    description: plain.description,
    type: plain.type,
    metaUrl: plain.metaUrl,
    categoryId: plain.categoryId,
    redirectUrl: plain.redirectUrl || null,
    slug: plain.slug,
    status: plain.status,
    orderBy: plain.orderBy,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
    ...(plain.type === "image"
      ? { image: getFileUrl(plain.url) }
      : { video: getFileUrl(plain.url) }),
  };
};

// Create
export const createSlider = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { title, description, type, metaUrl, redirectUrl } = req.body;
    let file: Express.Multer.File | undefined;

    if (type === "image" && req.files && (req.files as any).image) {
      file = (req.files as any).image[0];
    }
    if (type === "video" && req.files && (req.files as any).video) {
      file = (req.files as any).video[0];
    }
    if (!file) return res.status(400).json({ message: "File is required" });

    const folder = type === "image" ? "sliders/images" : "sliders/videos";
    const key = await singleUpload(file, folder);

    const slider = await Slider.create({
      title,
      description,
      type,
      url: key,
      metaUrl,
      redirectUrl,
      orderBy: req.body.orderBy ?? 0,
    });

    res
      .status(201)
      .json({ success: true, data: await formatSliderResponse(slider) });
  } catch (err) {
    next(err);
  }
};

// List
export const listSliders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const where: any = {};
    if (req.query.type) where.type = req.query.type;
    if (req.query.status) where.status = req.query.status;
    if (req.query.search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${req.query.search}%` } },
        { description: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const { count: total, rows } = await Slider.findAndCountAll({
      where,
      order: [["orderBy", "ASC"]],
      limit,
      offset,
    });

    // Format all sliders with their category slugs
    const formattedSliders = await Promise.all(rows.map(formatSliderResponse));

    res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: formattedSliders,
    });
  } catch (err) {
    next(err);
  }
};

// Update
export const updateSlider = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const slider = await Slider.findByPk(req.params.id);
    if (!slider) return res.status(404).json({ message: "Not found" });

    const { title, description, type, status, metaUrl, redirectUrl, orderBy } =
      req.body;
    let file: Express.Multer.File | undefined;

    if (type === "image" && req.files && (req.files as any).image) {
      file = (req.files as any).image[0];
    }
    if (type === "video" && req.files && (req.files as any).video) {
      file = (req.files as any).video[0];
    }

    let key = slider.url;
    if (file) {
      await deleteImage(slider.url);
      const folder = type === "image" ? "sliders/images" : "sliders/videos";
      key = await singleUpload(file, folder);
    }

    await slider.update({
      title: title ?? slider.title,
      description: description ?? slider.description,
      type: type ?? slider.type,
      status: status ?? slider.status,
      metaUrl: metaUrl ?? slider.metaUrl,
      redirectUrl: redirectUrl ?? null,
      url: key,
      orderBy: orderBy ?? slider.orderBy,
    });

    res.json({ success: true, data: await formatSliderResponse(slider) });
  } catch (err) {
    next(err);
  }
};

// Delete
export const deleteSlider = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const slider = await Slider.findByPk(req.params.id);
    if (!slider) return res.status(404).json({ message: "Not found" });

    await deleteImage(slider.url);
    await slider.destroy();

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// Public: List only active sliders for frontend
export const listActiveSliders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sliders = await Slider.findAll({
      where: { status: "active" },
      order: [["orderBy", "ASC"]],
    });

    // Format all sliders with their category slugs
    const formattedSliders = await Promise.all(
      sliders.map(formatSliderResponse)
    );

    res.status(200).json({ success: true, data: formattedSliders });
  } catch (err) {
    next(err);
  }
};
