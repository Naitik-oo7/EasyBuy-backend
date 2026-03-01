import express from "express";
import {
  deleteNewsletterSubscriber,
  exportNewsletterSubscribersToExcel,
  listNewsletterSubscribers,
  subscribeNewsletter,
  unsubscribeNewsletter,
} from "../controllers/newsletter.controller";
import authAndRoleCheck from "../middlewares/authAndRoleCheck";

const router = express.Router();

router.post("/subscribe", subscribeNewsletter);
router.post("/unsubscribe", unsubscribeNewsletter);
router.get(
  "/list",
  authAndRoleCheck("view_newsletter_subscribers"),
  listNewsletterSubscribers
);
router.get(
  "/export/excel",
  authAndRoleCheck("view_newsletter_subscribers"),
  exportNewsletterSubscribersToExcel
);
router.delete(
  "/:id",
  authAndRoleCheck("delete_newsletter_subscribers"),
  deleteNewsletterSubscriber
);

export default router;
