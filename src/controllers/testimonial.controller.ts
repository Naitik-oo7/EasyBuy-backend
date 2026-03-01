import { Request, Response, NextFunction } from "express";
import Testimonial from "../models/testimonial.model";
import { deleteImage, singleUpload, getFileUrl } from "../utils/awsS3";
import { Op } from "sequelize";

// Utility: format testimonial response
const formatTestimonialResponse = (testimonial: any) => {
  const plain = testimonial.toJSON ? testimonial.toJSON() : testimonial;
  return {
    id: plain.id,
    name: plain.name,
    position: plain.position,
    description: plain.description,
    type: plain.type,
    status: plain.status,
    orderBy: plain.orderBy,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    ...(plain.type === "image"
      ? { image: getFileUrl(plain.url) }
      : { video: getFileUrl(plain.url) }),
  };
};

// CREATE
export const createTestimonial = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, position, description, type, status, orderBy } = req.body;
    if (!name || !position || !type) {
      return res
        .status(400)
        .json({ message: "name, position, and type are required" });
    }

    let file: Express.Multer.File | undefined;
    if (type === "image" && req.files && (req.files as any).image) {
      file = (req.files as any).image[0];
    }
    if (type === "video" && req.files && (req.files as any).video) {
      file = (req.files as any).video[0];
    }

    if (!file) return res.status(400).json({ message: "File is required" });

    const folder =
      type === "image" ? "testimonials/images" : "testimonials/videos";
    const key = await singleUpload(file, folder);

    const testimonial = await Testimonial.create({
      name,
      position,
      description: description || null,
      type,
      url: key,
      status,
      orderBy: orderBy !== undefined ? orderBy : 0, // Default to 0 if not provided
    });

    return res
      .status(201)
      .json({ success: true, data: formatTestimonialResponse(testimonial) });
  } catch (err) {
    next(err);
  }
};

// LIST
export const listTestimonials = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || undefined;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { position: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (status) {
      const statuses = status.split(",");
      where.status = statuses.length > 1 ? { [Op.in]: statuses } : statuses[0];
    }

    const { count: total, rows } = await Testimonial.findAndCountAll({
      where,
      limit,
      offset,
      order: [["orderBy", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: rows.map(formatTestimonialResponse),
    });
  } catch (err) {
    next(err);
  }
};

// UPDATE
export const updateTestimonial = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const testimonial = await Testimonial.findByPk(req.params.id);
    if (!testimonial)
      return res.status(404).json({ message: "Testimonial not found" });

    const { name, position, description, type, status, orderBy } = req.body;
    let file: Express.Multer.File | undefined;

    if (type === "image" && req.files && (req.files as any).image) {
      file = (req.files as any).image[0];
    }
    if (type === "video" && req.files && (req.files as any).video) {
      file = (req.files as any).video[0];
    }

    let key = testimonial.url;

    if (file) {
      await deleteImage(testimonial.url);
      const folder =
        type === "image" ? "testimonials/images" : "testimonials/videos";
      key = await singleUpload(file, folder);
    }

    // Update the testimonial with new values
    Object.assign(testimonial, {
      name: name ?? testimonial.name,
      position: position ?? testimonial.position,
      description:
        description !== undefined ? description : testimonial.description,
      type: type ?? testimonial.type,
      url: key,
      status: status ?? testimonial.status,
      orderBy: orderBy !== undefined ? orderBy : testimonial.orderBy,
    });

    await testimonial.save();

    return res
      .status(200)
      .json({ success: true, data: formatTestimonialResponse(testimonial) });
  } catch (err) {
    next(err);
  }
};

// DELETE
export const deleteTestimonial = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const testimonial = await Testimonial.findByPk(req.params.id);
    if (!testimonial)
      return res.status(404).json({ message: "Testimonial not found" });

    await deleteImage(testimonial.url);
    await testimonial.destroy();

    return res
      .status(200)
      .json({ success: true, message: "Testimonial deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// Public: List only active testimonials for frontend
export const listActiveTestimonials = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const where: any = { status: "active" };

    if (req.query.type) {
      where.type = req.query.type; // optional filter: image | video
    }

    const testimonials = await Testimonial.findAll({
      where,
      order: [["orderBy", "ASC"]],
    });

    const formatted = testimonials.map(formatTestimonialResponse);

    res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    console.error("Error fetching public testimonials:", err);
    next(err);
  }
};
