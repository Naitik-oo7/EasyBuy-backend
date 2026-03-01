// models/payment.model.ts
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IPaymentAttributes {
  id: number;
  orderId?: number | null; // FK to your orders table (optional)
  estimateOrderId?: string | null; // Estimate order ID for offline sales
  trackingId?: string | null;
  bankRefNo?: string | null;
  code?: string | null; // payment gateway response code
  amount: number;
  fname: string;
  lname: string;
  email: string;
  mobile: string;
  address1?: string | null;
  address2?: string | null;
  city: string;
  state: string;
  pincode: string;
  dealerName?: string | null;
  gst?: string | null;
  description?: string | null;
  status: string; // e.g. pending, success, failed, refunded
  paymentDate?: Date | null;
  gateway?: string;
  responseJson?: string | null;
  paymentMode?: string | null;
}

export type IPaymentCreationAttributes = Optional<
  IPaymentAttributes,
  | "id"
  | "orderId"
  | "estimateOrderId"
  | "trackingId"
  | "bankRefNo"
  | "code"
  | "address1"
  | "address2"
  | "dealerName"
  | "gst"
  | "description"
  | "paymentDate"
  | "gateway"
  | "responseJson"
  | "paymentMode"
>;

class Payment
  extends Model<IPaymentAttributes, IPaymentCreationAttributes>
  implements IPaymentAttributes
{
  public id!: number;
  public orderId!: number | null;
  public estimateOrderId!: string | null;
  public trackingId!: string | null;
  public bankRefNo!: string | null;
  public code!: string | null;
  public amount!: number;
  public fname!: string;
  public lname!: string;
  public email!: string;
  public mobile!: string;
  public address1!: string | null;
  public address2!: string | null;
  public city!: string;
  public state!: string;
  public pincode!: string;
  public dealerName!: string | null;
  public gst!: string | null;
  public description!: string | null;
  public status!: string;
  public paymentDate!: Date | null;
  public gateway!: string;
  public responseJson!: string | null;
  public paymentMode!: string | null;
}

Payment.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.INTEGER, allowNull: true },
    estimateOrderId: { type: DataTypes.STRING(255), allowNull: true },
    trackingId: { type: DataTypes.STRING(255), allowNull: true },
    bankRefNo: { type: DataTypes.STRING(255), allowNull: true },
    code: { type: DataTypes.STRING(50), allowNull: true },
    amount: { type: DataTypes.FLOAT, allowNull: false },
    fname: { type: DataTypes.STRING(100), allowNull: true },
    lname: { type: DataTypes.STRING(100), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: false },
    mobile: { type: DataTypes.STRING(20), allowNull: false },
    address1: { type: DataTypes.STRING(255), allowNull: true },
    address2: { type: DataTypes.STRING(255), allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: false },
    state: { type: DataTypes.STRING(100), allowNull: false },
    pincode: { type: DataTypes.STRING(20), allowNull: false },
    dealerName: { type: DataTypes.STRING(255), allowNull: true },
    gst: { type: DataTypes.STRING(50), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "pending",
    },
    paymentDate: { type: DataTypes.DATE, allowNull: true },
    gateway: { type: DataTypes.STRING(100), allowNull: true },
    paymentMode: { type: DataTypes.STRING(100), allowNull: true },

    responseJson: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: "payments",
    timestamps: true,
    underscored: true,
  }
);

export default Payment;
