import { Request, Response, NextFunction } from "express";
import ProductReview from "../models/productReview.model";
import Product from "../models/product.model";
import { Op } from "sequelize";
import User from "../models/user.model";
import { deleteImage, getFileUrl, singleUpload } from "../utils/awsS3";
import ProductReviewImage from "../models/productReviewImage.model";

// CREATE REVIEW
export const createProductReview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { productId, userName, userEmail, review, rating } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (rating < 1 || rating > 5)
      return res
        .status(400)
        .json({ message: "Rating must be between 1 and 5" });

    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Create review
    const newReview = await ProductReview.create({
      productId,
      userId,
      userName,
      userEmail,
      review,
      rating,
    });

    // -------------------- FIXED FILE HANDLING --------------------
    let files: any[] = [];

    if (Array.isArray(req.files)) {
      files = req.files;
    } else if (req.files && (req.files as any).images) {
      files = (req.files as any).images;
    }

    if (files.length > 5) {
      return res
        .status(400)
        .json({ message: "You can upload up to 5 images." });
    }

    if (files.length) {
      const uploadRows = [];

      for (const file of files) {
        const key = await singleUpload(file, "reviews");
        uploadRows.push({ reviewId: newReview.id, image: key });
      }

      await ProductReviewImage.bulkCreate(uploadRows);
    }
    // -------------------------------------------------------------

    const finalReview = await ProductReview.findByPk(newReview.id, {
      include: [{ model: ProductReviewImage, as: "images" }],
    });

    // Convert S3 keys → URLs
    if (finalReview?.images) {
      (finalReview as any).images = finalReview.images.map((img: any) => ({
        ...img.toJSON(),
        image: getFileUrl(img.image, "reviews"),
      }));
    }

    return res.status(201).json({ success: true, data: finalReview });
  } catch (err) {
    next(err);
  }
};

// LIST REVIEWS (optional filter by productId)

export const listProductReviews = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const { productId, search, status } = req.query;

    const where: Record<string | symbol, any> = {};

    // ✅ Filter by product ID
    if (productId) where.productId = Number(productId);

    // ✅ Apply status filter ONLY if provided
    if (status && typeof status === "string" && status.trim() !== "") {
      where.status = status;
    }

    // ✅ Apply search filter
    if (search && typeof search === "string") {
      where[Op.or] = [
        { review: { [Op.iLike]: `%${search}%` } },
        { userEmail: { [Op.iLike]: `%${search}%` } },
        { userName: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // 🔹 Fetch reviews with pagination and includes
    const { count: total, rows: reviews } = await ProductReview.findAndCountAll(
      {
        where,
        limit,
        offset,
        order: [["createdAt", "DESC"]],
        include: [
          {
            model: ProductReviewImage,
            as: "images",
          },
          {
            model: User,
            as: "user",
            attributes: ["id", "name", "email", "image"],
          },
          {
            model: Product,
            as: "product",
            attributes: ["id", "title", "featuredImage"],
          },
        ],
      }
    );

    // 🧠 Format output: attach full image URLs
    const formatted = reviews.map((r: any) => {
      const json = r.toJSON();

      // Full user image URL
      if (json.user?.image) {
        json.user.image = getFileUrl(json.user.image, "users");
      }

      if (json.images) {
        json.images = json.images.map((img: any) => ({
          ...img,
          image: getFileUrl(img.image, "reviews"),
        }));
      }
      // Full product image URL
      if (json.product?.featuredImage) {
        json.product.featuredImage = getFileUrl(
          json.product.featuredImage,
          "products/featured-image"
        );
      }

      return json;
    });

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
};
// GET REVIEW BY ID
export const getProductReviewById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const review = await ProductReview.findByPk(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });

    return res.status(200).json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
};

// UPDATE REVIEW (admin or owner)
export const updateProductReview = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const review = await ProductReview.findByPk(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });

    const { review: reviewText, rating, status } = req.body;

    if (rating && (rating < 1 || rating > 5)) {
      return res
        .status(400)
        .json({ message: "Rating must be between 1 and 5" });
    }

    await review.update({ review: reviewText, rating, status });

    return res.status(200).json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
};

// DELETE REVIEW (admin or owner)
export const deleteProductReview = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const review = await ProductReview.findByPk(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });

    const images = await ProductReviewImage.findAll({
      where: { reviewId: review.id },
    });

    for (const img of images) {
      await deleteImage(img.image);
    }

    await review.destroy();
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const listPublicProductReviews = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const productId = Number(req.params.id);
    if (!productId) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    // Pagination setup
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;
    const { search } = req.query;

    // WHERE conditions
    const where: Record<string | symbol, any> = {
      productId,
    };

    // Optional search filter
    if (search && typeof search === "string" && search.trim() !== "") {
      where[Op.or] = [
        { review: { [Op.iLike]: `%${search}%` } },
        { userName: { [Op.iLike]: `%${search}%` } },
        { userEmail: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Fetch paginated reviews
    const { count: total, rows: reviews } = await ProductReview.findAndCountAll(
      {
        where,
        limit,
        offset,
        order: [["createdAt", "DESC"]],
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "name", "image"],
          },
          {
            model: ProductReviewImage,
            as: "images",
          },
        ],
      }
    );

    // Format image URL properly
    const formatted = reviews.map((r: any) => {
      const json = r.toJSON();
      if (json.user?.image) {
        json.user.image = getFileUrl(json.user.image, "users/profile");
      }
      // review images
      if (json.images?.length) {
        json.images = json.images.map((img: any) => ({
          ...img,
          image: getFileUrl(img.image, "reviews"),
        }));
      }
      return json;
    });

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
};
