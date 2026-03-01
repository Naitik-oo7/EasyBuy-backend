// routes/productReview.routes.ts
import { Router } from "express";
import {
  createProductReview,
  listProductReviews,
  getProductReviewById,
  updateProductReview,
  deleteProductReview,
  listPublicProductReviews,
} from "../controllers/productReview.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import { multiFileMiddleware } from "../utils/awsS3";

const router = Router();

router.get("/public/:id", listPublicProductReviews);
router.post("/", authAndRoleCheck(), multiFileMiddleware, createProductReview);
router.get("/", authAndRoleCheck("view_product_review"), listProductReviews);
router.get("/:id", getProductReviewById);
router.put(
  "/:id",
  authAndRoleCheck("edit_product_review"),
  updateProductReview
);
router.delete(
  "/:id",
  authAndRoleCheck("delete_product_review"),
  deleteProductReview
);

export default router;
