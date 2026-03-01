import { Request, Response, NextFunction } from "express";
import { Op, fn, col, literal } from "sequelize";
import Order from "../models/order.model";
import User from "../models/user.model";
import { getFileUrl } from "../utils/awsS3";
import OrderProduct from "../models/orderProduct.model";
import CorporateCredit from "../models/corporateCredit.model";
import CorporateCreditHistory from "../models/corporateCreditHistory.model";
import Payment from "../models/payment.model";
import sequelize from "../config/database";
import OrderShippingAddress from "../models/orderShippingAddress.model";

//  Utility: Get start/end dates for dashboard filters

function getDateRange(period?: string, startDate?: string, endDate?: string) {
  const now = new Date();
  let start: Date;
  let end: Date;

  // ✅ Automatically treat startDate+endDate as custom range
  if (startDate && endDate) {
    start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  switch (period) {
    case "today":
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
      break;

    case "week":
      start = new Date();
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
      break;

    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;

    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;

    default:
      start = new Date();
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

// Controller: GET /api/v1/dashboard/summary

export const getDashboardSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { period, startDate, endDate } = req.query as {
      period?: string;
      startDate?: string;
      endDate?: string;
    };

    const { start, end } = getDateRange(period, startDate, endDate);

    // Define a type for our aggregate result
    type SummaryRow = { totalSales: number; totalRevenue: number };

    //  Normal Orders
    const [normalData] = (await Order.findAll({
      where: {
        corporateId: null,
        status: { [Op.notIn]: ["cancelled", "returned", "pending", "trash"] },
        paymentStatus: "paid",
        createdAt: { [Op.between]: [start, end] },
      },
      attributes: [
        [fn("COUNT", col("id")), "totalSales"],
        [literal("COALESCE(SUM(grand_total), 0)"), "totalRevenue"],
      ],
      raw: true,
    })) as unknown as SummaryRow[];

    //  Corporate Orders
    const [corporateData] = (await Order.findAll({
      where: {
        corporateId: { [Op.ne]: null },
        status: { [Op.notIn]: ["cancelled", "returned", "pending", "trash"] },
        paymentStatus: "paid",
        createdAt: { [Op.between]: [start, end] },
      },
      attributes: [
        [fn("COUNT", col("id")), "totalSales"],
        [literal("COALESCE(SUM(grand_total), 0)"), "totalRevenue"],
      ],
      raw: true,
    })) as unknown as SummaryRow[];

    //  Customers
    const normalCustomers = await User.count({
      where: { role: "user", createdAt: { [Op.between]: [start, end] } },
    });

    const corporateCustomers = await User.count({
      where: {
        role: "corporateUser",
        createdAt: { [Op.between]: [start, end] },
      },
    });

    //  Response
    return res.status(200).json({
      success: true,
      data: {
        normalOrders: {
          totalSales: Number(normalData?.totalSales || 0),
          totalRevenue: Number(normalData?.totalRevenue || 0).toFixed(2),
        },
        corporateOrders: {
          totalSales: Number(corporateData?.totalSales || 0),
          totalRevenue: Number(corporateData?.totalRevenue || 0).toFixed(2),
        },
        customers: { normalCustomers, corporateCustomers },
        period: { start, end },
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getRecentTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const { period, startDate, endDate } = req.query as any;
    const paymentStatus = req.query.paymentStatus as string | undefined; // paid, pending, failed
    const type = (req.query.type as string) || "all"; // normal, corporate, all

    const { start, end } = getDateRange(period, startDate, endDate);

    const where: Record<string, any> = {
      createdAt: { [Op.between]: [start, end] },
    };

    if (paymentStatus) where["payment_status"] = paymentStatus;
    if (type === "normal") where.corporateId = null;
    if (type === "corporate") where.corporateId = { [Op.ne]: null };

    const transactions = await Order.findAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email"],
        },
        {
          model: Payment,
          as: "payment",
          attributes: ["trackingId"],
        },
        {
          model: OrderShippingAddress,
          as: "shippingAddress",
          attributes: ["name", "email", "mobileNumber"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      attributes: [
        "id",
        "invoiceNumber",
        "userId",
        "corporateId",
        "grandTotal",
        "paymentMode",
        "paymentStatus",
        "status",
        "createdAt",
      ],
    });

    const formatted = transactions.map((tx: any) => ({
      transactionId: tx.payment?.trackingId || tx.id,
      invoiceNumber: tx.invoiceNumber,
      userId: tx.userId,
      customerName: tx.user?.name || tx.shippingAddress?.name || "Guest User",
      email: tx.user?.email || tx.shippingAddress?.email || null,
      orderType: tx.corporateId ? "corporate" : "normal",
      amount: Number(tx.grandTotal || 0).toFixed(2),
      paymentMode: tx.paymentMode,
      paymentStatus: tx.paymentStatus,
      orderStatus: tx.status,
      createdAt: tx.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
      meta: {
        period,
        paymentFilter: paymentStatus || "all",
        count: formatted.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getRevenueChart = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const period = (req.query.period as string) || "month"; // week | month | year
    const type = (req.query.type as string) || "all"; // normal | corporate | all

    // -----------------------------------------
    // 🔥 CUSTOM DATE RANGE OVERRIDE (ONLY ADDITION)
    // -----------------------------------------
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      // Build daily labels
      const labels: string[] = [];
      const cursor = new Date(start);
      while (cursor <= end) {
        labels.push(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 1);
      }

      const whereBase: Record<string, any> = {
        status: { [Op.notIn]: ["cancelled", "returned", "pending", "trash"] },
        paymentStatus: "paid",
        createdAt: { [Op.between]: [start, end] },
      };

      if (type === "normal") whereBase.corporateId = null;
      else if (type === "corporate") whereBase.corporateId = { [Op.ne]: null };

      const groupExpr = `TO_CHAR(created_at, 'YYYY-MM-DD')`;

      const orders = await Order.findAll({
        where: whereBase,
        attributes: [
          [literal(groupExpr), "periodKey"],
          [literal("COUNT(*)"), "orders"],
          [literal("COALESCE(SUM(grand_total), 0)"), "sale"],
        ],
        group: [sequelize.literal(groupExpr) as any], // ✅ FIXED 100%
        raw: true,
      });

      const userWhere: Record<string, any> = {
        createdAt: { [Op.between]: [start, end] },
        [Op.or]: [{ role: "user" }, { role: "corporateUser" }],
      };

      if (type === "normal") userWhere.corporateId = null;
      else if (type === "corporate") userWhere.corporateId = { [Op.ne]: null };

      const users = await User.findAll({
        where: userWhere,
        attributes: [
          [literal(groupExpr), "periodKey"],
          [literal("COUNT(*)"), "newCustomers"],
        ],
        group: [sequelize.literal(groupExpr) as any], // ✅ FIXED 100%
        raw: true,
      });

      const saleMap = new Map();
      const orderMap = new Map();
      const userMap = new Map();

      orders.forEach((r: any) => {
        saleMap.set(String(r.periodKey), Number(r.sale));
        orderMap.set(String(r.periodKey), Number(r.orders));
      });

      users.forEach((r: any) => {
        userMap.set(String(r.periodKey), Number(r.newCustomers));
      });

      const chartData = labels.map((label) => ({
        period: label,
        sale: Number(saleMap.get(label) || 0).toFixed(2),
        orders: orderMap.get(label) || 0,
        newCustomers: userMap.get(label) || 0,
      }));

      return res.status(200).json({
        success: true,
        data: chartData,
        filters: { type, period: "custom", start, end },
      });
    }
    // -----------------------------------------
    // END CUSTOM RANGE OVERRIDE
    // -----------------------------------------

    const now = new Date();
    const currentYear = now.getFullYear();

    let start: Date,
      end: Date,
      labels: string[] = [],
      groupExpr: string;

    // -----------------------
    // Period-specific ranges
    // -----------------------
    if (period === "week") {
      // ✅ Match other APIs: show last 7 days (including today)
      start = new Date();
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);

      end = new Date();
      end.setHours(23, 59, 59, 999);

      // Keep labels and grouping same
      labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      groupExpr = "EXTRACT(DOW FROM created_at)";
    } else if (period === "month") {
      // Financial year (Apr -> Mar) — same as earlier behavior
      const fyStart =
        now.getMonth() + 1 >= 4
          ? new Date(currentYear, 3, 1)
          : new Date(currentYear - 1, 3, 1);
      const fyEnd = new Date(fyStart);
      fyEnd.setFullYear(fyEnd.getFullYear() + 1);
      fyEnd.setMonth(2, 31);
      fyEnd.setHours(23, 59, 59, 999);

      start = fyStart;
      end = fyEnd;

      labels = [
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
        "Jan",
        "Feb",
        "Mar",
      ];
      groupExpr = "EXTRACT(MONTH FROM created_at)";
    } else {
      // period === "year"
      // Show data for last 5 years (inclusive)
      const fromYear = currentYear - 4;
      start = new Date(fromYear, 0, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(currentYear, 11, 31);
      end.setHours(23, 59, 59, 999);

      labels = [];
      for (let y = fromYear; y <= currentYear; y++) labels.push(String(y));
      groupExpr = "EXTRACT(YEAR FROM created_at)";
    }

    // -----------------------
    // Base filters for orders
    // -----------------------
    const whereBase: Record<string, any> = {
      status: { [Op.notIn]: ["cancelled", "returned", "pending", "trash"] },
      paymentStatus: "paid",
      createdAt: { [Op.between]: [start, end] },
    };

    if (type === "normal") whereBase.corporateId = null;
    else if (type === "corporate") whereBase.corporateId = { [Op.ne]: null };

    // -----------------------
    // Orders aggregation
    // -----------------------
    const orders = await Order.findAll({
      where: whereBase,
      attributes: [
        [literal(groupExpr), "periodKey"],
        [literal("COUNT(*)"), "orders"],
        [literal("COALESCE(SUM(grand_total), 0)"), "sale"],
      ],
      group: [literal(groupExpr) as any],
      raw: true,
    });

    // -----------------------
    // New customers aggregation
    // -----------------------
    const userWhere: Record<string, any> = {
      createdAt: { [Op.between]: [start, end] },
    };
    if (type === "normal") userWhere.corporateId = null;
    else if (type === "corporate") userWhere.corporateId = { [Op.ne]: null };

    const users = await User.findAll({
      where: {
        [Op.and]: [
          { createdAt: { [Op.between]: [start, end] } },
          { [Op.or]: [{ role: "user" }, { role: "corporateUser" }] },
        ],
      },
      attributes: [
        [literal(groupExpr), "periodKey"],
        [literal("COUNT(*)"), "newCustomers"],
      ],
      group: [literal(groupExpr) as any],
      raw: true,
    });

    // -----------------------
    // Convert results to maps
    // -----------------------
    const saleMap = new Map<number, number>();
    const orderMap = new Map<number, number>();
    const userMap = new Map<number, number>();

    orders.forEach((r: any) => {
      saleMap.set(Number(r.periodKey), Number(r.sale));
      orderMap.set(Number(r.periodKey), Number(r.orders));
    });

    users.forEach((r: any) => {
      userMap.set(Number(r.periodKey), Number(r.newCustomers));
    });

    // Month mapping (for FY labels)
    const monthMap: Record<string, number> = {
      Apr: 4,
      May: 5,
      Jun: 6,
      Jul: 7,
      Aug: 8,
      Sep: 9,
      Oct: 10,
      Nov: 11,
      Dec: 12,
      Jan: 1,
      Feb: 2,
      Mar: 3,
    };

    // -----------------------
    // Build final payload
    // -----------------------
    const chartData = labels.map((label, idx) => {
      let key: any;
      if (period === "week") {
        key = idx;
      } else if (period === "month") {
        key = monthMap[label]; // FY months mapped to month number
      } else {
        key = Number(label); // year number
      }

      return {
        period: label,
        sale: Number(saleMap.get(key) || 0).toFixed(2),
        orders: orderMap.get(key) || 0,
        newCustomers: userMap.get(key) || 0,
      };
    });

    return res.status(200).json({
      success: true,
      data: chartData,
      filters: { type, period },
    });
  } catch (err) {
    console.error("Error in getDashboardChart:", err);
    next(err);
  }
};

// export const getRevenueChart = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const period = (req.query.period as string) || "month"; // week | month | year
//     const type = (req.query.type as string) || "all"; // normal | corporate | all

//     const now = new Date();
//     const currentYear = now.getFullYear();

//     let start: Date,
//       end: Date,
//       labels: string[] = [],
//       groupExpr: string;

//     // -----------------------
//     // Period-specific ranges
//     // -----------------------
//     if (period === "week") {
//       // ✅ Match other APIs: show last 7 days (including today)
//       start = new Date();
//       start.setDate(now.getDate() - 7);
//       start.setHours(0, 0, 0, 0);

//       end = new Date();
//       end.setHours(23, 59, 59, 999);

//       // Keep labels and grouping same
//       labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
//       groupExpr = "EXTRACT(DOW FROM created_at)";
//     } else if (period === "month") {
//       // Financial year (Apr -> Mar) — same as earlier behavior
//       const fyStart =
//         now.getMonth() + 1 >= 4
//           ? new Date(currentYear, 3, 1)
//           : new Date(currentYear - 1, 3, 1);
//       const fyEnd = new Date(fyStart);
//       fyEnd.setFullYear(fyEnd.getFullYear() + 1);
//       fyEnd.setMonth(2, 31);
//       fyEnd.setHours(23, 59, 59, 999);

//       start = fyStart;
//       end = fyEnd;

//       labels = [
//         "Apr",
//         "May",
//         "Jun",
//         "Jul",
//         "Aug",
//         "Sep",
//         "Oct",
//         "Nov",
//         "Dec",
//         "Jan",
//         "Feb",
//         "Mar",
//       ];
//       groupExpr = "EXTRACT(MONTH FROM created_at)";
//     } else {
//       // period === "year"
//       // Show data for last 5 years (inclusive)
//       const fromYear = currentYear - 4;
//       start = new Date(fromYear, 0, 1);
//       start.setHours(0, 0, 0, 0);
//       end = new Date(currentYear, 11, 31);
//       end.setHours(23, 59, 59, 999);

//       labels = [];
//       for (let y = fromYear; y <= currentYear; y++) labels.push(String(y));
//       groupExpr = "EXTRACT(YEAR FROM created_at)";
//     }

//     // -----------------------
//     // Base filters for orders
//     // -----------------------
//     const whereBase: Record<string, any> = {
//       status: { [Op.notIn]: ["cancelled", "returned", "pending"] },
//       paymentStatus: "paid",
//       createdAt: { [Op.between]: [start, end] },
//     };

//     if (type === "normal") whereBase.corporateId = null;
//     else if (type === "corporate") whereBase.corporateId = { [Op.ne]: null };

//     // -----------------------
//     // Orders aggregation
//     // -----------------------
//     const orders = await Order.findAll({
//       where: whereBase,
//       attributes: [
//         [literal(groupExpr), "periodKey"],
//         [literal("COUNT(*)"), "orders"],
//         [literal("COALESCE(SUM(grand_total), 0)"), "sale"],
//       ],
//       group: [literal(groupExpr) as any],
//       raw: true,
//     });

//     // -----------------------
//     // New customers aggregation
//     // -----------------------
//     const userWhere: Record<string, any> = {
//       createdAt: { [Op.between]: [start, end] },
//     };
//     if (type === "normal") userWhere.corporateId = null;
//     else if (type === "corporate") userWhere.corporateId = { [Op.ne]: null };

//     const users = await User.findAll({
//       where: userWhere,
//       attributes: [
//         [literal(groupExpr), "periodKey"],
//         [literal("COUNT(*)"), "newCustomers"],
//       ],
//       group: [literal(groupExpr) as any],
//       raw: true,
//     });

//     // -----------------------
//     // Convert results to maps
//     // -----------------------
//     const saleMap = new Map<number, number>();
//     const orderMap = new Map<number, number>();
//     const userMap = new Map<number, number>();

//     orders.forEach((r: any) => {
//       saleMap.set(Number(r.periodKey), Number(r.sale));
//       orderMap.set(Number(r.periodKey), Number(r.orders));
//     });

//     users.forEach((r: any) => {
//       userMap.set(Number(r.periodKey), Number(r.newCustomers));
//     });

//     // Month mapping (for FY labels)
//     const monthMap: Record<string, number> = {
//       Apr: 4,
//       May: 5,
//       Jun: 6,
//       Jul: 7,
//       Aug: 8,
//       Sep: 9,
//       Oct: 10,
//       Nov: 11,
//       Dec: 12,
//       Jan: 1,
//       Feb: 2,
//       Mar: 3,
//     };

//     // -----------------------
//     // Build final payload
//     // -----------------------
//     const chartData = labels.map((label, idx) => {
//       let key: any;
//       if (period === "week") {
//         key = idx; // DOW: 0..6 (Sun..Sat)
//       } else if (period === "month") {
//         key = monthMap[label]; // FY months mapped to month number
//       } else {
//         key = Number(label); // year number
//       }

//       return {
//         period: label,
//         sale: Number(saleMap.get(key) || 0).toFixed(2),
//         orders: orderMap.get(key) || 0,
//         newCustomers: userMap.get(key) || 0,
//       };
//     });

//     return res.status(200).json({
//       success: true,
//       data: chartData,
//       filters: { type, period },
//     });
//   } catch (err) {
//     console.error("Error in getDashboardChart:", err);
//     next(err);
//   }
// };
