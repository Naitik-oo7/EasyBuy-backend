import { Request, Response, NextFunction } from "express";
import Wishlist from "../models/wishlist.model";
import Product from "../models/product.model";
import { attachBulkOrderPrices } from "../utils/bulkOrderHelper";
import { getFileUrl } from "../utils/awsS3";
import Option from "../models/option.model";
import ProductReview from "../models/productReview.model";
import BulkOrder from "../models/bulkOrder.model";
import Category from "../models/category.model";
import {
  buildCategoryBreadcrumb,
  getDeepestCategory,
} from "../utils/breadcrumbHelper";

export const addToWishlist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { productId } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!productId)
      return res.status(400).json({ message: "productId is required" });

    // ✅ check if product actually exists
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found or inactive" });
    }

    // ✅ prevent duplicates
    const existing = await Wishlist.findOne({ where: { userId, productId } });
    if (existing) {
      return res.status(400).json({ message: "Already in wishlist" });
    }

    const wishlistItem = await Wishlist.create({ userId, productId });
    return res.status(201).json({ success: true, data: wishlistItem });
  } catch (err) {
    next(err);
  }
};

export const removeFromWishlist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { productId } = req.params;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const deleted = await Wishlist.destroy({ where: { userId, productId } });
    if (!deleted) return res.status(404).json({ message: "Item not found" });

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const listWishlist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // include full product details, bulkOrders for pricing, reviews for rating, and categories for breadcrumbs
    const items = await Wishlist.findAll({
      where: { userId },
      include: [
        {
          model: Product,
          as: "product",
          include: [
            { model: BulkOrder, as: "bulkOrders" },
            {
              model: ProductReview,
              as: "reviews",
              attributes: ["rating"],
            },
            {
              model: Category,
              as: "categories",
              attributes: ["id", "title", "slug", "parentId"],
              through: { attributes: [] },
            },
          ],
        },
      ],
    });

    // map and format wishlist response
    const formatted = await Promise.all(
      items.map(async (i: any) => {
        const p = i.product;
        if (!p) return null;

        // ✅ Attach bulk order pricing
        const productWithBulk = attachBulkOrderPrices(p);

        // ✅ Calculate rating
        const ratings = p.reviews?.map((r: any) => r.rating) || [];
        const avgRating =
          ratings.length > 0
            ? ratings.reduce((sum: number, val: number) => sum + val, 0) /
              ratings.length
            : 0;

        // ✅ Build breadcrumbs
        const allCategories =
          p.categories?.map((c: any) =>
            typeof c.toJSON === "function" ? c.toJSON() : c
          ) || [];

        const primaryCategory = await getDeepestCategory(allCategories);
        let breadcrumbs: any[] = [];

        if (primaryCategory) {
          const parentChain = await buildCategoryBreadcrumb(primaryCategory);
          breadcrumbs = [...parentChain, primaryCategory];
        }

        // ✅ Return final wishlist item (no sizes)
        return {
          id: i.id,
          productId: p.id,
          slug: p.slug,
          productName: p.title,
          featuredImage: getFileUrl(p.featuredImage, "products/featured-image"),
          displayPrice: productWithBulk.price ?? p.price,
          rating: Number(avgRating.toFixed(1)),
          reviewCount: ratings.length,
          breadcrumbs, // 👈 Added here
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: formatted.filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
};
