import e, { Request, Response, NextFunction } from "express";
import { col, fn, Op } from "sequelize";
import sequelize from "../config/database";

import Product from "../models/product.model";
import Category from "../models/category.model";
import ProductCategory from "../models/productCategory.model";
import ProductImage from "../models/productImage.model";
import Option from "../models/option.model";
import OrderProduct from "../models/orderProduct.model";

import {
  singleUpload,
  multiUpload,
  deleteImage,
  getFileUrl,
} from "../utils/awsS3";
import Tags from "../models/tags.model";
import { slugify } from "../utils/slugify";
import Tagged from "../models/tagged.model";
import ProductFaq from "../models/productFaq.model";
import ProductReview from "../models/productReview.model";
import BulkOrder from "../models/bulkOrder.model";
import { attachBulkOrderPrices } from "../utils/bulkOrderHelper";
import Wishlist from "../models/wishlist.model";
import {
  buildBreadcrumbInMemory,
  buildCategoryBreadcrumb,
  getDeepestCategory,
  getDeepestCategoryInMemory,
} from "../utils/breadcrumbHelper";
import ProductRelated from "../models/productRelated.model";

/**
 * Helper: parse form-data arrays (sent as JSON strings or arrays)
 */
const parseArrayField = (field: any) => {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  try {
    return JSON.parse(field);
  } catch {
    return typeof field === "string"
      ? field
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }
};
// Updated helper function to get tags for a product
const getProductTags = async (productId: number): Promise<any[]> => {
  const taggedRecords = await Tagged.findAll({
    where: {
      taggableId: productId,
      taggableType: "Product",
    },
    include: [
      {
        model: Tags,
        as: "tag",
        attributes: ["id", "name", "slug", "namespace"],
      },
    ],
  });

  return taggedRecords.map((record) => record.tag);
};

// CREATE PRODUCT
export const createProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const t = await sequelize.transaction();
  try {
    //  Auto-assign corporateId for corporates
    if (req.user!.role === "corporate") {
      req.body.corporateId = req.user!.id;
      req.body.corporate = true;
    }
    //  Required field validation
    const requiredFields = ["sku", "categories", "gender", "title", "slug"];
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      if (
        !req.body[field] ||
        (Array.isArray(req.body[field]) && !req.body[field].length)
      ) {
        missingFields.push(field);
      }
    }
    if (!(req.files as any)?.featuredImage?.[0]) {
      missingFields.push("featuredImage");
    }

    if (missingFields.length > 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const {
      title,
      slug,
      description,
      shortDescription,
      price,
      featuredProduct,
      bestSeller,
      sale,
      gender,
      length,
      breadth,
      height,
      weight,
      stockQuantity,
      minQuantity,
      metaTitle,
      metaDescription,
      metaKey,
      metaSchema,
      sku,
      hsn,
      majorFabric,
      minorFabric,
      pattenNumber,
      otherComments,
      corporate,
      corporateId,
      status,
      categories,
      sizes,
      tags,
      faqs,
      bulkOrders,
      orderBy,
      outOfStock,
      allowEmbroidery,
    } = req.body;

    const categoryIds = parseArrayField(categories).map((id: any) =>
      Number(id)
    );
    const parsedSizes = parseArrayField(sizes);
    const parsedTags = parseArrayField(tags);
    const parsedFaqs = parseArrayField(faqs);
    const parsedBulkOrders = bulkOrders
      ? Array.isArray(bulkOrders)
        ? bulkOrders
        : JSON.parse(bulkOrders)
      : [];

    // Prevent duplicate SKU
    if (sku) {
      const existingSku = await Product.findOne({ where: { sku } });
      if (existingSku) {
        await t.rollback();
        return res.status(400).json({ message: "SKU already exists" });
      }
    }

    // CREATE PRODUCT
    const product = await Product.create(
      {
        title,
        slug,
        description,
        shortDescription,
        price,
        featuredProduct,
        bestSeller,
        sale,
        gender,
        length,
        breadth,
        height,
        weight,
        stockQuantity,
        minQuantity,
        metaTitle,
        metaDescription,
        metaKey,
        metaSchema,
        sku,
        hsn,
        majorFabric,
        minorFabric,
        pattenNumber,
        otherComments,
        corporate,
        corporateId,
        status,
        sizes: parsedSizes,
        orderBy,
        outOfStock,
        allowEmbroidery,
      },
      { transaction: t }
    );

    // FEATURED IMAGE
    const featuredImageFile = (req.files as any)?.featuredImage?.[0];
    if (!featuredImageFile) {
      await t.rollback();
      return res.status(400).json({ message: "Featured image is required" });
    }
    if (featuredImageFile) {
      const key = await singleUpload(
        featuredImageFile,
        "products/featured-image"
      );
      await product.update({ featuredImage: key }, { transaction: t });
    }

    // EXTRA IMAGES
    const files = (req.files as any)?.images || [];
    if (files.length) {
      const uploads = await multiUpload(files);
      const imgs = uploads.map((key) => ({
        productId: product.id,
        image: key,
        status: "active",
      }));
      await ProductImage.bulkCreate(imgs, { transaction: t });
    }

    // VIDEO
    const videoFile = (req.files as any)?.video?.[0];
    const videoThumbnailFile = (req.files as any)?.videoThumbnail?.[0]; // ✅ new field

    if (videoFile) {
      const key = await singleUpload(videoFile, "products/video");
      await product.update({ video: key }, { transaction: t });
    }
    if (videoThumbnailFile) {
      const thumbnailKey = await singleUpload(
        videoThumbnailFile,
        "products/video-thumbnail"
      );
      await product.update(
        { videoThumbnail: thumbnailKey },
        { transaction: t }
      );
    }
    // CATEGORIES
    // Check if category IDs are valid (only if there are any)
    if (categoryIds.length > 0) {
      const validCount = await Category.count({ where: { id: categoryIds } });
      if (validCount !== categoryIds.length) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "One or more category IDs are invalid" });
      }
    }

    // Create product-category associations
    const pc = categoryIds.map((cid: number) => ({
      productId: product.id,
      categoryId: cid,
    }));
    await ProductCategory.bulkCreate(pc, { transaction: t });
    // TAGS
    if (tags) {
      const tagIds = parseArrayField(tags).map(Number);
      const validCount = await Tags.count({ where: { id: tagIds } });
      if (validCount !== tagIds.length) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "One or more tag IDs are invalid" });
      }
      if (tagIds.length) {
        const tgRows = tagIds.map((tid: number) => ({
          taggableId: product.id,
          taggableType: "Product",
          tagId: tid,
        }));
        await Tagged.bulkCreate(tgRows, { transaction: t });
      }
    }

    // FAQS
    if (parsedFaqs.length) {
      const faqRecords = parsedFaqs.map((faq: any) => ({
        productId: product.id,
        question: faq.question,
        answer: faq.answer,
        status: true,
      }));
      await ProductFaq.bulkCreate(faqRecords, { transaction: t });
    }

    // BULK ORDERS
    if (parsedBulkOrders.length) {
      const bulkOrderRecords = parsedBulkOrders.map((b: any) => ({
        productId: product.id,
        name: b.name,
        percentage: b.percentage,
        quantity: b.quantity,
      }));
      await BulkOrder.bulkCreate(bulkOrderRecords, { transaction: t });
    }

    await t.commit();

    // FETCH FULL PRODUCT
    const created = await Product.findByPk(product.id, {
      include: [
        {
          model: Category,
          as: "categories",
          attributes: ["id", "title"],
          through: { attributes: [] },
        },
        { model: ProductImage, as: "images" },
        { model: Tagged, as: "tagged", include: [{ model: Tags, as: "tag" }] },
        { model: ProductFaq, as: "faqs" },
        { model: BulkOrder, as: "bulkOrders" },
      ],
    });

    let jsonProduct: any = created?.toJSON();

    // normalize URLs
    jsonProduct.featuredImage = getFileUrl(
      jsonProduct.featuredImage,
      "products/featured-image"
    );
    if (jsonProduct.images) {
      jsonProduct.images = jsonProduct.images.map((img: any) => ({
        ...img,
        image: getFileUrl(img.image, "products/original"),
      }));
    }
    jsonProduct.video = getFileUrl(jsonProduct.video, "products/video");

    const enriched = attachBulkOrderPrices(jsonProduct);
    // Format monetary values to 2 decimal places
    if (enriched.price) {
      enriched.price = Number(enriched.price.toFixed(2));
    }
    if (enriched.displayPrice) {
      enriched.displayPrice = Number(enriched.displayPrice.toFixed(2));
    }
    if (enriched.bulkOrders && Array.isArray(enriched.bulkOrders)) {
      enriched.bulkOrders = enriched.bulkOrders.map((bulkOrder: any) => ({
        ...bulkOrder,
        price: Number(bulkOrder.price.toFixed(2)),
      }));
    }

    return res.status(201).json({ success: true, data: enriched });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// export const listPublicProducts = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     let userId: number | null = null;
//     let role: string | null = null;
//     let corporateId: number | null = null;

//     if (req.headers.authorization?.startsWith("Bearer ")) {
//       const token = req.headers.authorization.slice(7).trim();
//       try {
//         const payload: any = require("jsonwebtoken").verify(
//           token,
//           process.env.JWT_SECRET!
//         );
//         userId = payload.id;
//         role = payload.role;
//         corporateId = payload.corporateId ?? null;
//       } catch {
//         // invalid token ignored
//       }
//     }

//     const page = Math.max(1, parseInt((req.query.page as string) || "1"));
//     const limit = Math.max(1, parseInt((req.query.limit as string) || "12"));
//     const offset = (page - 1) * limit;

//     const {
//       search,
//       category,
//       gender,
//       minPrice,
//       maxPrice,
//       sort,
//       bestSeller,
//       color,
//     } = req.query;

//     const whereClause: any = { status: "active" };

//     whereClause[Op.and] = [];

//     if (role === "corporateUser") {
//       whereClause.corporateId = corporateId;
//     } else {
//       whereClause.corporateId = null;
//     }

//     if (search) {
//       whereClause[Op.or] = [
//         { title: { [Op.iLike]: `%${search}%` } },
//         { sku: { [Op.iLike]: `%${search}%` } },
//       ];
//     }

//     // Gender filter - Modified to support Unisex products
//     if (gender) {
//       const genderValues = (gender as string).split(",");
//       // If filtering by Male or Female and Unisex products should also appear
//       if (
//         genderValues.includes("Male") ||
//         genderValues.includes("Female") ||
//         genderValues.includes("Unisex")
//       ) {
//         whereClause.gender = {
//           [Op.in]: genderValues.includes("Unisex")
//             ? genderValues
//             : [...genderValues, "Unisex"],
//         };
//       } else {
//         whereClause.gender = { [Op.in]: genderValues };
//       }
//     }

//     if (bestSeller) {
//       whereClause.bestSeller = (bestSeller as string).toLowerCase() === "true";
//     }

//     if (color) {
//       const colorNames = (color as string).split(",").map((c) => c.trim());
//       const colorOptions = await Option.findAll({
//         where: {
//           optionType: "color",
//           name: { [Op.in]: colorNames },
//           status: "active",
//         },
//         attributes: ["id"],
//       });

//       const colorIds = colorOptions.map((opt) => opt.id);

//       if (colorIds.length > 0) {
//         const colorIdConditions = colorIds
//           .map((id) => `sizes::jsonb @> '[${id}]'`)
//           .join(" OR ");

//         whereClause[Op.and].push(sequelize.literal(`(${colorIdConditions})`));
//       } else {
//         return res.status(200).json({
//           success: true,
//           meta: { total: 0, page, limit, totalPages: 0 },
//           data: [],
//         });
//       }
//     }

//     const categoryFilter = category
//       ? {
//           model: Category,
//           as: "categories",
//           where: { slug: { [Op.in]: (category as string).split(",") } },
//           required: true,
//           attributes: ["id", "title", "slug", "parentId"],
//           through: { attributes: [] },
//         }
//       : {
//           model: Category,
//           as: "categories",
//           attributes: ["id", "title", "slug", "parentId"],
//           through: { attributes: [] },
//         };

//     let order: any = [["created_at", "DESC"]];
//     if (search) {
//       const q = String(search).trim();
//       order = [
//         [
//           sequelize.literal(`CASE
//            WHEN "Product"."title" ILIKE '${q}' THEN 1
//            WHEN "Product"."title" ILIKE '${q} %' THEN 2
//            WHEN "Product"."title" ILIKE '% ${q} %' THEN 3
//            WHEN "Product"."title" ILIKE '%${q}%' THEN 4
//            ELSE 5
//           END`),
//           "ASC",
//         ],
//         ["created_at", "DESC"],
//       ];
//     } else {
//       if (sort === "lowToHigh") {
//         // Sort by displayPrice ascending
//         order = [
//           [
//             sequelize.literal(`COALESCE(
//           (
//             SELECT ROUND(price - (price * bo.percentage / 100))
//             FROM bulk_orders bo
//             WHERE bo.product_id = "Product".id
//             ORDER BY bo.quantity ASC
//             LIMIT 1
//           ),
//           price
//         )`),
//             "ASC",
//           ],
//         ];
//       } else if (sort === "highToLow") {
//         // Sort by displayPrice descending
//         order = [
//           [
//             sequelize.literal(`COALESCE(
//           (
//             SELECT ROUND(price - (price * bo.percentage / 100))
//             FROM bulk_orders bo
//             WHERE bo.product_id = "Product".id
//             ORDER BY bo.quantity ASC
//             LIMIT 1
//           ),
//           price
//         )`),
//             "DESC",
//           ],
//         ];
//       } else {
//         order = [["created_at", "DESC"]];
//       }
//     }

//     if (minPrice || maxPrice) {
//       const min = Number(minPrice) || 0;
//       const max = Number(maxPrice) || 999999999;

//       // ---------- FIX 3: PUSH instead of overwrite ----------

//       whereClause[Op.and].push(
//         sequelize.literal(`
//           (
//             COALESCE(
//               (
//                 SELECT ROUND(price - (price * bo.percentage / 100))
//                 FROM bulk_orders bo
//                 WHERE bo.product_id = "Product".id
//                 ORDER BY bo.quantity ASC
//                 LIMIT 1
//               ),
//               price
//             )
//           ) BETWEEN ${min} AND ${max}
//         `)
//       );
//     }

//     const { count: total, rows } = await Product.findAndCountAll({
//       where: whereClause,
//       limit,
//       offset,
//       distinct: true,
//       order,
//       attributes: [
//         "id",
//         "title",
//         "slug",
//         "featuredImage",
//         "price",
//         "orderBy",
//         "gender",
//         "outOfStock",
//         "bestSeller",
//         "createdAt",
//         "sizes",
//       ],
//       include: [
//         categoryFilter,
//         {
//           model: BulkOrder,
//           as: "bulkOrders",
//           attributes: ["id", "name", "percentage", "quantity"],
//         },
//       ],
//     });

//     // ============================
//     // 🔧 FIX: Ensure full breadcrumbs when filtering by category
//     // ============================

//     const productIds = rows.map((r: any) => r.id);

//     const productCategoryLinks = await ProductCategory.findAll({
//       where: { productId: productIds },
//       attributes: ["productId", "categoryId"],
//     });

//     const categoryIds = Array.from(
//       new Set(productCategoryLinks.map((pc: any) => pc.categoryId))
//     );

//     const allRelatedCategories = await Category.findAll({
//       where: { id: categoryIds },
//       attributes: ["id", "title", "slug", "parentId"],
//     });
//     const parentIds = new Set<number>();

//     for (const cat of allRelatedCategories) {
//       let current = cat;
//       while (current?.parentId) {
//         parentIds.add(current.parentId);
//         current = allRelatedCategories.find(
//           (c) => c.id === current.parentId
//         ) as any;
//         if (!current) break;
//       }
//     }

//     const parentCategories = await Category.findAll({
//       where: { id: [...parentIds] },
//       attributes: ["id", "title", "slug", "parentId"],
//     });

//     const categoryMap = new Map<number, any>();

//     [...allRelatedCategories, ...parentCategories].forEach((c: any) => {
//       categoryMap.set(c.id, c.toJSON ? c.toJSON() : c);
//     });

//     const categoryById = new Map<number, any>(
//       allRelatedCategories.map((c: any) =>
//         typeof c.toJSON === "function" ? [c.id, c.toJSON()] : [c.id, c]
//       )
//     );

//     const categoriesByProductId: Record<number, any[]> = {};
//     for (const link of productCategoryLinks) {
//       const pid: any = link.productId;
//       const cid: any = link.categoryId;
//       const cat = categoryById.get(cid);
//       if (!cat) continue;
//       if (!categoriesByProductId[pid]) categoriesByProductId[pid] = [];
//       categoriesByProductId[pid].push(cat);
//     }

//     // ============================

//     let wishlistProductIds: number[] = [];
//     if (userId) {
//       const wishlistItems = await Wishlist.findAll({
//         where: { userId },
//         attributes: ["productId"],
//       });
//       wishlistProductIds = wishlistItems.map((w) => w.productId);
//     }

//     const enrichedRows = (
//       await Promise.all(
//         rows.map(async (p: any) => {
//           const jsonProduct = p.toJSON();

//           jsonProduct.featuredImage = getFileUrl(
//             jsonProduct.featuredImage,
//             "products/featured-image"
//           );

//           // 🔧 Use full categories fetched above
//           const allCategories = categoriesByProductId[p.id] || [];

//           const primaryCategory = getDeepestCategoryInMemory(
//             allCategories,
//             categoryMap
//           );

//           const breadcrumbs = primaryCategory
//             ? [
//                 ...buildBreadcrumbInMemory(primaryCategory, categoryMap),
//                 primaryCategory,
//               ]
//             : [];

//           let enriched = attachBulkOrderPrices(jsonProduct);

//           if (enriched.price)
//             enriched.price = Number(enriched.price.toFixed(2));
//           if (enriched.displayPrice)
//             enriched.displayPrice = Number(enriched.displayPrice.toFixed(2));
//           if (enriched.bulkOrders && Array.isArray(enriched.bulkOrders)) {
//             enriched.bulkOrders = enriched.bulkOrders.map((bulkOrder: any) => ({
//               ...bulkOrder,
//               price: Number(bulkOrder.price.toFixed(2)),
//             }));
//           }
//           delete enriched.bulkOrders;
//           delete enriched.categories;

//           enriched.isWishlisted = wishlistProductIds.includes(p.id);
//           enriched.breadcrumbs = breadcrumbs;

//           // // --- Apply displayPrice filtering here ---
//           // const hasMin =
//           //   minPrice !== undefined && minPrice !== null && minPrice !== "";
//           // const hasMax =
//           //   maxPrice !== undefined && maxPrice !== null && maxPrice !== "";

//           // if (hasMin || hasMax) {
//           //   const dp = enriched.displayPrice ?? enriched.price ?? 0; // fallback safety

//           //   const min = hasMin ? Number(minPrice) : 0;
//           //   const max = hasMax ? Number(maxPrice) : Infinity;

//           //   if (dp < min || dp > max) return null; // filtered out
//           // }

//           return enriched;
//         })
//       )
//     ).filter(Boolean);

//     // Sorting is now handled at the database level
//     // No client-side sorting needed

//     // 🔍 If ?category= is passed, fetch category meta info
//     let categoryMeta = null;

//     if (category) {
//       const firstSlug = (category as string).split(",")[0];

//       const cat = await Category.findOne({
//         where: { slug: firstSlug, status: "active" },
//         attributes: [
//           "id",
//           "title",
//           "h1",
//           "subTitle",
//           "slug",
//           "metaTitle",
//           "metaDesc",
//           "metaImage",
//           "description",
//         ],
//       });

//       if (cat) {
//         categoryMeta = {
//           id: cat.id,
//           title: cat.title,
//           h1: cat.h1,
//           subTitle: cat.subTitle,
//           slug: cat.slug,
//           metaTitle: cat.metaTitle,
//           metaDesc: cat.metaDesc,
//           metaImage: getFileUrl(cat.metaImage),
//         };
//       }
//     }

//     return res.status(200).json({
//       success: true,
//       meta: {
//         total: total,
//         page,
//         limit,
//         totalPages: Math.ceil(total / limit),
//       },
//       category: categoryMeta,

//       data: enrichedRows,
//     });
//   } catch (err) {
//     next(err);
//   }
// };

export const listPublicProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let userId: number | null = null;
    let role: string | null = null;
    let corporateId: number | null = null;

    if (req.headers.authorization?.startsWith("Bearer ")) {
      const token = req.headers.authorization.slice(7).trim();
      try {
        const payload: any = require("jsonwebtoken").verify(
          token,
          process.env.JWT_SECRET!
        );
        userId = payload.id;
        role = payload.role;
        corporateId = payload.corporateId ?? null;
      } catch {
        // invalid token ignored
      }
    }

    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "12"));
    const offset = (page - 1) * limit;

    const {
      search,
      category,
      gender,
      minPrice,
      maxPrice,
      sort,
      bestSeller,
      color,
    } = req.query;

    const whereClause: any = { status: "active" };

    whereClause[Op.and] = [];

    if (role === "corporateUser") {
      whereClause.corporateId = corporateId;
    } else {
      whereClause.corporateId = null;
    }

    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Gender filter - Modified to support Unisex products
    if (gender) {
      const genderValues = (gender as string).split(",");
      // If filtering by Male or Female and Unisex products should also appear
      if (
        genderValues.includes("Male") ||
        genderValues.includes("Female") ||
        genderValues.includes("Unisex")
      ) {
        whereClause.gender = {
          [Op.in]: genderValues.includes("Unisex")
            ? genderValues
            : [...genderValues, "Unisex"],
        };
      } else {
        whereClause.gender = { [Op.in]: genderValues };
      }
    }

    if (bestSeller) {
      whereClause.bestSeller = (bestSeller as string).toLowerCase() === "true";
    }

    if (color) {
      const colorNames = (color as string).split(",").map((c) => c.trim());
      const colorOptions = await Option.findAll({
        where: {
          optionType: "color",
          name: { [Op.in]: colorNames },
          status: "active",
        },
        attributes: ["id"],
      });

      const colorIds = colorOptions.map((opt) => opt.id);

      if (colorIds.length > 0) {
        const colorIdConditions = colorIds
          .map((id) => `sizes::jsonb @> '[${id}]'`)
          .join(" OR ");

        whereClause[Op.and].push(sequelize.literal(`(${colorIdConditions})`));
      } else {
        return res.status(200).json({
          success: true,
          meta: { total: 0, page, limit, totalPages: 0 },
          data: [],
        });
      }
    }

    let categoryFilter: any = {
      model: Category,
      as: "categories",
      attributes: ["id", "title", "slug", "parentId"],
      through: { attributes: [] },
    };

    if (category) {
      const slugs = (category as string).split(",");

      // Get parent categories by slug
      const parentCategories = await Category.findAll({
        where: { slug: { [Op.in]: slugs } },
        attributes: ["id"],
      });

      const parentIds = parentCategories.map((c) => c.id);

      // Recursive children collector (same as admin version)
      const collectSubCategories = async (ids: number[]): Promise<number[]> => {
        if (!ids.length) return [];

        const children = await Category.findAll({
          where: { parentId: { [Op.in]: ids } },
          attributes: ["id"],
        });

        if (!children.length) return [];

        const childIds = children.map((c) => c.id);
        return [...childIds, ...(await collectSubCategories(childIds))];
      };

      const childIds = await collectSubCategories(parentIds);
      const allCategoryIds = [...parentIds, ...childIds];

      categoryFilter = {
        model: Category,
        as: "categories",
        where: { id: { [Op.in]: allCategoryIds } },
        required: true,
        attributes: ["id", "title", "slug", "parentId"],
        through: { attributes: [] },
      };
    }

    let order: any = [["created_at", "DESC"]];
    if (search) {
      const q = String(search).trim();
      order = [
        [
          sequelize.literal(`CASE
           WHEN "Product"."title" ILIKE '${q}' THEN 1
           WHEN "Product"."title" ILIKE '${q} %' THEN 2
           WHEN "Product"."title" ILIKE '% ${q} %' THEN 3
           WHEN "Product"."title" ILIKE '%${q}%' THEN 4
           ELSE 5
          END`),
          "ASC",
        ],
        ["created_at", "DESC"],
      ];
    } else {
      if (sort === "lowToHigh") {
        // Sort by displayPrice ascending
        order = [
          [
            sequelize.literal(`COALESCE(
          (
            SELECT ROUND(price - (price * bo.percentage / 100))
            FROM bulk_orders bo
            WHERE bo.product_id = "Product".id
            ORDER BY bo.quantity ASC
            LIMIT 1
          ),
          price
        )`),
            "ASC",
          ],
        ];
      } else if (sort === "highToLow") {
        // Sort by displayPrice descending
        order = [
          [
            sequelize.literal(`COALESCE(
          (
            SELECT ROUND(price - (price * bo.percentage / 100))
            FROM bulk_orders bo
            WHERE bo.product_id = "Product".id
            ORDER BY bo.quantity ASC
            LIMIT 1
          ),
          price
        )`),
            "DESC",
          ],
        ];
      } else {
        order = [["created_at", "DESC"]];
      }
    }

    if (minPrice || maxPrice) {
      const min = Number(minPrice) || 0;
      const max = Number(maxPrice) || 999999999;

      // ---------- FIX 3: PUSH instead of overwrite ----------

      whereClause[Op.and].push(
        sequelize.literal(`
          (
            COALESCE(
              (
                SELECT ROUND(price - (price * bo.percentage / 100))
                FROM bulk_orders bo
                WHERE bo.product_id = "Product".id
                ORDER BY bo.quantity ASC
                LIMIT 1
              ),
              price
            )
          ) BETWEEN ${min} AND ${max}
        `)
      );
    }

    const { count: total, rows } = await Product.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      distinct: true,
      order,
      attributes: [
        "id",
        "title",
        "slug",
        "featuredImage",
        "price",
        "orderBy",
        "gender",
        "outOfStock",
        "bestSeller",
        "createdAt",
        "sizes",
      ],
      include: [
        categoryFilter,
        {
          model: BulkOrder,
          as: "bulkOrders",
          attributes: ["id", "name", "percentage", "quantity"],
        },
      ],
    });

    // ============================
    // 🔧 FIX: Ensure full breadcrumbs when filtering by category
    // ============================

    const productIds = rows.map((r: any) => r.id);

    const productCategoryLinks = await ProductCategory.findAll({
      where: { productId: productIds },
      attributes: ["productId", "categoryId"],
    });

    const categoryIds = Array.from(
      new Set(productCategoryLinks.map((pc: any) => pc.categoryId))
    );

    const allRelatedCategories = await Category.findAll({
      where: { id: categoryIds },
      attributes: ["id", "title", "slug", "parentId"],
    });
    const parentIds = new Set<number>();

    for (const cat of allRelatedCategories) {
      let current = cat;
      while (current?.parentId) {
        parentIds.add(current.parentId);
        current = allRelatedCategories.find(
          (c) => c.id === current.parentId
        ) as any;
        if (!current) break;
      }
    }

    const parentCategories = await Category.findAll({
      where: { id: [...parentIds] },
      attributes: ["id", "title", "slug", "parentId"],
    });

    const categoryMap = new Map<number, any>();

    [...allRelatedCategories, ...parentCategories].forEach((c: any) => {
      categoryMap.set(c.id, c.toJSON ? c.toJSON() : c);
    });

    const categoryById = new Map<number, any>(
      allRelatedCategories.map((c: any) =>
        typeof c.toJSON === "function" ? [c.id, c.toJSON()] : [c.id, c]
      )
    );

    const categoriesByProductId: Record<number, any[]> = {};
    for (const link of productCategoryLinks) {
      const pid: any = link.productId;
      const cid: any = link.categoryId;
      const cat = categoryById.get(cid);
      if (!cat) continue;
      if (!categoriesByProductId[pid]) categoriesByProductId[pid] = [];
      categoriesByProductId[pid].push(cat);
    }

    // ============================

    let wishlistProductIds: number[] = [];
    if (userId) {
      const wishlistItems = await Wishlist.findAll({
        where: { userId },
        attributes: ["productId"],
      });
      wishlistProductIds = wishlistItems.map((w) => w.productId);
    }

    const enrichedRows = (
      await Promise.all(
        rows.map(async (p: any) => {
          const jsonProduct = p.toJSON();

          jsonProduct.featuredImage = getFileUrl(
            jsonProduct.featuredImage,
            "products/featured-image"
          );

          // 🔧 Use full categories fetched above
          const allCategories = categoriesByProductId[p.id] || [];

          const primaryCategory = getDeepestCategoryInMemory(
            allCategories,
            categoryMap
          );

          const breadcrumbs = primaryCategory
            ? [
                ...buildBreadcrumbInMemory(primaryCategory, categoryMap),
                primaryCategory,
              ]
            : [];

          let enriched = attachBulkOrderPrices(jsonProduct);

          if (enriched.price)
            enriched.price = Number(enriched.price.toFixed(2));
          if (enriched.displayPrice)
            enriched.displayPrice = Number(enriched.displayPrice.toFixed(2));
          if (enriched.bulkOrders && Array.isArray(enriched.bulkOrders)) {
            enriched.bulkOrders = enriched.bulkOrders.map((bulkOrder: any) => ({
              ...bulkOrder,
              price: Number(bulkOrder.price.toFixed(2)),
            }));
          }
          delete enriched.bulkOrders;
          delete enriched.categories;

          enriched.isWishlisted = wishlistProductIds.includes(p.id);
          enriched.breadcrumbs = breadcrumbs;

          return enriched;
        })
      )
    ).filter(Boolean);

    // Sorting is now handled at the database level
    // No client-side sorting needed

    // 🔍 If ?category= is passed, fetch category meta info
    let categoryMeta = null;

    if (category) {
      const firstSlug = (category as string).split(",")[0];

      const cat = await Category.findOne({
        where: { slug: firstSlug, status: "active" },
        attributes: [
          "id",
          "title",
          "h1",
          "subTitle",
          "slug",
          "metaTitle",
          "metaDesc",
          "metaImage",
          "description",
        ],
      });

      if (cat) {
        categoryMeta = {
          id: cat.id,
          title: cat.title,
          h1: cat.h1,
          subTitle: cat.subTitle,
          slug: cat.slug,
          metaTitle: cat.metaTitle,
          metaDesc: cat.metaDesc,
          metaImage: getFileUrl(cat.metaImage),
        };
      }
    }

    return res.status(200).json({
      success: true,
      meta: {
        total: total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      category: categoryMeta,

      data: enrichedRows,
    });
  } catch (err) {
    next(err);
  }
};

export const searchPublicProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const searchTerm = (req.params.search || "").trim();
    if (!searchTerm) {
      return res
        .status(400)
        .json({ success: false, message: "search param required" });
    }

    // Optional JWT parse (same logic you used) — wishlist detection
    let userId: number | null = null;
    let role: string | null = null;
    if (req.headers.authorization?.startsWith("Bearer ")) {
      const token = req.headers.authorization.slice(7).trim();
      try {
        const payload: any = require("jsonwebtoken").verify(
          token,
          process.env.JWT_SECRET!
        );
        userId = payload.id;
        role = payload.role;
      } catch {
        // ignore invalid token
      }
    }

    // optional limit query, default to 100 to avoid huge responses
    const limit = Math.max(
      1,
      Math.min(500, parseInt((req.query.limit as string) || "100"))
    );

    // base where
    const whereClause: any = { status: "active" };

    // search across title and description
    whereClause[Op.or] = [
      { title: { [Op.iLike]: `%${searchTerm}%` } },
      { sku: { [Op.iLike]: `%${searchTerm}%` } },
    ];

    // corporate visibility if needed (mirrors your public endpoint)
    if (role === "corporateUser") whereClause.corporateId = userId;

    // Check if corporateId is passed in query parameters
    const { corporateId } = req.query;

    // If corporateId is provided, filter products by that corporateId
    if (corporateId) {
      whereClause.corporateId = Number(corporateId);
    } else {
      // If no corporateId is provided, only show products where corporateId is null
      whereClause.corporateId = null;
    }

    // fetch minimal product attributes + categories (for breadcrumbs)
    const products = await Product.findAll({
      where: whereClause,
      limit,
      attributes: [
        "id",
        "title",
        "slug",
        "featuredImage",
        "price",
        "corporateId",
      ],
      include: [
        {
          model: Category,
          as: "categories",
          attributes: ["id", "title", "slug", "parentId"],
          through: { attributes: [] },
        },
      ],
      order: [
        [
          sequelize.literal(`CASE
        WHEN "Product"."title" ILIKE '${searchTerm}' THEN 1
        WHEN "Product"."title" ILIKE '${searchTerm} %' THEN 2
        WHEN "Product"."title" ILIKE '% ${searchTerm} %' THEN 3
        WHEN "Product"."title" ILIKE '%${searchTerm}%' THEN 4
        ELSE 5
      END`),
          "ASC",
        ],
      ],
      // distinct: true,
    });

    // wishlist product ids if logged in
    let wishlistProductIds: number[] = [];
    if (userId) {
      const wishlistItems = await Wishlist.findAll({
        where: { userId },
        attributes: ["productId"],
      });
      wishlistProductIds = wishlistItems.map((w: any) => w.productId);
    }

    // build response array
    const data = await Promise.all(
      products.map(async (p: any) => {
        const json = p.toJSON();

        // featured image url
        const featuredImage = getFileUrl(
          json.featuredImage,
          "products/featured-image"
        );

        // categories -> get deepest category -> build breadcrumbs (same helpers as your main API)
        // const allCategories = (json.categories || []).map((c: any) =>
        //   typeof c.toJSON === "function" ? c.toJSON() : c
        // );

        // let breadcrumbs: any[] = [];
        // if (allCategories.length > 0) {
        //   const primaryCategory = await getDeepestCategory(allCategories);
        //   if (primaryCategory) {
        //     const parentChain = await buildCategoryBreadcrumb(primaryCategory);
        //     breadcrumbs = [...parentChain, primaryCategory];
        //   }
        // }

        return {
          id: json.id,
          title: json.title,
          slug: json.slug,
          featuredImage,
          price: json.price,
          corporateId: json.corporateId,
          // breadcrumbs,
          isWishlisted: userId
            ? wishlistProductIds.includes(json.id)
            : undefined,
        };
      })
    );

    return res.status(200).json({
      success: true,
      meta: { total: data.length },
      data,
    });
  } catch (err) {
    next(err);
  }
};

// --- ADMIN / CORPORATE API ---

export const listAdminProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user!;

    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "12"));
    const offset = (page - 1) * limit;

    const {
      search,
      category,
      gender,
      minPrice,
      maxPrice,
      sort,
      status,
      corporateProduct,
      stock,
      corporateId,
    } = req.query;

    const whereClause: any = {};

    // 🔹 Corporate user sees only their own products
    if (user.role === "corporate") {
      whereClause.corporateId = user.id;
    }

    // 🔹 Superadmin and Admin can filter by corporateId (from query param)
    if ((user.role === "superadmin" || user.role === "admin") && corporateId) {
      whereClause.corporateId = Number(corporateId);
    }

    if (corporateProduct === "true") {
      whereClause.corporate = true; // only corporate products
    }
    if (corporateProduct === "false") {
      whereClause.corporate = false; // only non-corporate products
    }

    if (status) {
      whereClause.status = status; // exact match
    }

    // Stock filter
    if (stock) {
      if (stock === "inStock") {
        whereClause.outOfStock = false;
      }
      if (stock === "lowStock") {
        const threshold = 5;
        whereClause.stockQuantity = { [Op.gt]: 0, [Op.lte]: threshold };
      }
      if (stock === "outOfStock") {
        whereClause.outOfStock = true;
      }
    }

    // Search filter
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Gender filter - Modified to support Unisex products
    if (gender) {
      const genderValues = (gender as string).split(",");
      // If filtering by Male or Female and Unisex products should also appear
      if (
        genderValues.includes("Male") ||
        genderValues.includes("Female") ||
        genderValues.includes("Unisex")
      ) {
        whereClause.gender = {
          [Op.in]: genderValues.includes("Unisex")
            ? genderValues
            : [...genderValues, "Unisex"],
        };
      } else {
        whereClause.gender = { [Op.in]: genderValues };
      }
    }

    // Price range filter
    if (minPrice && maxPrice) {
      whereClause.price = {
        [Op.between]: [Number(minPrice), Number(maxPrice)],
      };
    }

    // Category filter with subcategory support
    let categoryFilter: any = {
      model: Category,
      as: "categories",
      attributes: ["id", "title", "slug"],
      through: { attributes: [] },
    };

    if (category) {
      const categoryIds = (category as string)
        .split(",")
        .map((id) => Number(id))
        .filter(Boolean);

      const collectSubCategories = async (ids: number[]): Promise<number[]> => {
        if (!ids.length) return [];
        const children = await Category.findAll({
          where: { parentId: { [Op.in]: ids } },
          attributes: ["id"],
        });
        if (!children.length) return [];
        const childIds = children.map((c) => c.id);
        return [...childIds, ...(await collectSubCategories(childIds))];
      };

      const subCategoryIds = await collectSubCategories(categoryIds);
      const allCategoryIds = [...categoryIds, ...subCategoryIds];

      categoryFilter = {
        model: Category,
        as: "categories",
        where: { id: { [Op.in]: allCategoryIds } },
        required: true,
        attributes: ["id", "title", "slug"],
        through: { attributes: [] },
      };
    }

    // Sorting
    let order: any = [["created_at", "DESC"]];
    if (sort === "lowToHigh") order = [["price", "ASC"]];
    if (sort === "highToLow") order = [["price", "DESC"]];

    // Fetch products
    const { count: total, rows } = await Product.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      distinct: true,
      order,
      include: [categoryFilter, { model: ProductImage, as: "images" }],
    });

    const enrichedRows = rows.map((p: any) => {
      const jsonProduct: any = p.toJSON();
      jsonProduct.featuredImage = getFileUrl(
        jsonProduct.featuredImage,
        "products/featured-image"
      );
      if (jsonProduct.images) {
        jsonProduct.images = jsonProduct.images.map((img: any) => ({
          ...img,
          image: getFileUrl(img.image, "products/original"),
        }));
      }
      jsonProduct.video = getFileUrl(jsonProduct.video, "products/video");

      const enriched = attachBulkOrderPrices(jsonProduct);
      // Format monetary values to 2 decimal places
      if (enriched.price) {
        enriched.price = Number(enriched.price.toFixed(2));
      }
      if (enriched.displayPrice) {
        enriched.displayPrice = Number(enriched.displayPrice.toFixed(2));
      }
      if (enriched.bulkOrders && Array.isArray(enriched.bulkOrders)) {
        enriched.bulkOrders = enriched.bulkOrders.map((bulkOrder: any) => ({
          ...bulkOrder,
          price: Number(bulkOrder.price.toFixed(2)),
        }));
      }

      return enriched;
    });

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: enrichedRows,
    });
  } catch (err) {
    next(err);
  }
};

// GET PRODUCT BY ID

export const getProductById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [
        {
          model: Category,
          as: "categories",
          attributes: ["id", "title", "slug"],
          through: { attributes: [] },
        },
        {
          model: ProductImage,
          as: "images",
          attributes: ["id", "status", "image"],
        },
        {
          model: ProductFaq,
          as: "faqs",
          attributes: ["id", "question", "answer"],
        },
        {
          model: ProductReview,
          as: "reviews",
          attributes: ["id", "rating", "userId", "created_at"],
        },
        {
          model: BulkOrder,
          as: "bulkOrders",
          attributes: ["id", "name", "percentage", "quantity"],
        },
      ],
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Sizes
    let enrichedSizes: any[] = [];
    if (product.sizes && product.sizes.length > 0) {
      enrichedSizes = await Option.findAll({
        where: {
          id: product.sizes,
          // optionType: "size", // Only fetch size options, not colors
        },
        attributes: ["id", "name"],
      });
    }

    // Tags
    const tags = await getProductTags(Number(req.params.id));

    const jsonProduct: any = product.toJSON();
    jsonProduct.tags = tags;

    // Normalize media URLs
    if (jsonProduct.images && jsonProduct.images.length > 0) {
      jsonProduct.images = jsonProduct.images.map((img: any) => ({
        ...img,
        image: getFileUrl(img.image, "products/original"),
      }));
    }

    jsonProduct.featuredImage = getFileUrl(
      jsonProduct.featuredImage,
      "products/featured-image"
    );
    jsonProduct.video = getFileUrl(jsonProduct.video, "products/video");
    jsonProduct.videoThumbnail = getFileUrl(
      jsonProduct.videoThumbnail,
      "products/video-thumbnail"
    );

    const enriched = attachBulkOrderPrices(jsonProduct);
    enriched.sizes = enrichedSizes;

    return res.status(200).json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

// UPDATE PRODUCT
export const updateProduct = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  const t = await sequelize.transaction();
  try {
    const productId = Number(req.params.id);
    const product = await Product.findByPk(productId, { transaction: t });
    if (!product) {
      await t.rollback();
      return res.status(404).json({ message: "Product not found" });
    }

    //  Required field validation (same as createProduct)
    const requiredFields = ["sku", "categories", "gender", "title", "slug"];
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      if (
        !req.body[field] ||
        (Array.isArray(req.body[field]) && !req.body[field].length)
      ) {
        missingFields.push(field);
      }
    }
    if (!(req.files as any)?.featuredImage?.[0] && !product.featuredImage) {
      // only enforce if product already doesn't have a featuredImage
      missingFields.push("featuredImage");
    }

    if (missingFields.length > 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    if (req.body?.sizes) {
      const parsedSizes = parseArrayField(req.body.sizes);
      req.body.sizes = parsedSizes;
    }
    // Prevent SKU conflict when updating
    if (req.body.sku) {
      const exists = await Product.findOne({
        where: { sku: req.body.sku, id: { [Op.ne]: productId } },
      });

      if (exists) {
        await t.rollback();
        return res.status(400).json({ message: "SKU already exists" });
      }
    }

    // 🔒 Corporate toggle rule
    if (req.body?.corporate === false || req.body?.corporate === "false") {
      req.body.corporateId = null;
    }

    // Update product fields
    await product.update(req.body, { transaction: t });

    // Featured image
    const featuredImageFile = (req.files as any)?.featuredImage?.[0];
    if (featuredImageFile) {
      if (product.featuredImage) await deleteImage(product.featuredImage);
      const key = await singleUpload(
        featuredImageFile,
        "products/featured-image"
      );
      await product.update({ featuredImage: key }, { transaction: t });
    }

    // Extra images (partial update: add/remove)
    if (req.files && (req.files as any).images) {
      const files = (req.files as any).images;
      if (files.length) {
        const uploads = await multiUpload(files);
        const imgs = uploads.map((key) => ({
          productId,
          image: key,
          status: "active",
        }));
        await ProductImage.bulkCreate(imgs, { transaction: t });
      }
    }

    // Remove selected images
    if (req.body?.removeImages) {
      const removeIds = parseArrayField(req.body.removeImages).map(Number);
      const toDelete = await ProductImage.findAll({
        where: { id: removeIds, productId },
        transaction: t,
      });
      for (const img of toDelete) {
        await deleteImage(img.image);
      }
      await ProductImage.destroy({
        where: { id: removeIds, productId },
        transaction: t,
      });
    }

    // Video
    const videoFile = (req.files as any)?.video?.[0];
    const videoThumbnailFile = (req.files as any)?.videoThumbnail?.[0];

    if (videoFile) {
      if (product.video) await deleteImage(product.video);
      const key = await singleUpload(videoFile, "products/video");
      await product.update({ video: key }, { transaction: t });
    }

    if (videoThumbnailFile) {
      if (product.videoThumbnail) await deleteImage(product.videoThumbnail);
      const key = await singleUpload(
        videoThumbnailFile,
        "products/video-thumbnail"
      );
      await product.update({ videoThumbnail: key }, { transaction: t });
    }
    // Categories
    if (req.body?.categories !== undefined) {
      const categoryIds = parseArrayField(req.body.categories).map((id: any) =>
        Number(id)
      );
      // Check if category IDs are valid (only if there are any)
      if (categoryIds.length > 0) {
        const validCount = await Category.count({
          where: { id: categoryIds },
          transaction: t,
        });
        if (validCount !== categoryIds.length) {
          await t.rollback();
          return res
            .status(400)
            .json({ message: "One or more category IDs are invalid" });
        }
      }

      const existing = await ProductCategory.findAll({
        where: { productId },
        transaction: t,
      });
      const existingIds = existing.map((c) => c.categoryId);

      const toAdd = categoryIds.filter(
        (cid: number) => !existingIds.includes(cid)
      );
      if (toAdd.length) {
        await ProductCategory.bulkCreate(
          toAdd.map((cid: number) => ({ productId, categoryId: cid })),
          { transaction: t }
        );
      }

      const toRemove = existingIds.filter((cid) => !categoryIds.includes(cid));
      const toRemoveClean = toRemove.filter(
        (cid): cid is number => cid !== null
      );

      if (toRemoveClean.length) {
        await ProductCategory.destroy({
          where: {
            productId: productId,
            categoryId: { [Op.in]: toRemoveClean },
          },
          transaction: t,
        });
      }
    }

    // Tags
    if (req.body?.tags) {
      const tagIds = parseArrayField(req.body.tags).map(Number);
      const validCount = await Tags.count({ where: { id: tagIds } });
      if (validCount !== tagIds.length) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "One or more tag IDs are invalid" });
      }

      const existing = await Tagged.findAll({
        where: { taggableId: productId, taggableType: "Product" },
        transaction: t,
      });
      const existingIds = existing.map((tg) => tg.tagId);

      const toAdd = tagIds.filter((tid: number) => !existingIds.includes(tid));
      if (toAdd.length) {
        await Tagged.bulkCreate(
          toAdd.map((tid: number) => ({
            taggableId: productId,
            taggableType: "Product",
            tagId: tid,
          })),
          { transaction: t }
        );
      }

      const toRemove = existingIds.filter((tid) => !tagIds.includes(tid));
      if (toRemove.length) {
        await Tagged.destroy({
          where: {
            taggableId: productId,
            taggableType: "Product",
            tagId: { [Op.in]: toRemove },
          },
          transaction: t,
        });
      }
    }

    // FAQs (replace strategy)
    if (req.body?.faqs) {
      const parsedFaqs = Array.isArray(req.body.faqs)
        ? req.body.faqs
        : JSON.parse(req.body.faqs);

      await ProductFaq.destroy({ where: { productId }, transaction: t });

      if (parsedFaqs.length) {
        const faqRecords = parsedFaqs.map((f: any) => ({
          productId,
          question: f.question,
          answer: f.answer,
        }));
        await ProductFaq.bulkCreate(faqRecords, { transaction: t });
      }
    }

    // Bulk Orders
    if (req.body?.bulkOrders) {
      const parsedBulkOrders = Array.isArray(req.body.bulkOrders)
        ? req.body.bulkOrders
        : JSON.parse(req.body.bulkOrders);

      await BulkOrder.destroy({ where: { productId }, transaction: t });

      if (parsedBulkOrders.length) {
        const bulkOrderRecords = parsedBulkOrders.map((b: any) => ({
          productId,
          name: b.name,
          percentage: b.percentage,
          quantity: b.quantity,
        }));
        await BulkOrder.bulkCreate(bulkOrderRecords, { transaction: t });
      }
    }

    await t.commit();

    // Fetch updated product
    const updated = await Product.findByPk(productId, {
      include: [
        {
          model: Category,
          as: "categories",
          attributes: ["id", "title", "slug"],
          through: { attributes: [] },
        },
        { model: ProductImage, as: "images", attributes: ["id", "image"] },
        { model: ProductFaq, as: "faqs" },
        { model: BulkOrder, as: "bulkOrders" },
      ],
    });

    const tags = await getProductTags(productId);

    const jsonProduct: any = updated?.toJSON();
    jsonProduct.tags = tags;

    // Normalize URLs
    jsonProduct.featuredImage = getFileUrl(
      jsonProduct.featuredImage,
      "products/featured-image"
    );
    if (jsonProduct.images) {
      jsonProduct.images = jsonProduct.images.map((img: any) => ({
        ...img,
        image: getFileUrl(img.image, "products/original"),
      }));
    }
    jsonProduct.video = getFileUrl(jsonProduct.video, "products/video");
    jsonProduct.videoThumbnail = getFileUrl(
      jsonProduct.videoThumbnail,
      "products/video-thumbnail"
    );

    const enriched = attachBulkOrderPrices(jsonProduct);

    return res.status(200).json({ success: true, data: enriched });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// DELETE PRODUCT
export const deleteProduct = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  const t = await sequelize.transaction();
  try {
    const productId = Number(req.params.id);
    const product = await Product.findByPk(productId, { transaction: t });

    if (!product) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message:
          "Product not found. The product you are trying to delete does not exist.",
      });
    }

    //  Corporate check
    if (req.user?.role === "corporate" && product.corporateId !== req.user.id) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only delete products that belong to your organization.",
      });
    }

    // Check if product has been ordered (to prevent foreign key constraint error)
    const orderProductCount = await OrderProduct.count({
      where: { productId: product.id },
      transaction: t,
    });

    if (orderProductCount > 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot delete product "${product.title}" because it has been ordered ${orderProductCount} time(s). Products that have been ordered cannot be deleted to maintain order history integrity.`,
      });
    }

    //  Delete featured image from S3
    if (product.featuredImage) {
      await deleteImage(product.featuredImage);
    }

    //  Delete extra images from S3
    const images = await ProductImage.findAll({
      where: { productId },
      transaction: t,
    });
    for (const img of images) {
      await deleteImage(img.image);
    }

    //  Delete video from S3
    if (product.video) {
      await deleteImage(product.video);
    }

    //  Clean associations
    await ProductImage.destroy({ where: { productId }, transaction: t });
    await ProductCategory.destroy({ where: { productId }, transaction: t });
    await Tagged.destroy({
      where: { taggableId: productId, taggableType: "Product" },
      transaction: t,
    });
    await ProductFaq.destroy({ where: { productId }, transaction: t });
    await BulkOrder.destroy({ where: { productId }, transaction: t });
    await ProductReview.destroy({ where: { productId }, transaction: t });

    //  Delete product itself
    await product.destroy({ transaction: t });

    await t.commit();

    return res.status(200).json({
      success: true,
      message: `Product "${product.title}" and all related data have been successfully deleted.`,
      deletedProductId: product.id,
    });
  } catch (err: any) {
    await t.rollback();

    // Handle foreign key constraint errors specifically
    if (err.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete this product because it is referenced by existing orders. Products that have been ordered cannot be deleted to maintain order history integrity.",
      });
    }

    next(err);
  }
};

// GET CORPORATE PRODUCTS (enriched)
export const listCorporateProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let corporateIdFilter: number | undefined;

    if (req.user.role === "superadmin" || req.user.role === "admin") {
      if (req.query.corporateId) {
        corporateIdFilter = Number(req.query.corporateId);
        if (isNaN(corporateIdFilter)) {
          return res.status(400).json({ message: "Invalid corporateId" });
        }
      } else {
        corporateIdFilter = undefined; // superadmin and admin see all by default
      }
    } else if (req.user.role === "corporate") {
      corporateIdFilter = Number(req.user.id);
    } else if (req.user.role === "corporateUser") {
      corporateIdFilter = Number(req.user.corporateId);
      if (!corporateIdFilter) {
        return res
          .status(403)
          .json({ message: "This corporate user has no parent corporate" });
      }
    } else {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "12"));
    const offset = (page - 1) * limit;

    const { search, category, gender, minPrice, maxPrice, sort } = req.query;

    const where: any = {};
    if (corporateIdFilter !== undefined) where.corporateId = corporateIdFilter;

    // 🔍 Search
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (gender) where.gender = { [Op.in]: parseArrayField(gender) };
    if (minPrice && maxPrice) {
      where.price = { [Op.between]: [Number(minPrice), Number(maxPrice)] };
    }

    // Category filter
    const categoryFilter = category
      ? {
          model: Category,
          as: "categories",
          where: { slug: { [Op.in]: parseArrayField(category) } },
          required: true,
          attributes: ["id", "title", "slug"],
          through: { attributes: [] },
        }
      : {
          model: Category,
          as: "categories",
          attributes: ["id", "title", "slug"],
          through: { attributes: [] },
        };

    // Sorting
    let order: any = [["created_at", "DESC"]];
    if (sort === "lowToHigh") order = [["price", "ASC"]];
    if (sort === "highToLow") order = [["price", "DESC"]];

    const { count: total, rows } = await Product.findAndCountAll({
      where,
      limit,
      offset,
      distinct: true,
      order,
      attributes: [
        "id",
        "title",
        "status",
        "slug",
        "price",
        "featuredImage",
        "stockQuantity",
        "orderBy",
        "outOfStock",
        "createdAt",
        "video",
      ],
      include: [
        categoryFilter,
        { model: ProductImage, as: "images" },
        { model: BulkOrder, as: "bulkOrders" },
      ],
    });

    const enriched = await Promise.all(
      rows.map(async (p) => {
        const tags = await getProductTags(p.id);

        const jsonProduct: any = p.toJSON();
        jsonProduct.tags = tags;

        // normalize URLs
        jsonProduct.featuredImage = getFileUrl(
          jsonProduct.featuredImage,
          "products/featured-image"
        );
        if (jsonProduct.images) {
          jsonProduct.images = jsonProduct.images.map((img: any) => ({
            ...img,
            image: getFileUrl(img.image, "products/original"),
          }));
        }
        jsonProduct.video = getFileUrl(jsonProduct.video, "products/video");

        const enriched = attachBulkOrderPrices(jsonProduct);
        // Format monetary values to 2 decimal places
        if (enriched.price) {
          enriched.price = Number(enriched.price.toFixed(2));
        }
        if (enriched.displayPrice) {
          enriched.displayPrice = Number(enriched.displayPrice.toFixed(2));
        }
        if (enriched.bulkOrders && Array.isArray(enriched.bulkOrders)) {
          enriched.bulkOrders = enriched.bulkOrders.map((bulkOrder: any) => ({
            ...bulkOrder,
            price: Number(bulkOrder.price.toFixed(2)),
          }));
        }

        return enriched;
      })
    );

    return res.status(200).json({
      success: true,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: enriched,
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /products/:id/status
export const updateProductStatus = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { status } = req.body;
    if (req.user?.role && req.user.role === "corporate") {
      const product = await Product.findByPk(req.params.id);
      if (!product)
        return res.status(404).json({ message: "Product not found" });

      // ✅ Ensure corporate only updates its own products
      if (product.corporateId !== req.user.id) {
        return res.status(403).json({
          message: "You can only update the status of your own products",
        });
      }
    }

    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    await product.update({ status });
    return res
      .status(200)
      .json({ success: true, message: "Status updated successfully" });
  } catch (err) {
    next(err);
  }
};

// --- GET PRODUCT BY SLUG (Public SEO route) ---
export const getProductBySlug = async (
  req: Request<{ slug: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const slug = req.params.slug;

    const product = (await Product.findOne({
      where: { slug, status: "active" },
      include: [
        {
          model: Category,
          as: "categories",
          attributes: ["id", "title", "slug", "parentId"],
          through: { attributes: [] },
        },
        {
          model: ProductImage,
          as: "images",
          attributes: ["id", "status", "image"],
        },
        {
          model: ProductFaq,
          as: "faqs",
          attributes: ["id", "question", "answer"],
        },
        {
          model: BulkOrder,
          as: "bulkOrders",
          attributes: ["id", "name", "percentage", "quantity"],
        },
      ],
    })) as any;

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // ✅ Fetch total number of reviews and average rating
    const reviewStats = (await ProductReview.findOne({
      where: { productId: product.id, status: "active" }, // optional: only approved reviews
      attributes: [
        [fn("COUNT", col("id")), "totalReviews"],
        [fn("AVG", col("rating")), "averageRating"],
      ],
      raw: true,
    })) as any;
    const json: any = product.toJSON();

    const totalReviews = Number(reviewStats?.totalReviews || 0);
    const averageRating = reviewStats?.averageRating
      ? parseFloat(Number(reviewStats.averageRating).toFixed(1))
      : 0;

    json.totalReviews = totalReviews;
    json.averageRating = averageRating;

    // ✅ Tags
    const tags = await getProductTags(product.id);

    // ✅ Breadcrumbs (build clean parent → child chain)
    const allCategories =
      product.categories?.map((c: any) =>
        typeof c.toJSON === "function" ? c.toJSON() : c
      ) || [];

    const primaryCategory = await getDeepestCategory(allCategories);
    let breadcrumbs: any[] = [];

    if (primaryCategory) {
      const parentChain = await buildCategoryBreadcrumb(primaryCategory);
      breadcrumbs = [...parentChain, primaryCategory];
    }

    // ✅ Prepare final product JSON
    json.breadcrumbs = breadcrumbs;
    json.tags = tags;

    // Normalize media URLs
    json.featuredImage = getFileUrl(
      json.featuredImage,
      "products/featured-image"
    );
    json.video = getFileUrl(json.video, "products/video");
    json.videoThumbnail = getFileUrl(
      json.videoThumbnail,
      "products/video-thumbnail"
    );

    if (json.images && json.images.length > 0) {
      json.images = json.images.map((img: any) => ({
        ...img,
        image: getFileUrl(img.image, "products/original"),
      }));
    }

    // Load sizes
    let enrichedSizes: any[] = [];
    if (product.sizes && product.sizes.length > 0) {
      enrichedSizes = await Option.findAll({
        where: {
          id: product.sizes,
          optionType: "size", // Only fetch size options, not colors
        },
        attributes: ["id", "name", "orderBy"],
        order: [["orderBy", "ASC"]],
      });
    }
    json.sizes = enrichedSizes;

    // Attach bulk order pricing and clean up
    const enriched = attachBulkOrderPrices(json);
    // ✅ Sort bulk orders by quantity (ascending)
    if (enriched.bulkOrders && Array.isArray(enriched.bulkOrders)) {
      enriched.bulkOrders = enriched.bulkOrders.sort(
        (a: any, b: any) => a.quantity - b.quantity
      );
    }

    // Format monetary values to 2 decimal places
    if (enriched.price) {
      enriched.price = Number(enriched.price.toFixed(2));
    }
    if (enriched.displayPrice) {
      enriched.displayPrice = Number(enriched.displayPrice.toFixed(2));
    }
    if (enriched.bulkOrders && Array.isArray(enriched.bulkOrders)) {
      enriched.bulkOrders = enriched.bulkOrders.map((bulkOrder: any) => ({
        ...bulkOrder,
        price: Number(bulkOrder.price.toFixed(2)),
      }));
    }
    delete enriched.categories; // 🚫 Remove from response

    return res.status(200).json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

// export const getRelatedProductsBySlug = async (
//   req: Request<{ slug: string }>,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const { slug } = req.params;
//     let userId: number | null = null;

//     // 🔹 Extract userId from token if logged in
//     if (req.headers.authorization?.startsWith("Bearer ")) {
//       try {
//         const token = req.headers.authorization.slice(7).trim();
//         // eslint-disable-next-line @typescript-eslint/no-var-requires
//         const payload: any = require("jsonwebtoken").verify(
//           token,
//           process.env.JWT_SECRET!
//         );
//         userId = payload?.id ?? null;
//       } catch {
//         userId = null;
//       }
//     }

//     // 1️⃣ Find the main product (to get its categories)
//     const product = await Product.findOne({
//       where: { slug, status: "active" },
//       include: [
//         {
//           model: Category,
//           as: "categories",
//           attributes: ["id", "title", "slug", "parentId"],
//           through: { attributes: [] },
//         },
//       ],
//     });

//     if (!product) return res.status(404).json({ message: "Product not found" });

//     const categoryIds =
//       (product as any).categories?.map((c: any) =>
//         typeof c.toJSON === "function" ? c.toJSON().id : c.id
//       ) || [];

//     if (!categoryIds.length) {
//       return res.status(200).json({ success: true, data: [] });
//     }

//     // 2️⃣ Find related products that share any of those category IDs.
//     // We include categories with a where clause to FILTER, but we will later
//     // load the product's full categories separately so breadcrumbs are complete.
//     const relatedProducts = await Product.findAll({
//       where: {
//         status: "active",
//         id: { [Op.ne]: product.id },
//       },
//       include: [
//         {
//           model: Category,
//           as: "categories",
//           through: { attributes: [] },
//           attributes: [], // no need to pull category fields here (we'll fetch them per product)
//           required: true,
//           where: {
//             id: { [Op.in]: categoryIds },
//           },
//         },
//         {
//           model: BulkOrder,
//           as: "bulkOrders",
//           attributes: ["id", "name", "percentage", "quantity"],
//         },
//       ],
//       limit: 8,
//       order: [["createdAt", "DESC"]],
//       attributes: [
//         "id",
//         "title",
//         "slug",
//         "price",
//         "featuredImage",
//         "bestSeller",
//         "outOfStock",
//         "createdAt",
//       ],
//       distinct: true,
//     } as any);

//     // 3️⃣ Wishlist check
//     let wishlistProductIds: number[] = [];
//     if (userId) {
//       const wishlistItems = await Wishlist.findAll({
//         where: { userId },
//         attributes: ["productId"],
//       });
//       wishlistProductIds = wishlistItems.map((w) => w.productId);
//     }

//     // 4️⃣ Build response: for each related product fetch *all* its categories,
//     // pick the deepest, then build the full breadcrumb chain (parents + category).
//     const data = await Promise.all(
//       relatedProducts.map(async (p: any) => {
//         // Process the product with bulk order prices to get displayPrice
//         let json = attachBulkOrderPrices(p.toJSON());
//         // Format monetary values to 2 decimal places
//         if (json.price) {
//           json.price = Number(json.price.toFixed(2));
//         }
//         if (json.displayPrice) {
//           json.displayPrice = Number(json.displayPrice.toFixed(2));
//         }
//         if (json.bulkOrders && Array.isArray(json.bulkOrders)) {
//           json.bulkOrders = json.bulkOrders.map((bulkOrder: any) => ({
//             ...bulkOrder,
//             price: Number(bulkOrder.price.toFixed(2)),
//           }));
//         }

//         // Fetch ALL categories for this product (so we can find its actual subcategory)
//         // Note: this uses the instance helper created by Sequelize associations.
//         const allCategoryInstances: any[] = await p.getCategories({
//           attributes: ["id", "title", "slug", "parentId"],
//           joinTableAttributes: [],
//         });

//         const allCategories =
//           allCategoryInstances.map((c: any) =>
//             typeof c.toJSON === "function" ? c.toJSON() : c
//           ) || [];

//         // pick the most specific category among those assigned to the product
//         const primaryCategory = await getDeepestCategory(allCategories);

//         // build breadcrumb chain: parent(s) (root → ...) + primaryCategory
//         let breadcrumbs: any[] = [];
//         if (primaryCategory) {
//           const parentChain = await buildCategoryBreadcrumb(primaryCategory);
//           breadcrumbs = [...parentChain, primaryCategory];
//         }

//         // normalize featuredImage URL
//         json.featuredImage = getFileUrl(
//           json.featuredImage,
//           "products/featured-image"
//         );

//         json.isWishlisted = wishlistProductIds.includes(json.id);

//         // attach breadcrumbs exactly like getProductBySlug (full objects)
//         json.breadcrumbs = breadcrumbs.map((b) => ({
//           id: b.id,
//           title: b.title,
//           slug: b.slug,
//           parentId: b.parentId ?? null,
//         }));

//         // Add displayPrice field to the response and remove bulkOrders
//         json.displayPrice = json.displayPrice;
//         delete json.bulkOrders;
//         delete json.categories;

//         return json;
//       })
//     );

//     return res.status(200).json({
//       success: true,
//       data,
//     });
//   } catch (err) {
//     next(err);
//   }
// };
export const getRelatedProductsBySlug = async (
  req: Request<{ slug: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { slug } = req.params;
    let userId: number | null = null;

    // Extract user id from token (wishlist detection)
    if (req.headers.authorization?.startsWith("Bearer ")) {
      try {
        const token = req.headers.authorization.slice(7).trim();
        const payload: any = require("jsonwebtoken").verify(
          token,
          process.env.JWT_SECRET!
        );
        userId = payload?.id ?? null;
      } catch {
        userId = null;
      }
    }

    // 1️⃣ Fetch product by slug (with full categories)
    const product = await Product.findOne({
      where: { slug, status: "active" },
      include: [
        {
          model: Category,
          as: "categories",
          attributes: ["id", "title", "slug", "parentId"],
          through: { attributes: [] },
        },
      ],
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 2️⃣ FIRST PRIORITY → admin-selected related products
    const adminRelations = await ProductRelated.findAll({
      where: { productId: product.id },
      attributes: ["relatedProductId"],
    });

    const adminRelatedIds = adminRelations.map((r) => r.relatedProductId);

    let relatedProducts: any[] = [];

    if (adminRelatedIds.length > 0) {
      // Admin-set related products
      relatedProducts = await Product.findAll({
        where: {
          id: {
            [Op.in]: adminRelatedIds,
            [Op.ne]: product.id,
          },
          status: "active",
        },
        include: [
          {
            model: BulkOrder,
            as: "bulkOrders",
            attributes: ["id", "name", "percentage", "quantity"],
          },
        ],
        attributes: [
          "id",
          "title",
          "slug",
          "price",
          "featuredImage",
          "bestSeller",
          "outOfStock",
          "createdAt",
        ],
        order: [["createdAt", "DESC"]],
      });
    } else {
      // ⚠️ Admin has not selected related products → DON'T SHOW ANY
      // Returning empty data exactly as per new business rule.
      return res.status(200).json({ success: true, data: [] });

      /*
      // 🛑 OLD LOGIC (category-based fallback) — preserved for future use:
      
      const categoryIds =
        (product as any).categories?.map((c: any) =>
          typeof c.toJSON === "function" ? c.toJSON().id : c.id
        ) || [];

      if (!categoryIds.length) {
        return res.status(200).json({ success: true, data: [] });
      }

      relatedProducts = await Product.findAll({
        where: {
          status: "active",
          id: { [Op.ne]: product.id },
        },
        include: [
          {
            model: Category,
            as: "categories",
            through: { attributes: [] },
            attributes: [],
            required: true,
            where: { id: { [Op.in]: categoryIds } },
          },
          {
            model: BulkOrder,
            as: "bulkOrders",
            attributes: ["id", "name", "percentage", "quantity"],
          },
        ],
        limit: 8,
        order: [["createdAt", "DESC"]],
        attributes: [
          "id",
          "title",
          "slug",
          "price",
          "featuredImage",
          "bestSeller",
          "outOfStock",
          "createdAt",
        ],
        distinct: true,
      } as any);
      */
    }

    // 4️⃣ Wishlist check
    let wishlistProductIds: number[] = [];
    if (userId) {
      const wishlistItems = await Wishlist.findAll({
        where: { userId },
        attributes: ["productId"],
      });
      wishlistProductIds = wishlistItems.map((w) => w.productId);
    }

    // 5️⃣ Build final output
    const data = await Promise.all(
      relatedProducts.map(async (p: any) => {
        let json = attachBulkOrderPrices(p.toJSON());

        // Format prices
        if (json.price) json.price = Number(json.price.toFixed(2));
        if (json.displayPrice)
          json.displayPrice = Number(json.displayPrice.toFixed(2));
        if (json.bulkOrders && Array.isArray(json.bulkOrders)) {
          json.bulkOrders = json.bulkOrders.map((b: any) => ({
            ...b,
            price: Number(b.price.toFixed(2)),
          }));
        }

        // Fetch all categories for breadcrumbs
        const allCategoryInstances = await p.getCategories({
          attributes: ["id", "title", "slug", "parentId"],
          joinTableAttributes: [],
        });

        const allCategories =
          allCategoryInstances.map((c: any) =>
            typeof c.toJSON === "function" ? c.toJSON() : c
          ) || [];

        const primaryCategory = await getDeepestCategory(allCategories);
        let breadcrumbs: any[] = [];

        if (primaryCategory) {
          const parentChain = await buildCategoryBreadcrumb(primaryCategory);
          breadcrumbs = [...parentChain, primaryCategory];
        }

        json.featuredImage = getFileUrl(
          json.featuredImage,
          "products/featured-image"
        );

        json.isWishlisted = wishlistProductIds.includes(json.id);
        json.breadcrumbs = breadcrumbs.map((b) => ({
          id: b.id,
          title: b.title,
          slug: b.slug,
          parentId: b.parentId ?? null,
        }));

        // clean up
        delete json.bulkOrders;
        delete json.categories;

        return json;
      })
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const updateCorporateProductStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const corporate = req.user!;
    if (corporate.role !== "corporate") {
      return res
        .status(403)
        .json({ message: "Only corporate can perform this action" });
    }

    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (product.corporateId !== corporate.id) {
      return res.status(403).json({
        message: "You can only update the status of your own products",
      });
    }

    product.status = req.body.status;
    await product.save();

    return res.status(200).json({
      success: true,
      message: "Product status updated successfully",
    });
  } catch (err) {
    next(err);
  }
};
export const listPublicProductsSEO = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const slugParam = req.query.slug as string | undefined;
    const slug = slugParam ? slugParam.trim() : null;
    const search = (req.query.search as string) || "";

    const baseWhere: any = { status: "active" };
    const where: any = { ...baseWhere };

    if (slug) {
      where.slug = slug;
    }

    if (search) {
      where.title = { [Op.iLike]: `%${search}%` };
    }

    const { rows, count } = await Product.findAndCountAll({
      where,
      attributes: [
        "id",
        "title",
        "slug",
        "featuredImage",
        "metaTitle",
        "metaDescription",
        "metaKey",
        "metaSchema",
      ],
      offset,
      limit,
      order: [["id", "DESC"]],
    });

    const data = rows.map((product) => {
      const json = product.toJSON();
      json.featuredImage = getFileUrl(
        json.featuredImage ?? null,
        "products/featured-image"
      );
      return json;
    });

    res.json({
      success: true,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
      data,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/products/:id/related

export const setRelatedProducts = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  const t = await sequelize.transaction();
  try {
    const productId = Number(req.params.id);

    const relatedProductIds: number[] = Array.isArray(
      req.body.relatedProductIds
    )
      ? req.body.relatedProductIds.map(Number)
      : [];

    // Validate product exists
    const product = await Product.findByPk(productId);
    if (!product) {
      await t.rollback();
      return res.status(404).json({ message: "Product not found" });
    }

    // Validate related product IDs
    if (relatedProductIds.length) {
      const validCount = await Product.count({
        where: { id: relatedProductIds },
      });

      if (validCount !== relatedProductIds.length) {
        await t.rollback();
        return res.status(400).json({
          message: "One or more related product IDs are invalid",
        });
      }
    }

    // 👉 Only add new relations (do NOT remove existing ones)
    for (const rid of relatedProductIds) {
      if (rid === productId) continue; // skip self

      // Check if already exists
      const exists = await ProductRelated.findOne({
        where: { productId, relatedProductId: rid },
        transaction: t,
      });

      if (!exists) {
        await ProductRelated.create(
          { productId, relatedProductId: rid },
          { transaction: t }
        );
      }
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Related products added successfully",
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// GET /api/v1/products/:id/related (admin view)
export const getRelatedProductsAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const productId = Number(req.params.id);

    const relations = await ProductRelated.findAll({
      where: { productId },
      attributes: ["relatedProductId"],
      order: [["id", "DESC"]], // <-- newest relation first
    });

    const relatedIds = relations.map((r) => r.relatedProductId);

    if (!relatedIds.length) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    // Fetch basic info for admin dropdown/cards
    const products = await Product.findAll({
      where: { id: relatedIds },
      attributes: [
        "id",
        "title",
        "slug",
        "featuredImage",
        "price",
        "outOfStock",
      ],
    });

    // Reorder according to relation order
    const orderedProducts = relatedIds.map((id) =>
      products.find((p: any) => p.id === id)
    );

    const mapped = orderedProducts.map((p: any) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      price: p.price,
      outOfStock: p.outOfStock,
      featuredImage: getFileUrl(p.featuredImage, "products/featured-image"),
    }));

    return res.status(200).json({
      success: true,
      data: mapped,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteRelatedProduct = async (
  req: Request<{ id: string; relatedId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const productId = Number(req.params.id);
    const relatedId = Number(req.params.relatedId);

    const relation = await ProductRelated.findOne({
      where: { productId, relatedProductId: relatedId },
    });

    if (!relation) {
      return res.status(404).json({
        success: false,
        message: "Relation not found",
      });
    }

    await relation.destroy();

    return res.status(200).json({
      success: true,
      message: "Related product removed successfully",
    });
  } catch (err) {
    next(err);
  }
};
