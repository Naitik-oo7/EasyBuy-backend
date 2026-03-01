import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import Payment from "./payment.model";

export type PaymentEventType =
  | "PAYMENT_CREATED"
  | "REDIRECT_INITIATED"
  | "REDIRECT_RENDERED"
  | "STRIPE_WEBHOOK_RECEIVED"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "PAYMENT_ABORTED"
  | "FRONTEND_RETURN"
  | "RECONCILIATION_CHECK"
  | "RECONCILED_SUCCESS"
  | "RECONCILED_FAILED";

export interface IPaymentLogAttributes {
  id: number;
  paymentId: number;
  orderId?: number | null;
  estimateOrderId?: string | null;
  eventType: PaymentEventType;
  source: "frontend" | "backend" | "stripe" | "cron" | "system";
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
}

export type IPaymentLogCreationAttributes = Optional<
  IPaymentLogAttributes,
  "id" | "ipAddress" | "userAgent" | "createdAt"
>;

class PaymentLog
  extends Model<IPaymentLogAttributes, IPaymentLogCreationAttributes>
  implements IPaymentLogAttributes {
  public id!: number;
  public paymentId!: number;
  public orderId!: number | null;
  public estimateOrderId!: string | null;
  public eventType!: PaymentEventType;
  public source!: "frontend" | "backend" | "stripe" | "cron" | "system";
  public ipAddress!: string | null;
  public userAgent!: string | null;
  public readonly createdAt!: Date;
}

PaymentLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    paymentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    estimateOrderId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    eventType: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },

    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "payment_logs",
    timestamps: true,
    updatedAt: false, // ⛔ append-only
    underscored: true,
    indexes: [
      { fields: ["payment_id"] },
      { fields: ["order_id"] },
      { fields: ["event_type"] },
    ],
  }
);

// Associations
Payment.hasMany(PaymentLog, { foreignKey: "paymentId", as: "logs" });
PaymentLog.belongsTo(Payment, { foreignKey: "paymentId", as: "payment" });

export default PaymentLog;
