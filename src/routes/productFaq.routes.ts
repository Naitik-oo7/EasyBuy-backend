import { Router } from "express";
import {
  createProductFaq,
  listProductFaqs,
  getProductFaqById,
  updateProductFaq,
  deleteProductFaq,
} from "../controllers/productFaq.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

router.post("/", authAndRoleCheck("create_product_faq"), createProductFaq);
router.get("/", listProductFaqs);
router.get("/:id", authAndRoleCheck("view_product_faq"), getProductFaqById);
router.put("/:id", authAndRoleCheck("edit_product_faq"), updateProductFaq);
router.delete("/:id", authAndRoleCheck("delete_product_faq"), deleteProductFaq);

export default router;
