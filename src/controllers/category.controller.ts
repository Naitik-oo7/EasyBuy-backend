import { Request, Response, NextFunction } from "express";
import { col, fn, literal, Op } from "sequelize";
import Category from "../models/category.model";
import CategoryFaq from "../models/categoryFaq.model"; // Added import
import { singleUpload, deleteImage, getFileUrl } from "../utils/awsS3";
import sequelize from "../config/database";
import Product from "../models/product.model";
import OrderProduct from "../models/orderProduct.model";
import Order from "../models/order.model";
import { slugify } from "../utils/slugify";
import { attachBulkOrderPrices } from "../utils/bulkOrderHelper";
import Option from "../models/option.model";
import {
  buildCategoryBreadcrumb,
  getDeepestCategory,
} from "../utils/breadcrumbHelper";
import BulkOrder from "../models/bulkOrder.model";
import { hasPermission } from "../utils/permissionUtils";
import ProductCategory from "../models/productCategory.model";
import ProductImage from "../models/productImage.model";
import ProductFaq from "../models/productFaq.model";
import ProductReview from "../models/productReview.model";
import Tagged from "../models/tagged.model";

// CREATE CATEGORY
export const createCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let imageUrl = null;
    let image2Url = null;
    let metaImageUrl = null;
    let videoUrl = null; // Added videoUrl variable

    if (req.files && (req.files as any).image) {
      imageUrl = await singleUpload((req.files as any).image[0], "categories");
    }
    // Added handling for second image
    if (req.files && (req.files as any).image2) {
      // Validate that only one of image2 or video can exist
      if (req.files && (req.files as any).video) {
        return res.status(400).json({
          message: "Only one of image2 or video can be uploaded, not both",
        });
      }
      image2Url = await singleUpload(
        (req.files as any).image2[0],
        "categories"
      );
    }

    if (req.files && (req.files as any).metaImage) {
      metaImageUrl = await singleUpload(
        (req.files as any).metaImage[0],
        "categories/meta"
      );
    }

    // Added handling for video
    if (req.files && (req.files as any).video) {
      // Validate that only one of image2 or video can exist
      if (req.files && (req.files as any).image2) {
        return res.status(400).json({
          message: "Only one of image2 or video can be uploaded, not both",
        });
      }
      videoUrl = await singleUpload(
        (req.files as any).video[0],
        "categories/video"
      );
    }

    const {
      title,
      description,
      detailDescription, // Added detailDescription
      parentId: bodyParentId,
      slug,
      status,
      type,
      subTitle,
      h1,
      metaTitle,
      metaDesc,
      isPublic,
      isProfession,
      orderBy,
      corporateId, // Added isProfession field
    } = req.body;

    if (!title || description == null) {
      return res
        .status(400)
        .json({ message: "title and description are required" });
    }

    // Parent check
    let parentId: number | null = null;
    if (
      typeof bodyParentId !== "undefined" &&
      bodyParentId !== null &&
      bodyParentId !== ""
    ) {
      parentId = Number(bodyParentId);
      if (Number.isNaN(parentId)) {
        return res.status(400).json({ message: "Invalid parentId" });
      }
      const parentCategory = await Category.findByPk(parentId);
      if (!parentCategory)
        return res.status(400).json({ message: "Parent category not found" });
    }

    // Title uniqueness
    const exists = await Category.findOne({ where: { title } });
    if (exists)
      return res.status(400).json({ message: "Category already exists" });

    let finalSlug = slug ? slugify(slug) : slugify(title);

    const slugExists = await Category.findOne({ where: { slug: finalSlug } });
    if (slugExists) {
      return res.status(400).json({ message: "Slug already in use" });
    }

    // Set default type to 'product' if not provided
    const categoryType = type || "product";

    const category = await Category.create({
      title,
      description,
      detailDescription, // Added detailDescription
      parentId,
      slug: finalSlug,
      status,
      type: categoryType,
      subTitle,
      h1,
      metaTitle,
      metaDesc,
      image: imageUrl,
      image2: image2Url,
      metaImage: metaImageUrl,
      video: videoUrl, // Added video field
      isPublic,
      isProfession: isProfession || false,
      orderBy: orderBy || 0,
      corporateId: corporateId || null,
    });

    return res.status(201).json({
      success: true,
      data: {
        ...category.get(),
        image: getFileUrl(category.image),
        image2: getFileUrl(category.image2),
        metaImage: getFileUrl(category.metaImage),
        video: getFileUrl(category.video), // Added video field
      },
    });
  } catch (err) {
    next(err);
  }
};

// Helper function to fetch subcategories up to 3 levels
const getSubcategoriesUpToLevel3 = async (
  parentId: number,
  search?: string
) => {
  const level2 = await Category.findAll({
    where: {
      parentId: parentId,
      ...(search
        ? {
            [Op.or]: [
              { title: { [Op.iLike]: `%${search}%` } },
              { description: { [Op.iLike]: `%${search}%` } },
            ],
          }
        : {}),
    },
    order: [["createdAt", "DESC"]],
  });

  return Promise.all(
    level2.map(async (sub) => {
      const level3 = await Category.findAll({
        where: {
          parentId: sub.id,
          ...(search
            ? {
                [Op.or]: [
                  { title: { [Op.iLike]: `%${search}%` } },
                  { description: { [Op.iLike]: `%${search}%` } },
                ],
              }
            : {}),
        },
        order: [["createdAt", "DESC"]],
      });
      return {
        ...sub.get(),
        image: getFileUrl(sub.image),
        image2: getFileUrl(sub.image2),
        metaImage: getFileUrl(sub.metaImage),
        video: getFileUrl(sub.video), // Added video field
        subcategories: level3.map((lvl3) => ({
          ...lvl3.get(),
          image: getFileUrl(lvl3.image),
          image2: getFileUrl(lvl3.image2),
          metaImage: getFileUrl(lvl3.metaImage),
          video: getFileUrl(lvl3.video), // Added video field
        })),
      };
    })
  );
};

// LIST CATEGORIES WITH SUBCATEGORIES
export const listCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check if isFeatured filter is requested
    const isFeaturedFilter =
      req.query.isFeatured === "true"
        ? true
        : req.query.isFeatured === "false"
        ? false
        : null;

    // Check if isProfession filter is requested
    const isProfessionFilter =
      req.query.isProfession === "true"
        ? true
        : req.query.isProfession === "false"
        ? false
        : null;

    // Build where clause (role-aware)
    const user = req.user;
    const whereClause: any = {};

    if (!user) {
      // Public (no login)
      whereClause.status = "active";
      whereClause.isPublic = true;
    } else if (hasPermission(user, "view_all_categories")) {
      // no extra filters — show all
    } else if (hasPermission(user, "view_corporate_categories")) {
      const corporateOwnerId = (user as any).corporateId || (user as any).id;
      whereClause.status = "active";
      whereClause.corporateId = corporateOwnerId;
    } else {
      // Logged-in user without special permissions
      whereClause.status = "active";
      whereClause.isPublic = true;
    }

    if (isFeaturedFilter !== null) {
      whereClause.isFeatured = isFeaturedFilter;
    }

    // Apply isProfession filter if specified
    if (isProfessionFilter !== null) {
      whereClause.isProfession = isProfessionFilter;
    }

    // If filtering by featured, we want all featured categories regardless of level
    // Otherwise, maintain the original behavior of only top-level categories
    if (isFeaturedFilter === true) {
      // For featured categories, we don't filter by parentId
      // But we may want to limit depth to avoid very deep nesting
    } else {
      // Original behavior - only top-level categories
      whereClause.parentId = null;
    }

    const categories = await Category.findAll({
      where: whereClause,
      attributes: [
        "id",
        "title",
        "slug",
        "sub_title",
        "image",
        "image2",
        "metaImage",
        "video", // Added video field
        "parentId",
        "orderBy",
      ],
      order: [
        ["orderBy", "ASC"],
        ["createdAt", "DESC"],
      ],
    });

    // For featured subcategories, also fetch their parent information
    const categoriesWithParents = await Promise.all(
      categories.map(async (cat) => {
        let parentInfo = null;
        if (cat.parentId) {
          const parent = await Category.findByPk(cat.parentId, {
            attributes: ["id", "title", "slug"],
          });
          if (parent) {
            parentInfo = {
              id: parent.id,
              title: parent.title,
              slug: parent.slug,
            };
          }
        }

        return {
          ...cat.get(),
          parent: parentInfo,
          image: getFileUrl(cat.image),
          image2: getFileUrl(cat.image2),
          metaImage: getFileUrl(cat.metaImage),
          video: getFileUrl(cat.video), // Added video field
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: categoriesWithParents,
    });
  } catch (err) {
    next(err);
  }
};

// GET CATEGORY BY ID
export const getCategoryById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const category = await Category.findByPk(req.params.id, {
      include: [
        {
          model: CategoryFaq,
          as: "faqs",
          attributes: ["id", "question", "answer"],
        },
      ],
    });
    if (!category)
      return res.status(404).json({ message: "Category not found" });

    const subcategories = await getSubcategoriesUpToLevel3(category.id);
    return res.status(200).json({
      success: true,
      data: {
        ...category.get(),
        image: getFileUrl(category.image),
        image2: getFileUrl(category.image2),
        metaImage: getFileUrl(category.metaImage),
        video: getFileUrl(category.video), // Added video field
        subcategories,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET CATEGORY BY SLUG
export const getCategoryBySlug = async (
  req: Request<{ slug: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const category = await Category.findOne({
      where: { slug: req.params.slug },
      include: [
        {
          model: CategoryFaq,
          as: "faqs",
          attributes: ["id", "question", "answer"],
        },
      ],
    });
    if (!category)
      return res.status(404).json({ message: "Category not found" });

    const subcategories = await getSubcategoriesUpToLevel3(category.id);
    return res.status(200).json({
      success: true,
      data: {
        ...category.get(),
        image: getFileUrl(category.image),
        image2: getFileUrl(category.image2),
        metaImage: getFileUrl(category.metaImage),
        video: getFileUrl(category.video), // Added video field
        subcategories,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET CATEGORY DETAIL DESCRIPTION, FAQS AND IMAGE BY SLUG
export const getCategoryDetailBySlug = async (
  req: Request<{ slug: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const category: any = await Category.findOne({
      where: { slug: req.params.slug },
      attributes: [
        "id",
        "title",
        "detailDescription",
        "image",
        "image2",
        "metaImage",
      ],
      include: [
        {
          model: CategoryFaq,
          as: "faqs",
          attributes: ["id", "question", "answer"],
        },
      ],
    });

    if (!category)
      return res.status(404).json({ message: "Category not found" });

    return res.status(200).json({
      success: true,
      data: {
        detailDescription: category.detailDescription,
        image: getFileUrl(category.image),
        image2: getFileUrl(category.image2),
        metaImage: getFileUrl(category.metaImage),
        faqs:
          category.faqs?.map((faq: any) => ({
            id: faq.id,
            question: faq.question,
            answer: faq.answer,
          })) || [],
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listCategoryStats = async (
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
    const parentId = req.query.parentId as string | undefined;
    const isProfession = req.query.isProfession as string | undefined;

    const where: any = { type: "product" };
    if (search) {
      const decodedSearch = decodeURIComponent(search)
        .replace(/\+/g, " ")
        .trim();

      where[Op.or] = [
        { title: { [Op.iLike]: `%${decodedSearch}%` } },
        { h1: { [Op.iLike]: `%${decodedSearch}%` } },
        { subTitle: { [Op.iLike]: `%${decodedSearch}%` } },
        { slug: { [Op.iLike]: `%${decodedSearch}%` } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (isProfession?.toLowerCase() === "true") {
      where.isProfession = true;
    }
    if (isProfession?.toLocaleLowerCase() === "false") {
      where.isProfession = false;
    }

    if (parentId !== undefined) {
      where.parentId = parentId === "null" ? null : Number(parentId);
    }

    const { count: total, rows } = await Category.findAndCountAll({
      where,
      limit,
      offset,
      order: [
        ["orderBy", "ASC"],
        ["createdAt", "DESC"],
      ],
      attributes: [
        "id",
        "title",
        "image",
        "image2",
        "video", // Added video field
        "h1",
        "parentId",
        "description",
        "detailDescription",
        "slug",
        "status",
        "type",
        "subTitle",
        "metaTitle",
        "metaDesc",
        "metaImage",
        "isPublic",
        "isFeatured",
        "isProfession", // Added isProfession field to the response
        "orderBy",
        "corporateId", // Added corporateId field to the response
        [fn("COUNT", col("products.id")), "totalProducts"],
        [
          fn(
            "COALESCE",
            fn(
              "SUM",
              literal(
                `"products->orderProducts"."price" * "products->orderProducts"."quantity"`
              )
            ),
            0
          ),
          "totalEarnings",
        ],
      ],
      include: [
        {
          model: Product,
          as: "products",
          attributes: [],
          through: { attributes: [] },
          include: [
            {
              model: OrderProduct,
              as: "orderProducts",
              attributes: [],
              include: [
                {
                  model: Order,
                  as: "order",
                  attributes: [],
                  where: { status: "delivered" },
                },
              ],
            },
          ],
        },
      ],
      group: ["Category.id"],
      distinct: true,
      subQuery: false,
    });

    let resultData = rows.map((cat) => ({
      ...cat.get(),
      image: getFileUrl(cat.image),
      image2: getFileUrl(cat.image2),
      metaImage: getFileUrl(cat.metaImage),
      video: getFileUrl(cat.video), // Added video field
    }));

    // ✅ New: Include parent category itself when parentId is passed
    if (parentId && parentId !== "null") {
      const parentCategory = await Category.findOne({
        where: { id: Number(parentId) },
        attributes: [
          "id",
          "title",
          "image",
          "image2",
          "video", // Added video field
          "h1",
          "description",
          "detailDescription",
          "parentId",
          "slug",
          "status",
          "type",
          "subTitle",
          "metaTitle",
          "metaDesc",
          "metaImage",
          "isPublic",
          "isFeatured",
          "isProfession", // Added isProfession field to the response
          "orderBy",
          "corporateId", // Added corporateId field to the response
          [fn("COUNT", col("products.id")), "totalProducts"],
          [
            fn(
              "COALESCE",
              fn(
                "SUM",
                literal(
                  `"products->orderProducts"."price" * "products->orderProducts"."quantity"`
                )
              ),
              0
            ),
            "totalEarnings",
          ],
        ],
        include: [
          {
            model: Product,
            as: "products",
            attributes: [],
            through: { attributes: [] },
            include: [
              {
                model: OrderProduct,
                as: "orderProducts",
                attributes: [],
                include: [
                  {
                    model: Order,
                    as: "order",
                    attributes: [],
                    where: { status: "delivered" },
                  },
                ],
              },
            ],
          },
        ],
        group: ["Category.id"],
      });

      if (parentCategory) {
        const formattedParent = {
          ...parentCategory.get(),
          image: getFileUrl(parentCategory.image),
          image2: getFileUrl(parentCategory.image2),
          metaImage: getFileUrl(parentCategory.metaImage),
          video: getFileUrl(parentCategory.video), // Added video field
        };
        // Put parent first, then children
        resultData = [formattedParent, ...resultData];
      }
    }

    if (parentId !== undefined) {
      const categoryIds = rows.map((row) => row.id);
      if (categoryIds.length > 0) {
        const subCategories = await Category.findAll({
          where: {
            parentId: {
              [Op.in]: categoryIds,
            },
          },
          attributes: [
            "id",
            "title",
            "image",
            "image2",
            "video", // Added video field
            "h1",
            "description",
            "detailDescription",
            "parentId",
            "slug",
            "status",
            "type",
            "subTitle",
            "metaTitle",
            "metaDesc",
            "metaImage",
            "isPublic",
            "isFeatured",
            "isProfession", // Added isProfession field to the response
            "orderBy",
          ],
        });

        const subCategoriesMap: Record<number, any[]> = {};
        subCategories.forEach((subCat) => {
          const parentId = subCat.parentId;
          if (parentId !== null) {
            if (!subCategoriesMap[parentId]) {
              subCategoriesMap[parentId] = [];
            }
            subCategoriesMap[parentId].push({
              ...subCat.get(),
              image: getFileUrl(subCat.image),
              image2: getFileUrl(subCat.image2),
              metaImage: getFileUrl(subCat.metaImage),
              video: getFileUrl(subCat.video), // Added video field
            });
          }
        });

        resultData = resultData.map((cat) => ({
          ...cat,
          subCategories: subCategoriesMap[cat.id] || [],
        }));
      }
    }

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
      data: resultData,
    });
  } catch (err) {
    next(err);
  }
};

// UPDATE CATEGORY
export const updateCategory = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const categoryId = Number(req.params.id);
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    let finalSlug = category.slug;

    // If slug is provided AND changed → regenerate slug
    if (
      req.body.slug &&
      typeof req.body.slug === "string" &&
      req.body.slug.trim() !== category.slug
    ) {
      finalSlug = slugify(req.body.slug.trim());
    }

    // Check duplicate slug (excluding current category)
    const slugExists = await Category.findOne({
      where: {
        slug: finalSlug,
        id: { [Op.ne]: categoryId },
      },
    });

    if (slugExists) {
      return res.status(400).json({ message: "Slug already in use" });
    }

    let imageUrl;
    if (req.files && (req.files as any).image) {
      const file = (req.files as any).image[0];
      imageUrl = await singleUpload(file, "categories");
    }
    let image2Url;
    if (req.files && (req.files as any).image2) {
      // Validate that only one of image2 or video can exist
      if (req.files && (req.files as any).video) {
        return res.status(400).json({
          message: "Only one of image2 or video can be uploaded, not both",
        });
      }
      const file = (req.files as any).image2[0];
      image2Url = await singleUpload(file, "categories");
    }

    let metaImageUrl;
    if (req.files && (req.files as any).metaImage) {
      const file = (req.files as any).metaImage[0];
      metaImageUrl = await singleUpload(file, "categories/meta");
    }

    // Added video handling
    let videoUrl;
    if (req.files && (req.files as any).video) {
      // Validate that only one of image2 or video can exist
      if (req.files && (req.files as any).image2) {
        return res.status(400).json({
          message: "Only one of image2 or video can be uploaded, not both",
        });
      }
      const file = (req.files as any).video[0];
      videoUrl = await singleUpload(file, "categories/video");
    }

    const {
      parentId: bodyParentId,
      isProfession,
      orderBy,
      detailDescription,
      ...rest
    } = req.body; // Extract detailDescription field

    let parentId: number | null = category.parentId ?? null;
    if (typeof bodyParentId !== "undefined") {
      if (Number(bodyParentId) === categoryId) {
        return res
          .status(400)
          .json({ message: "Category cannot be its own parent" });
      }

      if (bodyParentId !== null && bodyParentId !== "") {
        const parent = await Category.findByPk(bodyParentId);
        if (!parent) {
          return res.status(400).json({ message: "Parent category not found" });
        }
        parentId = Number(bodyParentId);
      } else {
        parentId = null;
      }
    }

    await Category.update(
      {
        ...rest,
        detailDescription, // Update detailDescription field if provided
        parentId,
        slug: finalSlug,
        ...(imageUrl && { image: imageUrl }),
        ...(image2Url && { image2: image2Url }),
        ...(metaImageUrl && { metaImage: metaImageUrl }),
        ...(videoUrl && { video: videoUrl }), // Added video field
        ...(isProfession !== undefined && { isProfession }), // Update isProfession field if provided
        ...(orderBy !== undefined && { orderBy }), // Update orderBy field if provided
      },
      { where: { id: categoryId } }
    );

    if (imageUrl && category.image) {
      try {
        await deleteImage(category.image);
      } catch (e) {
        console.warn("Failed to delete old category image:", e);
      }
    }
    // Added deletion for second image
    if (image2Url && category.image2) {
      try {
        await deleteImage(category.image2);
      } catch (e) {
        console.warn("Failed to delete old category image2:", e);
      }
    }
    if (metaImageUrl && category.metaImage) {
      try {
        await deleteImage(category.metaImage);
      } catch (e) {
        console.warn("Failed to delete old category metaImage:", e);
      }
    }
    // Added deletion for video
    if (videoUrl && category.video) {
      try {
        await deleteImage(category.video);
      } catch (e) {
        console.warn("Failed to delete old category video:", e);
      }
    }

    const updatedCategory = await Category.findByPk(categoryId);
    return res.status(200).json({
      success: true,
      data: {
        ...updatedCategory!.get(),
        image: getFileUrl(updatedCategory!.image),
        image2: getFileUrl(updatedCategory!.image2),
        metaImage: getFileUrl(updatedCategory!.metaImage),
        video: getFileUrl(updatedCategory!.video), // Added video field
      },
    });
  } catch (err) {
    next(err);
  }
};

// DELETE CATEGORY
export const deleteCategory = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  const t = await sequelize.transaction();
  try {
    const categoryId = Number(req.params.id);
    const category = await Category.findByPk(categoryId);
    if (!category) {
      await t.rollback();
      return res.status(404).json({ message: "Category not found" });
    }

    // Check if category has any products associated with it
    const productCount = await ProductCategory.count({
      where: { categoryId: categoryId },
    });

    if (productCount > 0) {
      await t.rollback();
      return res.status(400).json({
        message:
          "Cannot delete category because it has associated products. Please remove all products from this category first.",
      });
    }

    // Recursive function to delete category and all its subcategories
    const deleteCategoryRecursive = async (id: number) => {
      const cat = await Category.findByPk(id, { transaction: t });
      if (!cat) return;

      // Get all subcategories
      const children = await Category.findAll({
        where: { parentId: id },
        transaction: t,
      });

      // Check if any subcategory has products
      for (const child of children) {
        const childProductCount = await ProductCategory.count({
          where: { categoryId: child.id },
        });

        if (childProductCount > 0) {
          await t.rollback();
          throw new Error(
            `Cannot delete category '${child.title}' because it has associated products. Please remove all products from this category first.`
          );
        }

        await deleteCategoryRecursive(child.id);
      }

      // Delete images from S3
      if (cat.image) {
        try {
          await deleteImage(cat.image);
        } catch (err) {
          console.warn("Failed to delete category image:", err);
        }
      }
      // Added deletion for second image
      if (cat.image2) {
        try {
          await deleteImage(cat.image2);
        } catch (err) {
          console.warn("Failed to delete category image2:", err);
        }
      }
      if (cat.metaImage) {
        try {
          await deleteImage(cat.metaImage);
        } catch (err) {
          console.warn("Failed to delete category metaImage:", err);
        }
      }

      // Delete the category itself
      await Category.destroy({ where: { id }, transaction: t });
    };

    await deleteCategoryRecursive(categoryId);

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// // Recursive helper to fetch subcategories
const getSubcategoriesForDropdown = async (parentId: number): Promise<any> => {
  const children = await Category.findAll({
    where: { parentId: parentId, status: "active" },
    order: [
      ["orderBy", "ASC"],
      ["title", "ASC"],
    ],
    attributes: [
      "id",
      "title",
      "slug",
      "image",
      "image2",
      "metaImage",
      "video", // Added video field
      "orderBy",
    ],
  });

  return Promise.all(
    children.map(async (child) => ({
      id: child.id,
      title: child.title,
      slug: child.slug,
      image: getFileUrl(child.image),
      image2: getFileUrl(child.image2),
      metaImage: getFileUrl(child.metaImage),
      video: getFileUrl(child.video), // Added video field
      subcategories: await getSubcategoriesForDropdown(child.id),
    }))
  );
};

// export const getCategoriesForDropdown = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const user = req.user;
//     const where: any = { parentId: null, type: "product" };

//     //  Public (no login)
//     if (!user) {
//       where.status = "active";
//       where.isPublic = true;
//     }

//     //  User with permission to view all categories
//     else if (hasPermission(user, "view_all_categories")) {
//       // no filters — show all
//     }

//     //  User with permission to view corporate categories
//     else if (hasPermission(user, "view_corporate_categories")) {
//       const corporateOwnerId = user.corporateId || user.id;
//       where.status = "active";
//       where.corporateId = corporateOwnerId;
//     }

//     //  Logged-in user without special permissions
//     else {
//       where.status = "active";

//       where.isPublic = true;
//     }

//     const topCategories = await Category.findAll({
//       where,
//       order: [["title", "ASC"]],
//       attributes: ["id", "title", "slug", "image", "image2", "metaImage"],
//     });

//     const data = await Promise.all(
//       topCategories.map(async (cat) => ({
//         id: cat.id,
//         title: cat.title,
//         slug: cat.slug,
//         image: getFileUrl(cat.image),
//         image2: getFileUrl(cat.image2),
//         metaImage: getFileUrl(cat.metaImage),
//         subcategories: await getSubcategoriesForDropdown(cat.id),
//       }))
//     );

//     return res.status(200).json({ success: true, data });
//   } catch (err) {
//     next(err);
//   }
// };

// --- PUBLIC: Get products under a category (by slug) ---

// ---------------------------------------------
// FIXED: Same response as before (no change)
// OPTIMIZED: Only 2 queries, no recursion
// ---------------------------------------------
export const getCategoriesForDropdown = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;

    // -------------------------------
    // 1) Build top-level WHERE clause
    // -------------------------------
    const where: any = { parentId: null, type: "product" };

    if (!user) {
      // Public
      where.status = "active";
      where.isPublic = true;
    } else if (hasPermission(user, "view_all_categories")) {
      // Admin with full access – no extra filters
    } else if (hasPermission(user, "view_corporate_categories")) {
      const corporateOwnerId = user.corporateId || user.id;
      where.status = "active";
      where.corporateId = corporateOwnerId;
    } else {
      // Normal logged-in user
      where.status = "active";
      where.isPublic = true;
    }

    // -------------------------------------
    // 2) Fetch TOP LEVEL categories
    // -------------------------------------
    const topCats = await Category.findAll({
      where,
      attributes: [
        "id",
        "title",
        "slug",
        "image",
        "image2",
        "metaImage",
        "video", // Added video field
        "parentId",
        "orderBy",
      ],
      order: [
        ["orderBy", "ASC"],
        ["title", "ASC"],
      ],
    });

    // If no top-level categories → return early
    if (topCats.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // -------------------------------------
    // 3) Build SAME FILTERS for SUBCATEGORIES
    // -------------------------------------
    const subWhere: any = {
      type: "product",
      status: where.status ?? "active",
    };

    // VERY IMPORTANT: replicate visibility logic
    if (where.isPublic !== undefined) {
      subWhere.isPublic = where.isPublic;
    }
    if (where.corporateId) {
      subWhere.corporateId = where.corporateId;
    }

    // -------------------------------------
    // 4) Fetch ALL subcategories ONCE
    // -------------------------------------
    const allCats = await Category.findAll({
      where: subWhere,
      attributes: [
        "id",
        "title",
        "slug",
        "image",
        "image2",
        "metaImage",
        "video", // Added video field
        "parentId",
        "orderBy",
      ],
      order: [
        ["orderBy", "ASC"],
        ["title", "ASC"],
      ], // keep EXACT same order as old recursive calls
    });

    // -------------------------------------
    // 5) Build a map to construct the tree
    // -------------------------------------
    const map: any = {};
    allCats.forEach((c) => {
      map[c.id] = {
        id: c.id,
        title: c.title,
        slug: c.slug,
        image: getFileUrl(c.image),
        image2: getFileUrl(c.image2),
        metaImage: getFileUrl(c.metaImage),
        video: getFileUrl(c.video), // Added video field
        parentId: c.parentId,
        subcategories: [],
      };
    });

    // Link children exactly as recursive function did
    allCats.forEach((c) => {
      if (c.parentId && map[c.parentId]) {
        map[c.parentId].subcategories.push(map[c.id]);
      }
    });

    // -------------------------------------
    // 6) Attach nested subcategories to topCats
    // -------------------------------------
    const data = topCats.map((cat) => ({
      id: cat.id,
      title: cat.title,
      slug: cat.slug,
      image: getFileUrl(cat.image),
      image2: getFileUrl(cat.image2),
      metaImage: getFileUrl(cat.metaImage),
      video: getFileUrl(cat.video), // Added video field
      subcategories: map[cat.id]?.subcategories || [],
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getProductsByCategorySlug = async (
  req: Request<{ slug: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const slug = req.params.slug;

    // 1️⃣ Find category by slug
    const category = await Category.findOne({
      where: { slug, status: "active" },
      attributes: [
        "id",
        "title",
        "h1",
        "subTitle",
        "slug",
        "metaTitle",
        "metaDesc",
        "metaImage",
        "parentId",
      ],
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // 🟢 1.5️⃣ Get all child categories (so products under subcategories also appear)
    const childCategories = await Category.findAll({
      where: { parentId: category.id, status: "active" },
      attributes: ["id"],
    });

    const categoryIds = [category.id, ...childCategories.map((c) => c.id)];

    // 2️⃣ Pagination setup
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "12"));
    const offset = (page - 1) * limit;

    // 3️⃣ Optional filters
    const { sort, gender, minPrice, maxPrice } = req.query;
    const where: any = { status: "active" };

    // Gender filter - Modified to support Unisex products
    if (gender) {
      const genderValues = (gender as string).split(",");
      // If filtering by Male or Female and Unisex products should also appear
      if (
        genderValues.includes("Male") ||
        genderValues.includes("Female") ||
        genderValues.includes("Unisex")
      ) {
        where.gender = {
          [Op.in]: genderValues.includes("Unisex")
            ? genderValues
            : [...genderValues, "Unisex"],
        };
      } else {
        where.gender = { [Op.in]: genderValues };
      }
    }
    if (minPrice && maxPrice)
      where.price = { [Op.between]: [Number(minPrice), Number(maxPrice)] };

    // Sorting
    let order: any = [["createdAt", "DESC"]];
    if (sort === "lowToHigh") order = [["price", "ASC"]];
    if (sort === "highToLow") order = [["price", "DESC"]];

    // ✅ 4️⃣ Fetch products (from category + subcategories)
    const { count: total, rows } = await Product.findAndCountAll({
      where,
      limit,
      offset,
      distinct: true,
      order,
      attributes: [
        "id",
        "title",
        "slug",
        "price",
        "featuredImage",
        "sizes",
        "bestSeller",
        "outOfStock",
        "createdAt",
      ],
      include: [
        {
          model: Category,
          as: "categories",
          where: { id: { [Op.in]: categoryIds } }, // ✅ includes children too
          required: true,
          attributes: ["id", "title", "slug", "parentId"],
          through: { attributes: [] },
        },
        {
          model: BulkOrder,
          as: "bulkOrders",
          attributes: ["id", "name", "percentage", "quantity"],
        },
      ],
    });

    // 5️⃣ Enrich and format
    const products = await Promise.all(
      rows.map(async (p: any) => {
        let json: any = p.toJSON();

        // Normalize URLs
        json.featuredImage = getFileUrl(
          json.featuredImage,
          "products/featured-image"
        );
        if (json.images) {
          json.images = json.images.map((img: any) => ({
            ...img,
            image: getFileUrl(img.image, "products/original"),
          }));
        }

        // Fetch readable size options
        let enrichedSizes: any[] = [];
        if (json.sizes?.length > 0) {
          const sizeIds = json.sizes.map((s: any) =>
            typeof s === "object" ? s.id : s
          );
          enrichedSizes = await Option.findAll({
            where: {
              id: sizeIds,
              optionType: "size", // Only fetch size options, not colors
            },
            attributes: ["id", "name"],
          });
        }
        json.sizes = enrichedSizes;

        // 🟢 Use the product's own category as parentCategory
        let breadcrumbs = null;

        if (json.categories && json.categories.length > 0) {
          // Prefer a category that has a parent (child category)
          const mainCategory =
            json.categories.find((c: any) => c.parentId) || json.categories[0];

          breadcrumbs = {
            slug: mainCategory.slug,
            title: mainCategory.title,
          };
        }

        let enriched = attachBulkOrderPrices(json);
        enriched.breadcrumbs = breadcrumbs;

        // Clean categories array from response
        delete enriched.categories;

        return enriched;
      })
    );

    // 6️⃣ Return response
    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      category: {
        id: category.id,
        title: category.title,
        h1: category.h1,
        subTitle: category.subTitle,
        slug: category.slug,
        metaTitle: category.metaTitle,
        metaDesc: category.metaDesc,
        metaImage: getFileUrl(category.metaImage),
        description: category.description,
      },
      data: products,
    });
  } catch (err) {
    next(err);
  }
};

// GET Profession Categories (paginated + minimal fields)
export const getProfessionCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1️⃣ Pagination setup
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    // 2️⃣ Fetch categories marked as profession categories
    const { count: total, rows } = await Category.findAndCountAll({
      where: {
        status: "active",
        isProfession: true, // Use the new isProfession field instead of parent category
      },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      attributes: [
        "id",
        "title",
        "subTitle",
        "image",
        "image2",
        "video",
        "slug",
      ], // Added video field
    });

    // 3️⃣ Normalize image URLs
    const data = rows.map((cat) => ({
      id: cat.id,
      title: cat.title,
      subTitle: cat.subTitle,
      slug: cat.slug,
      image: getFileUrl(cat.image),
      image2: getFileUrl(cat.image2),
      video: getFileUrl(cat.video), // Added video field
    }));

    // 4️⃣ Send minimal structured response
    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      // Removed parent category reference since we're not using a parent category anymore
      data,
    });
  } catch (err) {
    next(err);
  }
};

// import NodeCache from "node-cache";

// const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// export const getCategoriesForDropdown = async (
//   _req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     // 🧠 Step 1: Check cache
//     const cached = cache.get("category_dropdown");
//     if (cached) {
//       return res.status(200).json({ success: true, data: cached });
//     }

//     // 🧩 Step 2: Fetch all categories at once
//     const allCategories = await Category.findAll({
//       where: { status: "active" },
//       attributes: ["id", "parentId", "title", "slug", "image", "metaImage"],
//       order: [["title", "ASC"]],
//     });

//     // 🏗️ Step 3: Build a map of categories
//     const categoryMap = new Map<number, any>();
//     allCategories.forEach((cat) => {
//       categoryMap.set(cat.id, {
//         id: cat.id,
//         title: cat.title,
//         slug: cat.slug,
//         image: getFileUrl(cat.image),
//         metaImage: getFileUrl(cat.metaImage),
//         subcategories: [],
//       });
//     });

//     // 🧱 Step 4: Assemble parent-child hierarchy
//     const roots: any[] = [];
//     allCategories.forEach((cat) => {
//       const node = categoryMap.get(cat.id);
//       if (cat.parentId) {
//         const parent = categoryMap.get(cat.parentId);
//         if (parent) parent.subcategories.push(node);
//       } else {
//         roots.push(node);
//       }
//     });

//     // 💾 Step 5: Cache the result
//     cache.set("category_dropdown", roots);

//     // ✅ Step 6: Return the tree
//     return res.status(200).json({ success: true, data: roots });
//   } catch (err) {
//     next(err);
//   }
// };
