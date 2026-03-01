import { Router } from "express";
import {
  createOption,
  listOptions,
  getOptionById,
  updateOption,
  deleteOption,
  listColorOptionsPublic,
} from "../controllers/option.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

router.get("/colors", listColorOptionsPublic);
router.post("/", authAndRoleCheck("create_option"), createOption);
router.get("/", authAndRoleCheck("view_product_option"), listOptions);
router.get("/:id", getOptionById);
router.put("/:id", authAndRoleCheck("edit_option"), updateOption);
router.delete("/:id", authAndRoleCheck("delete_option"), deleteOption);

export default router;
