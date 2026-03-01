import { Router } from "express";
import {
  addComment,
  deleteComment,
  listAllComments,
  listComments,
  updateComment,
} from "../controllers/blogComment.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = Router();

// Public routes
router.get("/:blogId", listComments); // List approved comments
router.get(
  "/admin/all",
  authAndRoleCheck("view_all_comments"),
  listAllComments
);

router.post("/", addComment); // Add comment (public or logged in)

// Admin routes
router.put("/:commentId", authAndRoleCheck("edit_comment"), updateComment);

router.delete("/:commentId", authAndRoleCheck("delete_comment"), deleteComment);

export default router;
