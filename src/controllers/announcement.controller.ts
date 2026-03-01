import { Request, Response, NextFunction } from "express";
import Announcement from "../models/announcement.model";
import { Op } from "sequelize";

// Create
export const createAnnouncement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { title, description, status, color, backgroundColor } = req.body;
    if (!title) return res.status(400).json({ message: "Title is required" });

    // If creating a new active announcement, deactivate all others
    if (status === "active") {
      await Announcement.update({ status: "inactive" }, { where: {} });
    }

    const announcement = await Announcement.create({
      title,
      description,
      status,
      color,
      backgroundColor,
    });
    return res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    next(err);
  }
};

// List Announcements (only active for normal users)
export const listAnnouncements = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 🔹 Pagination setup
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    // 🔹 Filters
    let where: any = {};

    if (req.query.status) {
      where.status = req.query.status as string;
    }

    // 🔹 Fetch with count for pagination
    const { count: total, rows } = await Announcement.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: rows,
    });
  } catch (err) {
    next(err);
  }
};

// Get single
export const getAnnouncementById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const announcement = await Announcement.findByPk(req.params.id);
    if (!announcement)
      return res.status(404).json({ message: "Announcement not found" });
    return res.status(200).json({ success: true, data: announcement });
  } catch (err) {
    next(err);
  }
};

// Update Announcement
export const updateAnnouncement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { title, description, status, color, backgroundColor } = req.body;

    const announcement = await Announcement.findByPk(req.params.id);
    if (!announcement)
      return res.status(404).json({ message: "Announcement not found" });

    // If status is being set to active, deactivate all other announcements
    if (status === "active") {
      await Announcement.update(
        { status: "inactive" },
        { where: { id: { [Op.ne]: announcement.id } } }
      );
    }

    // Update fields only if provided
    if (description !== undefined) announcement.description = description;
    if (title !== undefined) announcement.title = title;
    if (status !== undefined) announcement.status = status;
    if (color !== undefined) announcement.color = color;
    if (backgroundColor !== undefined)
      announcement.backgroundColor = backgroundColor;

    await announcement.save();

    return res.status(200).json({ success: true, data: announcement });
  } catch (err) {
    next(err);
  }
};

// Delete
export const deleteAnnouncement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const announcement = await Announcement.findByPk(req.params.id);
    if (!announcement)
      return res.status(404).json({ message: "Announcement not found" });

    await announcement.destroy();
    return res
      .status(200)
      .json({ success: true, message: "Announcement deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// Public: List only active announcements (no auth)
export const listActiveAnnouncements = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Optional pagination
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const where: any = { status: "active" };

    // Optional search filter
    if (req.query.search) {
      where.title = { $iLike: `%${req.query.search}%` };
    }

    const { count: total, rows } = await Announcement.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: rows,
    });
  } catch (err) {
    next(err);
  }
};
