import { Request, Response, NextFunction } from "express";
import BlogComment from "../models/blogComment.model";
import Blog from "../models/blog.model";
import User from "../models/user.model";
import { Op } from "sequelize";

// ADD comment
export const addComment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { blogId, comment, name, email, website, rating, status } = req.body;
    const userId = req.user?.id || null;

    const blog = await Blog.findByPk(blogId);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    const newComment = await BlogComment.create({
      blogId,
      userId,
      comment,
      rating,
      name: userId ? null : name,
      email: userId ? null : email,
      website,
      status, // default for moderation
    });

    return res.status(201).json({ success: true, data: newComment });
  } catch (err) {
    next(err);
  }
};

// LIST comments for a blog (approved only)
export const listComments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const blogId = req.params.blogId;
    const comments = await BlogComment.findAll({
      where: { blogId, status: "approved" },
      include: [{ model: User, as: "user", attributes: ["id", "name"] }],
      order: [["createdAt", "ASC"]],
    });

    return res.status(200).json({ success: true, data: comments });
  } catch (err) {
    next(err);
  }
};

// ADMIN: moderate comment (approve/reject)
export const updateComment = async (
  req: Request<{ commentId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { commentId } = req.params;

    // ✅ Ensure commentId is numeric
    const id = Number(commentId);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid commentId" });
    }

    const comment = await BlogComment.findByPk(id);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // ✅ Update all provided fields
    await comment.update(req.body);

    return res.status(200).json({
      success: true,
      data: comment,
    });
  } catch (err) {
    next(err);
  }
};
// Admin API: list all comments

export const listAllComments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const { blogId, status, search } = req.query;
    const where: any = {};

    if (blogId) where.blogId = Number(blogId);
    if (status) where.status = status;

    // Build base OR conditions for search
    const searchConditions: any[] = [];
    if (search) {
      const searchStr = `%${search}%`;
      searchConditions.push(
        { comment: { [Op.iLike]: searchStr } },
        { name: { [Op.iLike]: searchStr } },
        { email: { [Op.iLike]: searchStr } }
      );
    }

    // Build include array safely
    const include: any[] = [
      {
        model: User,
        as: "user",
        attributes: ["id", "name", "email"],
        required: false,
        ...(search
          ? {
              where: {
                [Op.or]: [
                  { name: { [Op.iLike]: `%${search}%` } },
                  { email: { [Op.iLike]: `%${search}%` } },
                ],
              },
            }
          : {}),
      },
    ];

    const { count: total, rows: comments } = await BlogComment.findAndCountAll({
      where:
        searchConditions.length > 0
          ? { [Op.or]: searchConditions, ...where }
          : where,
      include,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: comments,
    });
  } catch (err) {
    next(err);
  }
};

// Admin deletes a comment
export const deleteComment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { commentId } = req.params;

    const comment = await BlogComment.findByPk(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    await comment.destroy();

    return res
      .status(200)
      .json({ success: true, message: "Comment deleted successfully" });
  } catch (err) {
    next(err);
  }
};
