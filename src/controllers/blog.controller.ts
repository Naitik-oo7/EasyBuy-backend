import { Request, Response, NextFunction } from "express";
import Blog from "../models/blog.model";
import { deleteImage, singleUpload, getFileUrl } from "../utils/awsS3";
import { Op } from "sequelize";
import { slugify } from "../utils/slugify";

// Helper function to ensure slug uniqueness
const generateUniqueSlug = async (
  slug: string,
  excludeId?: number
): Promise<string> => {
  let uniqueSlug = slug;
  let counter = 1;

  while (true) {
    const whereClause: any = { slug: uniqueSlug };
    if (excludeId) {
      whereClause.id = { [Op.ne]: excludeId };
    }

    const existingBlog = await Blog.findOne({ where: whereClause });
    if (!existingBlog) {
      break;
    }
    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
};

// CREATE Blog
export const createBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let featuredImage = null;

    // Updated to use req.files from the blogUploadMiddleware
    if (req.files && (req.files as any).featuredImage) {
      const key = await singleUpload(
        (req.files as any).featuredImage[0],
        "blogs/featured-image"
      );
      featuredImage = key; // store only key in DB
    }

    // Ensure slug uniqueness
    let slug = req.body.slug;
    if (!slug && req.body.title) {
      slug = slugify(req.body.title);
    }
    const uniqueSlug = await generateUniqueSlug(slug);

    const blog = await Blog.create({
      ...req.body,
      slug: uniqueSlug,
      featuredImage,
      orderBy: 0,
    });

    const jsonBlog = blog.toJSON();
    jsonBlog.featuredImage = getFileUrl(jsonBlog.featuredImage ?? null);

    return res.status(201).json({ success: true, data: jsonBlog });
  } catch (err) {
    next(err);
  }
};

// LIST Blogs (Admin)
export const listBlogs = async (
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

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { shortDescription: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (status) where.status = status;

    const { count: total, rows: blogs } = await Blog.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        "title",
        "slug",
        "subTitle",
        "shortDescription",
        "featuredImage",
        "metaTitle",
        "metaDescription",
        "status",
        "createdAt",
        "updatedAt",
      ],
    });

    const normalized = blogs.map((b) => {
      const json = b.toJSON();
      json.featuredImage = getFileUrl(
        json.featuredImage ?? null,
        "blogs/featured-image"
      );
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

// Public API: list only active blogs
export const listActiveBlogs = async (
  req: Request,
  res: Response,

  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";

    const where: any = { status: "active" };

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { shortDescription: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count: total, rows: blogs } = await Blog.findAndCountAll({
      where,
      limit,
      offset,
      attributes: [
        "id",
        "title",
        "slug",
        "shortDescription",
        "featuredImage",
        "createdAt",
        "updatedAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    const normalized = blogs.map((b) => {
      const json = b.toJSON();
      json.featuredImage = getFileUrl(
        json.featuredImage ?? null,
        "blogs/featured-image"
      );
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

// GET Blog by ID
export const getBlogById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    const jsonBlog = blog.toJSON();
    jsonBlog.featuredImage = getFileUrl(
      jsonBlog.featuredImage ?? null,
      "blogs/featured-image"
    );

    return res.status(200).json({ success: true, data: jsonBlog });
  } catch (err) {
    next(err);
  }
};

// UPDATE Blog
export const updateBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    // Handle file deletions when fields are explicitly set to null
    if (req.body.featuredImage === null && blog.featuredImage) {
      try {
        await deleteImage(blog.featuredImage);
      } catch (err) {
        console.error("Error deleting featured image:", err);
      }
      req.body.featuredImage = null;
    }

    // Updated to use req.files from the blogUploadMiddleware
    if (req.files && (req.files as any).featuredImage) {
      if (blog.featuredImage) {
        try {
          await deleteImage(blog.featuredImage);
        } catch (err) {
          console.warn("⚠️ Failed to delete old blog image:", err);
        }
      }

      const key = await singleUpload(
        (req.files as any).featuredImage[0],
        "blogs/featured-image"
      );

      // 👉 IMPORTANT: ensure update() receives the new featuredImage
      req.body.featuredImage = key;
    }

    // Ensure slug uniqueness (exclude current blog)
    let slug = req.body.slug;
    if (slug || req.body.title) {
      if (!slug && req.body.title) {
        slug = slugify(req.body.title);
      }
      const uniqueSlug = await generateUniqueSlug(slug, blog.id);
      req.body.slug = uniqueSlug;
    }

    await blog.update(req.body);

    const jsonBlog = blog.toJSON();
    jsonBlog.featuredImage = getFileUrl(
      jsonBlog.featuredImage ?? null,
      "blogs/featured-image"
    );

    return res.status(200).json({ success: true, data: jsonBlog });
  } catch (err) {
    next(err);
  }
};

// DELETE Blog
export const deleteBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    if (blog.featuredImage) {
      try {
        await deleteImage(blog.featuredImage);
      } catch (err) {
        console.warn("⚠️ Failed to delete blog image from S3:", err);
      }
    }

    await blog.destroy();
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// GET Blog by Slug (Public)
export const getBlogBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { slug } = req.params;
    const blog = await Blog.findOne({ where: { slug, status: "active" } });

    if (!blog) return res.status(404).json({ message: "Blog not found" });

    const jsonBlog = blog.toJSON();
    jsonBlog.featuredImage = getFileUrl(
      jsonBlog.featuredImage ?? null,
      "blogs/featured-image"
    );

    return res.status(200).json({ success: true, data: jsonBlog });
  } catch (err) {
    next(err);
  }
};
