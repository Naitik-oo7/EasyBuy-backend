import { Request, Response, NextFunction } from "express";
import PaymentLog, { PaymentEventType } from "../models/paymentLog.model";
import Payment from "../models/payment.model";
import { Op, fn, col } from "sequelize";
import Order from "../models/order.model";

/**
 * Internal helper – use this everywhere
 */
export const createPaymentLog = async (params: {
  paymentId: number;
  orderId?: number | null;
  estimateOrderId?: string | null;
  eventType: PaymentEventType;
  source: "frontend" | "backend" | "stripe" | "cron" | "system";
  req?: Request;
}) => {
  return PaymentLog.create({
    paymentId: params.paymentId,
    orderId: params.orderId ?? null,
    estimateOrderId: params.estimateOrderId ?? null,
    eventType: params.eventType,
    source: params.source,
    ipAddress: params.req?.ip ?? null,
    userAgent: params.req?.headers["user-agent"] ?? null,
  });
};

/**
 * ✅ FRONTEND – user returned to website after payment
 * This endpoint is SAFE:
 * - No payment mutation
 * - No order mutation
 * - Logging only
 */
export const logFrontendReturn = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId, estimateOrderId, status } = req.body;

    if (!orderId && !estimateOrderId) {
      return res.status(400).json({
        message: "orderId or estimateOrderId is required",
      });
    }

    // Find latest payment for order / estimate
    const payment = await Payment.findOne({
      where: orderId
        ? { orderId: Number(orderId) }
        : { estimateOrderId: estimateOrderId },
      order: [["createdAt", "DESC"]],
    });

    if (!payment) {
      // Silently ignore — FE should never break user flow
      return res.json({ success: true });
    }

    await createPaymentLog({
      paymentId: payment.id,
      orderId: payment.orderId,
      estimateOrderId: payment.estimateOrderId,
      eventType: "FRONTEND_RETURN",
      source: "frontend",
      req,
    });

    return res.json({ success: true });
  } catch (err) {
    // Never block FE
    console.warn("Frontend return logging failed:", err);
    return res.json({ success: true });
  }
};

// ✅ Admin – list all payment logs with search & filters

export const listAllPaymentLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "20"));
    const offset = (page - 1) * limit;

    // ✅ Step 1: Build filter conditions for logs
    const logWhere: any = {};
    const paymentWhere: any = {};
    const orderWhere: any = {};

    // 🔍 Search (paymentId / orderId / invoiceNumber)
    if (req.query.search) {
      const term = (req.query.search as string).trim();
      const isNumber = !isNaN(Number(term));

      if (isNumber) {
        logWhere[Op.or] = [
          { paymentId: Number(term) },
          { orderId: Number(term) },
        ];
      }

      // For invoice number search
      orderWhere.invoiceNumber = { [Op.iLike]: `%${term}%` };
    }

    // 🎯 Filter by eventType
    if (req.query.eventType) {
      logWhere.eventType = req.query.eventType;
    }

    // 🎯 Filter by source
    if (req.query.source) {
      logWhere.source = req.query.source;
    }

    // 🗓 Date range
    if (req.query.startDate || req.query.endDate) {
      const start = req.query.startDate
        ? new Date(req.query.startDate as string)
        : null;
      const end = req.query.endDate
        ? new Date(req.query.endDate as string)
        : null;

      if (start) start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 59, 999);

      if (start && end) {
        logWhere.createdAt = { [Op.between]: [start, end] };
      } else if (start) {
        logWhere.createdAt = { [Op.gte]: start };
      } else if (end) {
        logWhere.createdAt = { [Op.lte]: end };
      }
    }

    // ✅ Step 2: Get unique paymentIds with proper sorting
    // First get the latest createdAt for each paymentId to sort by
    const latestLogs = await PaymentLog.findAll({
      where: logWhere,
      attributes: [
        "paymentId",
        [fn("MAX", col("PaymentLog.created_at")), "latest_created_at"],
      ],
      include: [
        {
          model: Payment,
          as: "payment",
          attributes: [],
          where: paymentWhere,
          include: [
            {
              model: Order,
              as: "order",
              attributes: [],
              where: orderWhere,
              required: Object.keys(orderWhere).length > 0,
            },
          ],
          required:
            Object.keys(paymentWhere).length > 0 ||
            Object.keys(orderWhere).length > 0,
        },
      ],
      group: ["paymentId"],
      order: [[fn("MAX", col("PaymentLog.created_at")), "DESC"]],
    });

    const totalCount = latestLogs.length;

    // Apply pagination to the sorted list
    const paginatedLogs = latestLogs.slice(offset, offset + limit);
    const paymentIds = paginatedLogs.map((log: any) => log.paymentId);

    if (paymentIds.length === 0) {
      return res.status(200).json({
        success: true,
        meta: {
          total: 0,
          page,
          limit,
        },
        data: [],
      });
    }

    // ✅ Step 3: Get all logs for these paymentIds
    const logs = await PaymentLog.findAll({
      where: {
        paymentId: {
          [Op.in]: paymentIds,
        },
        ...logWhere,
      },
      include: [
        {
          model: Payment,
          as: "payment",
          attributes: ["id", "code", "status", "orderId", "estimateOrderId"],
          include: [
            {
              model: Order,
              as: "order",
              attributes: ["id", "invoiceNumber"],
            },
          ],
        },
      ],
      order: [
        ["paymentId", "DESC"], // Sort by paymentId first
        ["createdAt", "DESC"], // Then by createdAt
      ],
    });

    // ✅ Step 4: Group by paymentId
    const grouped: Record<number, any> = {};

    for (const log of logs as any[]) {
      if (!grouped[log.paymentId]) {
        grouped[log.paymentId] = {
          paymentId: log.paymentId,
          orderId: log.orderId,
          estimateOrderId: log.estimateOrderId,
          payment: log.payment,
          lastEvent: log.eventType,
          lastEventAt: log.createdAt,
          hasSuccess: false,
          hasFailure: false,
          events: [],
        };
      }

      if (log.eventType === "PAYMENT_SUCCESS") {
        grouped[log.paymentId].hasSuccess = true;
        // Update last event if this is more recent
        if (
          !grouped[log.paymentId].lastEventAt ||
          log.createdAt > grouped[log.paymentId].lastEventAt
        ) {
          grouped[log.paymentId].lastEvent = log.eventType;
          grouped[log.paymentId].lastEventAt = log.createdAt;
        }
      }

      if (
        log.eventType === "PAYMENT_FAILED" ||
        log.eventType === "RECONCILED_FAILED"
      ) {
        grouped[log.paymentId].hasFailure = true;
        // Update last event if this is more recent
        if (
          !grouped[log.paymentId].lastEventAt ||
          log.createdAt > grouped[log.paymentId].lastEventAt
        ) {
          grouped[log.paymentId].lastEvent = log.eventType;
          grouped[log.paymentId].lastEventAt = log.createdAt;
        }
      }

      grouped[log.paymentId].events.push({
        id: log.id,
        eventType: log.eventType,
        source: log.source,
        createdAt: log.createdAt,
      });
    }

    const groupedList = Object.values(grouped).sort((a, b) => {
      return (
        new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime()
      );
    });

    return res.status(200).json({
      success: true,
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
      data: groupedList,
    });
  } catch (err) {
    next(err);
  }
};
