import express from "express";
import {
    createCheckoutSession,
    handleWebhook,
    getSessionStatus,
    testPayment,
} from "../controllers/stripe.controller";
import bodyParser from "body-parser";

const router = express.Router();

// Create Stripe Checkout Session
router.post("/create", bodyParser.json(), createCheckoutSession);

// Stripe Webhook — MUST use raw body for signature verification
router.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    handleWebhook
);

// Get session status (for frontend to check payment result)
router.get("/session-status", getSessionStatus);

// Health Check
router.get("/test", testPayment);

export default router;
