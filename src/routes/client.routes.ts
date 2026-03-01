import { Router } from "express";
import {
  createClient,
  listClients,
  getClientById,
  updateClient,
  deleteClient,
  listPublicClients,
} from "../controllers/client.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";
import { singleFileMiddleware } from "../utils/awsS3";

const router = Router();

router.get("/public", listPublicClients);

// Admin routes
router.post(
  "/",
  authAndRoleCheck("create_client"),
  singleFileMiddleware,
  createClient
);
router.put(
  "/:id",
  authAndRoleCheck("edit_client"),
  singleFileMiddleware,
  updateClient
);
router.delete("/:id", authAndRoleCheck("delete_client"), deleteClient);

// Public / User routes
router.get("/", authAndRoleCheck("view_clients"), listClients);
router.get("/:id", authAndRoleCheck("view_clients"), getClientById);

export default router;
