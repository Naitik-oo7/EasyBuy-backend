import { Router } from "express";
import {
  createTag,
  listTags,
  getTagById,
  updateTag,
  deleteTag,
} from "../controllers/tag.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

router.post("/", authAndRoleCheck("create_tag"), createTag);
router.get("/", authAndRoleCheck("view_product_tag "), listTags);
router.get("/:id", getTagById);
router.put("/:id", authAndRoleCheck("edit_tag"), updateTag);
router.delete("/:id", authAndRoleCheck("delete_tag"), deleteTag);

export default router;
