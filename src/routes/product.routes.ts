import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  deleteRelatedProduct,
  getProductById,
  getProductBySlug,
  getRelatedProductsAdmin,
  getRelatedProductsBySlug,
  listAdminProducts,
  listCorporateProducts,
  listPublicProducts,
  listPublicProductsSEO,
  searchPublicProducts,
  setRelatedProducts,
  updateCorporateProductStatus,
  updateProduct,
  updateProductStatus,
} from "../controllers/product.controller";

import { productFileMiddleware } from "../utils/awsS3";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// --- Product CRUD ---
router.get("/seo", listPublicProductsSEO);

router.get("/public", listPublicProducts);

router.get("/public/search/:search", searchPublicProducts);

router.get("/slug/:slug/related", getRelatedProductsBySlug);

router.get("/slug/:slug", getProductBySlug);

// more specific routes BEFORE ":id"
router.get(
  "/admin/list",
  authAndRoleCheck("view_products_admin"),
  listAdminProducts
);
router.get(
  "/corporate",
  authAndRoleCheck("view_products_corporate"),
  listCorporateProducts
);

router.post(
  "/",
  productFileMiddleware,
  authAndRoleCheck("create_product"),
  createProduct
);
router.put(
  "/:id",
  productFileMiddleware,
  authAndRoleCheck("edit_product"),
  updateProduct
);
router.patch(
  "/:id/status",
  authAndRoleCheck("edit_product_status"),
  updateProductStatus
);
router.patch(
  "/corporates/:id/status",
  authAndRoleCheck(),
  updateCorporateProductStatus
);

router.get("/:id", getProductById); // keep this last
router.delete("/:id", authAndRoleCheck("delete_product"), deleteProduct);

// Admin routes
router.post("/:id/related",   authAndRoleCheck("edit_product"),setRelatedProducts);
router.get("/:id/related",   authAndRoleCheck("edit_product"), getRelatedProductsAdmin);
router.delete("/:id/related/:relatedId", authAndRoleCheck("edit_product"), deleteRelatedProduct);


export default router;
