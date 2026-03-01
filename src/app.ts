import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
dotenv.config();

import { errorHandler } from "./middlewares/errorHandler";
import { setupAssociations } from "./models/associations";
import db from "./models/index";
import userRoutes from "./routes/user.routes";
import roleBaseRoutes from "./routes/roleBasePermission.routes";
import categoryRoutes from "./routes/category.routes";
import optionRoutes from "./routes/option.routes";
import productRoutes from "./routes/product.routes";
import tagRoutes from "./routes/tag.routes";
import productFaqRoutes from "./routes/productFaq.routes";
import productReviewRoutes from "./routes/productReview.routes";
import couponRoutes from "./routes/coupon.routes";
import cartRoutes from "./routes/cart.routes";
import addressRoutes from "./routes/address.routes";
import orderRoutes from "./routes/order.routes";
import corporateCreditRoutes from "./routes/corporateCredit.routes";
import wishlistRoutes from "./routes/wishlist.routes";
import blogRoutes from "./routes/blog.routes";
import blogCommentRoutes from "./routes/blogComment.routes";
import pageRoutes from "./routes/page.routes";
import sliderRoutes from "./routes/slider.routes";
import announcementRoutes from "./routes/announcement.routes";
import clientRoutes from "./routes/client.routes";
import shippingRateRoutes from "./routes/shippingRate.routes";
import testimonialRoutes from "./routes/testimonial.routes";
import webSettingsRoutes from "./routes/webSettings.routes";
import paymentRoutes from "./routes/payment.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import inquiryRoutes from "./routes/inquiry.routes";
import stripeRoutes from "./routes/stripe.routes";
import publicRoutes from "./routes/public.routes";
import faqRoutes from "./routes/faq.routes";
import newsletterRoutes from "./routes/newsletter.routes";
import paymentLogRoutes from "./routes/paymentLog.routes";
import chefWearRoutes from "./routes/chefWear.routes";
import galleryRoutes from "./routes/gallery.routes";
import festivalRoutes from "./routes/festival.routes";
import categoryFaqRoutes from "./routes/categoryFaq.routes"; // Added import
import authAndRoleCheck from "./middlewares/authAndRoleCheck";

const nodemailer = require("nodemailer");

const app = express();

app.set("trust proxy", true);

// app.use(cors());
app.use(
  cors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "https://staging.easybuy.com",
        "https://admin.easybuy.com",
        "https://easybuy.com",
        "http://localhost:3000",
        "http://localhost:3001",
        "https://www.easybuy.com",
      ];

      if (allowedOrigins.some((o) => origin.startsWith(o))) {
        return callback(null, true);
      }

      console.error("❌ CORS BLOCKED ORIGIN:", origin);
      return callback(null, false); // <-- IMPORTANT
    },
    credentials: true,
  })
);

app.use(helmet());
app.use(compression());
app.use(hpp());

// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 2000,
//   standardHeaders: true,
//   legacyHeaders: false,
// });
// app.use(limiter);

// ⚠️ Stripe webhook route MUST be mounted BEFORE bodyParser.json()
// because Stripe needs the raw request body for signature verification
app.use("/api/v1/payments/stripe", stripeRoutes);

app.use(bodyParser.json({ limit: "10mb" }));
app.use(cookieParser());

setupAssociations();

// Routes
app.use("/api/v1", userRoutes);
app.use("/api/v1/roleBase", roleBaseRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/categoryFaqs", categoryFaqRoutes); // Added route
app.use("/api/v1/option", optionRoutes);
app.use("/api/v1/product", productRoutes);
app.use("/api/v1/tags", tagRoutes);
app.use("/api/v1/productFaqs", productFaqRoutes);
app.use("/api/v1/productReviews", productReviewRoutes);
app.use("/api/v1/coupon", couponRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/address", addressRoutes);
app.use("/api/v1/order", orderRoutes);
app.use("/api/v1/corporateCredit", corporateCreditRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);
app.use("/api/v1/blog", blogRoutes);
app.use("/api/v1/blogComment", blogCommentRoutes);
app.use("/api/v1/page", pageRoutes);
app.use("/api/v1/slider", sliderRoutes);
app.use("/api/v1/annoucement", announcementRoutes);
app.use("/api/v1/client", clientRoutes);
app.use("/api/v1/shippingRates", shippingRateRoutes);
app.use("/api/v1/testimonials", testimonialRoutes);
app.use("/api/v1/webSettings", webSettingsRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/inquiry", inquiryRoutes);
// Stripe routes mounted above bodyParser.json() — see line ~100
app.use("/api/v1/public", publicRoutes);
app.use("/api/v1/faqs", faqRoutes);
app.use("/api/v1/newsletter", newsletterRoutes);
app.use("/api/v1/chefWear", chefWearRoutes);
app.use("/api/v1/gallery", galleryRoutes);
app.use("/api/v1/festivals", festivalRoutes);
app.use("/api/v1/paymentLogs", paymentLogRoutes);

// Sync database
db.sequelize.sync({ alter: false }).then(async () => {
  console.log("✅ Database synced");
});

app.get("/ip-test", (req, res) => {
  res.json({
    ip: req.ip,
    forwarded: req.headers["x-forwarded-for"],
  });
});

// Database sync endpoint
app.get(
  "/syncDb",
  authAndRoleCheck("admin"),
  async (req: Request, res: Response) => {
    try {
      await db.sequelize.sync({ alter: true }).then(() => {
        console.log("✅ Database synced");
      });
      console.log("Database synchronized");
      res.json({
        message: "Database synchronized successfully",
      });
    } catch (error) {
      console.error("Error synchronizing database:", error);
      res.status(500).json({
        message: "Error synchronizing database",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Health check
app.get("/healthz", (_req, res) =>
  res.status(200).json({ ok: true, message: "11-02-2026 5:55 PM" })
);

// Global error handler (must be after routes)
app.use(errorHandler);

export default app;
