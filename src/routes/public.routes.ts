import { Router } from "express";
import {
  submitContactForm,
  submitCareerForm,
  listAllSlugs,
  tokenInvoiceGenerate,
  createPublicPayment,
  tokenOrderFormGenerate,
  tokenPackingSlipGenerate,
} from "../controllers/public.controller";
import { fileMiddleware } from "../utils/awsS3"; // ✅ same middleware as used in blog/client routes

const router = Router();

// 📨 Contact Form
router.post("/contact", submitContactForm);

// 💼 Career Form (with resume upload)
router.post("/career", fileMiddleware, submitCareerForm);

router.get("/seo", listAllSlugs);

router.get("/invoice", tokenInvoiceGenerate);

router.get("/order-form", tokenOrderFormGenerate);
router.get("/packing-slip", tokenPackingSlipGenerate);

// 💳 Public payment creation
router.post("/create-payment", createPublicPayment);

// Direct image upload endpoint
// router.post("/upload/direct-image", fileMiddleware, directImageUpload);

// Test endpoint for sending order placed email

export default router;
