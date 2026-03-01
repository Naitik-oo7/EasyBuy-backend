import { Request, Response, NextFunction } from "express";
import Stripe from "stripe";
import Payment from "../models/payment.model";
import Order from "../models/order.model";
import { generatePaymentCode } from "../utils/codeHelper";
import dotenv from "dotenv";
import OrderBillingAddress from "../models/orderBillingAddress.model";
import User from "../models/user.model";
import OrderProduct from "../models/orderProduct.model";
import OrderShippingAddress from "../models/orderShippingAddress.model";
import {
    sendOrderPlacedEmail,
    sendOrderReceiverNotification,
} from "../utils/emailHelper";
import CartProduct from "../models/cartProduct.model";
import Cart from "../models/cart.model";
import OrderStatusHistory from "../models/orderStatusHistory.model";
import { createPaymentLog } from "./paymentLog.controller";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * STEP 1️⃣: Create Stripe Checkout Session
 */
export const createCheckoutSession = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { orderId, estimateOrderId, amount, code: existingCode } = req.body;

        // Either orderId or estimateOrderId must be provided
        if ((!orderId && !estimateOrderId) || !amount) {
            return res.status(400).json({
                message: "Either orderId or estimateOrderId and amount are required",
            });
        }

        let order: any = null;
        // Only fetch order if orderId is provided (for regular flow)
        if (orderId) {
            order = await Order.findByPk(orderId, {
                include: [
                    { model: OrderBillingAddress, as: "billingAddress" },
                    { model: OrderShippingAddress, as: "shippingAddress" },
                    { model: User, as: "user" },
                ],
            });

            if (!order) return res.status(404).json({ message: "Order not found" });

            // ✅ ADD GUARDS FOR INVALID PAYMENT ATTEMPTS
            // Check if order has already been paid
            if (order.paymentStatus === "paid") {
                return res.status(400).json({ message: "Order has already been paid" });
            }

            // Check if order is marked as trash/expired
            if (order.status === "trash" || order.paymentStatus === "expired") {
                return res
                    .status(400)
                    .json({ message: "Order is no longer valid for payment" });
            }

            // Check if order status indicates it's no longer valid for payment
            if (["cancelled", "refunded", "failed"].includes(order.status)) {
                return res
                    .status(400)
                    .json({ message: "Order is no longer valid for payment" });
            }

            if (Number(order.grandTotal) !== Number(amount)) {
                return res
                    .status(400)
                    .json({ message: "Amount does not match order total" });
            }
        }

        // Fetch customer and shipping details from order if available
        let customer: any = {};
        let shipping: any = {};

        if (order) {
            customer = {
                name: order.billingAddress?.name || order.user?.name || "NA",
                email:
                    order.billingAddress?.email ||
                    order.user?.email ||
                    "unknown@example.com",
                phone:
                    order.billingAddress?.mobileNumber ||
                    order.user?.mobile ||
                    "0000000000",
                address: order.billingAddress?.address || "NA",
                city: order.billingAddress?.city || "NA",
                state: order.billingAddress?.state || "NA",
                pincode: order.billingAddress?.pinCode || "000000",
            };

            shipping = {
                name: order.shippingAddress?.name || customer.name,
                address: order.shippingAddress?.address || customer.address,
                city: order.shippingAddress?.city || customer.city,
                state: order.shippingAddress?.state || customer.state,
                pincode: order.shippingAddress?.pinCode || customer.pincode,
                country: "India",
            };
        } else {
            const estimatePayment = await Payment.findOne({
                where: { estimateOrderId },
                order: [["createdAt", "DESC"]],
            });

            if (!estimatePayment) {
                return res
                    .status(404)
                    .json({ message: "Payment record for estimate not found" });
            }

            customer = {
                name: `${estimatePayment.fname} ${estimatePayment.lname}`.trim() || "",
                email: estimatePayment.email,
                phone: estimatePayment.mobile,
                address: estimatePayment.address1 || "",
                city: estimatePayment.city,
                state: estimatePayment.state,
                pincode: estimatePayment.pincode,
            };

            shipping = {
                name: customer.name,
                address: customer.address,
                city: customer.city,
                state: customer.state,
                pincode: customer.pincode,
                country: "India",
            };
        }

        let code: string;

        if (existingCode) {
            let existingPayment;
            if (orderId) {
                existingPayment = await Payment.findOne({
                    where: { code: existingCode, orderId },
                });
            } else {
                existingPayment = await Payment.findOne({
                    where: { code: existingCode, estimateOrderId },
                });
            }

            if (existingPayment && existingPayment.status !== "Success") {
                code = existingCode;
                await existingPayment.update({ status: "pending" });
            } else if (!existingPayment) {
                return res.status(400).json({ message: "Invalid payment code" });
            } else {
                return res
                    .status(400)
                    .json({ message: "Payment already completed successfully" });
            }
        } else {
            let existingPaymentForRecord;
            if (orderId) {
                existingPaymentForRecord = await Payment.findOne({
                    where: { orderId },
                });
            } else {
                existingPaymentForRecord = await Payment.findOne({
                    where: { estimateOrderId },
                });
            }

            if (existingPaymentForRecord) {
                if (existingPaymentForRecord.status !== "Success") {
                    code = existingPaymentForRecord.code ?? "";
                    await existingPaymentForRecord.update({
                        amount,
                        status: "pending",
                    });
                } else {
                    return res
                        .status(400)
                        .json({ message: "Payment for this record already completed" });
                }
            } else {
                let exists: any;
                do {
                    code = generatePaymentCode(8);
                    exists = await Payment.findOne({ where: { code } });
                } while (exists);

                await Payment.create({
                    orderId: orderId || null,
                    estimateOrderId: estimateOrderId || null,
                    code,
                    gateway: "Stripe",
                    amount,
                    status: "pending",
                    fname: (customer.name?.split(" ")[0] as string) || "",
                    lname: (customer.name?.split(" ")[1] as string) || "",
                    email: customer.email,
                    mobile: customer.phone,
                    address1: customer.address,
                    city: customer.city,
                    state: customer.state,
                    pincode: customer.pincode,
                });
            }
        }

        const payment = await Payment.findOne({
            where: orderId ? { code, orderId } : { code, estimateOrderId },
        });

        if (!payment) {
            throw new Error("Payment record missing after creation");
        }

        // Convert amount to paise (smallest currency unit for INR)
        const amountInPaise = Math.round(Number(amount) * 100);

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            customer_email: customer.email,
            line_items: [
                {
                    price_data: {
                        currency: "inr",
                        product_data: {
                            name: orderId
                                ? `Order #${orderId}`
                                : `Estimate #${estimateOrderId}`,
                            description: `Payment for EasyBuy ${orderId ? "Order" : "Estimate"
                                }`,
                        },
                        unit_amount: amountInPaise,
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                payment_code: code!,
                order_id: (orderId || "").toString(),
                estimate_order_id: (estimateOrderId || "").toString(),
                payment_id: payment.id.toString(),
            },
            success_url: `${process.env.FRONTEND_URL}/cart/payment-status?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/cart/payment-status?session_id={CHECKOUT_SESSION_ID}&cancelled=true`,
        });

        // Store session ID in payment record for reconciliation
        payment.trackingId = session.id;
        await payment.save();

        try {
            await createPaymentLog({
                paymentId: payment.id,
                orderId: payment.orderId,
                estimateOrderId: payment.estimateOrderId,
                eventType: "REDIRECT_INITIATED",
                source: "backend",
                req,
            });
        } catch (e) {
            console.warn("Payment log failed:", e);
        }

        // Return the Stripe Checkout URL for frontend redirect
        res.json({
            success: true,
            url: session.url,
            sessionId: session.id,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * STEP 2️⃣: Handle Stripe Webhook events
 */
export const handleWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔔 STRIPE WEBHOOK CALLED at", new Date().toISOString());
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const sig = req.headers["stripe-signature"] as string;
    console.log("📩 Stripe-Signature header present:", !!sig);

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body, // raw body
            sig,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
        console.log("✅ Webhook signature verified successfully");
    } catch (err: any) {
        console.error("❌ Webhook signature verification FAILED:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`📦 Event Type: ${event.type}`);
    console.log(`📦 Event ID: ${event.id}`);

    // Handle the event
    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            console.log(`💰 checkout.session.completed — Session ID: ${session.id}, Payment Status: ${session.payment_status}`);
            console.log(`   Metadata:`, session.metadata);
            await handlePaymentSuccess(session);
            console.log(`✅ handlePaymentSuccess completed for session ${session.id}`);
            break;
        }
        case "checkout.session.expired": {
            const session = event.data.object as Stripe.Checkout.Session;
            console.log(`⏰ checkout.session.expired — Session ID: ${session.id}`);
            console.log(`   Metadata:`, session.metadata);
            await handlePaymentExpired(session);
            console.log(`✅ handlePaymentExpired completed for session ${session.id}`);
            break;
        }
        default:
            console.log(`ℹ️ Unhandled event type: ${event.type} — no action taken`);
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔔 WEBHOOK PROCESSING COMPLETE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Acknowledge receipt of the event
    res.json({ received: true });
};

/**
 * Handle successful payment from webhook
 */
async function handlePaymentSuccess(session: Stripe.Checkout.Session) {
    const paymentCode = session.metadata?.payment_code;
    const orderIdStr = session.metadata?.order_id;
    const estimateOrderIdStr = session.metadata?.estimate_order_id;

    // Find payment record
    let payment = null;

    if (paymentCode) {
        payment = await Payment.findOne({
            where: { code: paymentCode },
        });
        if (payment)
            console.log(`✅ Found payment by code ${paymentCode}`);
    }

    if (!payment && orderIdStr && orderIdStr !== "") {
        payment = await Payment.findOne({
            where: { orderId: parseInt(orderIdStr) },
            order: [["createdAt", "DESC"]],
        });
    }

    if (!payment && estimateOrderIdStr && estimateOrderIdStr !== "") {
        payment = await Payment.findOne({
            where: { estimateOrderId: estimateOrderIdStr },
            order: [["createdAt", "DESC"]],
        });
    }

    if (!payment) {
        console.log(
            `⚠️ No payment record found for session ${session.id}.`
        );
        return;
    }

    // 🔹 LOG: Stripe webhook received
    try {
        await createPaymentLog({
            paymentId: payment.id,
            orderId: payment.orderId,
            estimateOrderId: payment.estimateOrderId,
            eventType: "STRIPE_WEBHOOK_RECEIVED",
            source: "stripe",
        });
    } catch (e) {
        console.warn("Payment log failed (STRIPE_WEBHOOK_RECEIVED):", e);
    }

    payment.status = "Success";
    payment.trackingId = session.id;
    payment.paymentMode = session.payment_method_types?.[0] ?? "card";
    payment.paymentDate = new Date();
    payment.responseJson = JSON.stringify(session);
    await payment.save();
    console.log(`✅ Payment ${payment.id} updated successfully`);

    // 🔹 LOG: Final payment outcome
    try {
        await createPaymentLog({
            paymentId: payment.id,
            orderId: payment.orderId,
            estimateOrderId: payment.estimateOrderId,
            eventType: "PAYMENT_SUCCESS",
            source: "system",
        });
    } catch (e) {
        console.warn("Payment log failed (FINAL_STATUS):", e);
    }

    // Try to find the actual order
    let order = null;
    if (orderIdStr && orderIdStr !== "" && !isNaN(parseInt(orderIdStr))) {
        order = await Order.findByPk(parseInt(orderIdStr));
    }

    if (!order && payment.orderId) {
        order = await Order.findByPk(payment.orderId);
    }

    if (order) {
        console.log(
            `🔄 Updating order ${order.id} paymentStatus from ${order.paymentStatus} to Success`
        );

        const canUpdateOrder = order.paymentStatus !== "paid";

        if (canUpdateOrder) {
            const oldStatus = order.status;

            order.paymentStatus = "paid";
            if (["pending", "new"].includes(order.status)) {
                order.status = "process";
            }
            await order.save();
            console.log(`✅ Order ${order.id} updated successfully`);

            // ✅ UPDATE ORDER STATUS HISTORY WHEN STATUS CHANGES
            if (order.status !== oldStatus) {
                await OrderStatusHistory.create({
                    orderId: order.id,
                    status: order.status,
                    note: `Status changed from ${oldStatus} → ${order.status} due to payment Success`,
                    changedBy: null, // System-generated change
                });
                console.log(`📜 Order status history updated for order ${order.id}`);
            }
        } else {
            console.log(`ℹ️ Order ${order.id} already paid, not updating status`);
        }
    }

    // ✅ CLEAR CART AFTER SUCCESSFUL PAYMENT
    if (order) {
        if ((order as any).isGuest) {
            const guestCart = await Cart.findOne({
                where: { guestToken: (order as any).guestToken ?? null },
            });

            if (guestCart) {
                await CartProduct.destroy({ where: { cartId: guestCart.id } });
                await Cart.destroy({ where: { id: guestCart.id } });
                console.log(
                    `🧹 Guest cart cleared for guestToken: ${order.guestToken}`
                );
            }
        } else if (order.userId) {
            const userCart = await Cart.findOne({
                where: { userId: order.userId },
            });
            if (userCart) {
                await CartProduct.destroy({ where: { cartId: userCart.id } });
                userCart.couponId = null;
                await userCart.save();
                console.log(`🧹 User cart cleared for userId: ${order.userId}`);
            }
        }
    }

    // ✅ SEND ORDER CONFIRMATION EMAIL AFTER SUCCESSFUL PAYMENT
    if (order) {
        try {
            const fullOrder = await Order.findByPk(order.id, {
                include: [
                    { model: OrderProduct, as: "orderProducts" },
                    { model: OrderShippingAddress, as: "shippingAddress" },
                    { model: OrderBillingAddress, as: "billingAddress" },
                ],
            });

            const email =
                (fullOrder as any)?.shippingAddress?.email ||
                (order as any)?.guestEmail ||
                (order as any)?.user?.email;

            if (email && email.includes("@")) {
                await sendOrderPlacedEmail(email, fullOrder);
                console.log(`📧 Payment success email sent to: ${email}`);
            }

            try {
                await sendOrderReceiverNotification(fullOrder);
                console.log(`📧 Payment success email sent to ORDER_RECEIVER`);
            } catch (err) {
                console.warn(
                    "⚠️ Failed to send payment success email to ORDER_RECEIVER:",
                    err
                );
            }
        } catch (err) {
            console.warn("⚠️ Failed to send payment success email:", err);
        }
    }
}

/**
 * Handle expired checkout session from webhook
 */
async function handlePaymentExpired(session: Stripe.Checkout.Session) {
    const paymentCode = session.metadata?.payment_code;
    const orderIdStr = session.metadata?.order_id;
    const estimateOrderIdStr = session.metadata?.estimate_order_id;

    let payment = null;

    if (paymentCode) {
        payment = await Payment.findOne({
            where: { code: paymentCode },
        });
    }

    if (!payment && orderIdStr && orderIdStr !== "") {
        payment = await Payment.findOne({
            where: { orderId: parseInt(orderIdStr) },
            order: [["createdAt", "DESC"]],
        });
    }

    if (!payment && estimateOrderIdStr && estimateOrderIdStr !== "") {
        payment = await Payment.findOne({
            where: { estimateOrderId: estimateOrderIdStr },
            order: [["createdAt", "DESC"]],
        });
    }

    if (!payment) {
        console.log(`⚠️ No payment record found for expired session ${session.id}`);
        return;
    }

    // Only update if payment hasn't already succeeded
    if (payment.status !== "Success") {
        payment.status = "Aborted";
        payment.responseJson = JSON.stringify(session);
        await payment.save();
        console.log(`⏰ Payment ${payment.id} marked as expired/aborted`);

        try {
            await createPaymentLog({
                paymentId: payment.id,
                orderId: payment.orderId,
                estimateOrderId: payment.estimateOrderId,
                eventType: "PAYMENT_ABORTED",
                source: "stripe",
            });
        } catch (e) {
            console.warn("Payment log failed (PAYMENT_ABORTED):", e);
        }

        // Update order status if applicable
        let order = null;
        if (orderIdStr && orderIdStr !== "" && !isNaN(parseInt(orderIdStr))) {
            order = await Order.findByPk(parseInt(orderIdStr));
        }
        if (!order && payment.orderId) {
            order = await Order.findByPk(payment.orderId);
        }

        if (order && order.paymentStatus !== "paid") {
            const oldStatus = order.status;
            order.paymentStatus = "cancelled";
            order.status = "cancelled";
            await order.save();

            if (order.status !== oldStatus) {
                await OrderStatusHistory.create({
                    orderId: order.id,
                    status: order.status,
                    note: `Status changed from ${oldStatus} → ${order.status} due to payment session expiry`,
                    changedBy: null,
                });
            }
        }
    }
}

/**
 * STEP 3: Retrieve session status (for frontend to check payment result)
 */
export const getSessionStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const sessionId = req.query.session_id as string;

        if (!sessionId) {
            return res.status(400).json({ message: "session_id is required" });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // Find payment by tracking ID (session ID)
        const payment = await Payment.findOne({
            where: { trackingId: sessionId },
        });

        let orderId: string | null = null;
        let status = "Failure";

        if (session.payment_status === "paid") {
            status = "Success";
        } else if (session.status === "expired") {
            status = "Aborted";
        }

        orderId =
            session.metadata?.order_id ||
            session.metadata?.estimate_order_id ||
            payment?.orderId?.toString() ||
            null;

        res.json({
            success: true,
            status,
            orderId,
            paymentStatus: session.payment_status,
            sessionStatus: session.status,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * STEP 4️⃣: For testing & health check
 */
export const testPayment = async (_req: Request, res: Response) => {
    res.json({
        message: "Stripe Payment API is live",
        createEndpoint: "/api/v1/payments/stripe/create",
        webhookEndpoint: "/api/v1/payments/stripe/webhook",
        sessionStatusEndpoint: "/api/v1/payments/stripe/session-status",
    });
};
