import { Request, Response, NextFunction } from "express";
import Gallery from "../models/gallery.model";
import { getFileUrl, singleUpload, deleteImage } from "../utils/awsS3";
import { Op } from "sequelize";

export const createGalleryItem = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { type, videoUrl, title, status, description } = req.body;

    if (!type) return res.status(400).json({ message: "type is required" });
    if (!title) return res.status(400).json({ message: "title is required" });
    let imageKey: string | null = null;

    if (type === "image") {
      if (!req.file)
        return res.status(400).json({ message: "Image is required" });
      imageKey = await singleUpload(req.file, "gallery");
    } else if (type === "video") {
      if (!videoUrl)
        return res.status(400).json({ message: "videoUrl is required" });
    }

    const item = await Gallery.create({
      type,
      title,
      description: description || null,
      image: imageKey,
      videoUrl: type === "video" ? videoUrl : null,
      status,
      orderBy: 0,
    });

    return res
      .status(201)
      .json({ success: true, message: "Gallery item created successfully" });
  } catch (err) {
    next(err);
  }
};

export const listGalleryAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";
    const type = (req.query.type as string) || "";

    const where: any = {};

    if (search) {
      where.title = { [Op.iLike]: `%${search}%` };
    }

    if (status) {
      where.status = status;
    }
    if (type) {
      where.type = type;
    }

    const { count, rows } = await Gallery.findAndCountAll({
      where,
      order: [["orderBy", "ASC"]],
      limit,
      offset,
    });

    const formatted = rows.map((i: any) => ({
      ...i.toJSON(),
      image: getFileUrl(i.image, "gallery"),
    }));

    return res.json({
      success: true,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
};

export const listGalleryPublic = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const where: any = { status: "active" };

    const { count, rows } = await Gallery.findAndCountAll({
      where,
      order: [["orderBy", "ASC"]],
      limit,
      offset,
    });

    const formatted = rows.map((i: any) => ({
      ...i.toJSON(),
      image: getFileUrl(i.image, "gallery"),
    }));

    return res.json({
      success: true,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
};

export const updateGalleryItem = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const item = await Gallery.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    const { type, videoUrl, status, orderBy, title, description } = req.body;

    if (title) item.title = title;
    if (description !== undefined) item.description = description;

    if (type === "image" && req.file) {
      if (item.image) await deleteImage(item.image);
      const newKey = await singleUpload(req.file, "gallery");
      item.image = newKey;
    }

    if (type === "video" && videoUrl) {
      item.videoUrl = videoUrl;
      if (item.image) {
        await deleteImage(item.image);
        item.image = null;
      }
    }

    if (type) item.type = type;
    if (status) item.status = status;
    if (orderBy !== undefined) item.orderBy = orderBy;

    await item.save();

    return res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

export const deleteGalleryItem = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const item = await Gallery.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Not found" });

    if (item.image) await deleteImage(item.image);

    await item.destroy();

    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    next(err);
  }
};
