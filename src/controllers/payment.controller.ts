import { Request, Response, NextFunction } from "express";
import Payment from "../models/payment.model";
import Order from "../models/order.model";
import User from "../models/user.model";
import { Op, Sequelize } from "sequelize";
import { generatePaymentCode } from "../utils/codeHelper";
import { createPaymentLog } from "./paymentLog.controller";

// Create Payment (usually from gateway callback or after placing order)

// ✅ Improved createPayment (prevents duplicates, allows for estimateOrderId)
export const createPayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId, estimateOrderId, ...data } = req.body;

    // Validate orderId is a number if provided
    if (orderId !== undefined && orderId !== null) {
      const orderIdNum = Number(orderId);
      if (
        isNaN(orderIdNum) ||
        !Number.isInteger(orderIdNum) ||
        orderIdNum <= 0
      ) {
        return res
          .status(400)
          .json({ message: "orderId must be a positive integer" });
      }
    }

    // If orderId is provided, ensure order exists (for regular flow)
    if (orderId) {
      const order = await Order.findByPk(Number(orderId));
      if (!order) return res.status(404).json({ message: "Order not found" });
    }

    // If neither orderId nor estimateOrderId is provided, return error
    if (!orderId && !estimateOrderId) {
      return res.status(400).json({
        message: "Either orderId or estimateOrderId must be provided",
      });
    }
    if (orderId && estimateOrderId) {
      return res.status(400).json({
        message: "Provide either orderId or estimateOrderId, not both",
      });
    }

    // Build the search criteria based on what's available
    let whereClause: any = {};
    if (orderId) {
      whereClause.orderId = Number(orderId);
    } else if (estimateOrderId) {
      whereClause.estimateOrderId = estimateOrderId;
    }

    // 🔹 Check if a payment already exists with either orderId or estimateOrderId
    let existingPayment = await Payment.findOne({ where: whereClause });

    if (existingPayment) {
      return res.status(409).json({
        success: false,
        message: "Payment already exists for this order/estimate",
      });
    }

    // 🔹 If not found, generate unique code and create new
    let code: string;
    let exists: any;
    do {
      code = generatePaymentCode(8);
      exists = await Payment.findOne({ where: { code } });
    } while (exists);

    // Handle name field from frontend - split into fname and lname if needed
    const paymentData: any = { ...data };

    if (data.name && !data.fname && !data.lname) {
      const nameParts = data.name.trim().split(" ");
      if (nameParts.length === 1) {
        paymentData.fname = nameParts[0];
        paymentData.lname = "";
      } else if (nameParts.length >= 2) {
        paymentData.fname = nameParts[0];
        paymentData.lname = nameParts.slice(1).join(" ");
      }
    }

    const payment = await Payment.create({
      orderId: orderId || null,
      estimateOrderId: estimateOrderId || null,
      code,
      ...paymentData,
      status: data.status || "pending",
    });

    await createPaymentLog({
      paymentId: payment.id,
      orderId: payment.orderId,
      estimateOrderId: payment.estimateOrderId,
      eventType: "PAYMENT_CREATED",
      source: "backend",
      req,
    });

    return res.status(201).json({
      success: true,
      message: "New payment created",
      data: payment,
    });
  } catch (err) {
    next(err);
  }
};

// Get Payment by Code
export const getPaymentByCode = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code } = req.params;

    const payment = await Payment.findOne({
      where: { code },
      include: [{ model: Order, as: "order" }],
    });

    if (!payment) return res.status(404).json({ message: "Payment not found" });

    return res.status(200).json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
};

// List Payments (admin)

export const listPayments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.max(1, parseInt((req.query.limit as string) || "10"));
    const offset = (page - 1) * limit;

    const where: any = {};
    const include: any = [{ model: Order, as: "order" }];

    // 🔍 Search in payment table fields including estimateOrderId
    if (req.query.search) {
      const searchTerm = (req.query.search as string).trim();
      const isNumeric = !isNaN(Number(searchTerm));

      where[Op.or] = [
        { fname: { [Op.iLike]: `%${searchTerm}%` } },
        { lname: { [Op.iLike]: `%${searchTerm}%` } },
        Sequelize.where(
          Sequelize.fn(
            "CONCAT",
            Sequelize.col("fname"),
            " ",
            Sequelize.col("lname")
          ),
          { [Op.iLike]: `%${searchTerm}%` }
        ),
        { email: { [Op.iLike]: `%${searchTerm}%` } },
        { mobile: { [Op.iLike]: `%${searchTerm}%` } },
        { status: { [Op.iLike]: `%${searchTerm}%` } },
        { code: { [Op.iLike]: `%${searchTerm}%` } },
        { gateway: { [Op.iLike]: `%${searchTerm}%` } },
        { estimateOrderId: { [Op.iLike]: `%${searchTerm}%` } }, // Add estimateOrderId to search
        Sequelize.where(Sequelize.col("order.invoice_number"), {
          [Op.iLike]: `%${searchTerm}%`,
        }),
      ];

      if (isNumeric) {
        where[Op.or].push({ orderId: Number(searchTerm) });
      }
    }

    // 🟡 Status filter
    if (req.query.status) {
      const normalizedStatus = req.query.status.toString().toLowerCase();
      where.status = { [Op.iLike]: normalizedStatus };
    }

    // 🗓️ Date range filter
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
        where.paymentDate = { [Op.between]: [start, end] };
      } else if (start) {
        where.paymentDate = { [Op.gte]: start };
      } else if (end) {
        where.paymentDate = { [Op.lte]: end };
      }
    }

    // 📦 Fetch payments with pagination
    const { count, rows } = await Payment.findAndCountAll({
      where,
      include,
      limit,
      offset,
      distinct: true,
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
      data: rows,
    });
  } catch (err) {
    next(err);
  }
};

// Get Payment by ID
export const getPaymentById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [{ model: Order, as: "order" }],
    });
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    return res.status(200).json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
};

// Update Payment (status, trackingId, etc.)
export const updatePayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    // Validate orderId is a number if provided in update
    if (req.body.orderId !== undefined && req.body.orderId !== null) {
      const orderIdNum = Number(req.body.orderId);
      if (
        isNaN(orderIdNum) ||
        !Number.isInteger(orderIdNum) ||
        orderIdNum <= 0
      ) {
        return res
          .status(400)
          .json({ message: "orderId must be a positive integer" });
      }
    }

    // Handle name field from frontend - split into fname and lname if needed
    const updateData: any = { ...req.body };

    if (req.body.name && !req.body.fname && !req.body.lname) {
      const nameParts = req.body.name.trim().split(" ");
      if (nameParts.length === 1) {
        updateData.fname = nameParts[0];
        updateData.lname = "";
      } else if (nameParts.length >= 2) {
        updateData.fname = nameParts[0];
        updateData.lname = nameParts.slice(1).join(" ");
      }
      // Remove the original name field to avoid conflicts
      delete updateData.name;
    }

    await payment.update(updateData);
    return res.status(200).json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
};

// Delete Payment (admin only)
export const deletePayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    await payment.destroy();
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};
