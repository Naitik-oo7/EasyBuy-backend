import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import OrderProduct from "./orderProduct.model";
import OrderShippingAddress from "./orderShippingAddress.model";
import OrderBillingAddress from "./orderBillingAddress.model";

interface OrderAttributes {
  id: number;
  userId: number | null;
  invoiceNumber: string | null;

  // Pricing
  subtotal: number;
  discount: number;
  taxTotal: number;

  shippingBase: number;
  shippingTax: number;
  shippingTotal: number;

  grandTotal: number;

  // Coupon snapshot
  couponCode?: string | null;
  couponType?: string | null;
  couponDiscount?: number | null;

  // Payment
  paymentMode: string;
  paymentMethod?: string | null;
  paymentStatus: string;

  // Status / Tracking
  status: string;
  trackingId?: string | null;
  trackingUrl?: string | null;
  shiprocketId?: string | null;
  corporateId?: number | null;

  isGuest?: boolean;
  guestEmail?: string | null;
  guestMobile?: string | null;
  guestName?: string | null;
  guestToken?: string | null;
  /**
   * Hash representing the cart contents, coupon, and addresses.
   * Used for smart order reuse feature to detect if cart/addresses changed.
   * Database migration required: ALTER TABLE orders ADD COLUMN checkout_hash VARCHAR(255);
   */
  checkoutHash?: string | null;

  orderProducts?: OrderProduct[];
  shippingAddress?: OrderShippingAddress;
  billingAddress?: OrderBillingAddress;
  createdAt?: Date;
  updatedAt?: Date;
}

interface OrderCreationAttributes
  extends Optional<
    OrderAttributes,
    | "id"
    | "userId"
    | "couponCode"
    | "couponType"
    | "couponDiscount"
    | "paymentMethod"
    | "trackingId"
    | "trackingUrl"
    | "shiprocketId"
    | "orderProducts"
    | "shippingAddress"
    | "billingAddress"
    | "corporateId"
    | "isGuest"
    | "guestEmail"
    | "guestMobile"
    | "guestName"
    | "guestToken"
    | "createdAt"
    | "updatedAt"
  > {}

class Order
  extends Model<OrderAttributes, OrderCreationAttributes>
  implements OrderAttributes
{
  public id!: number;
  public userId!: number | null;
  public invoiceNumber!: string;

  public subtotal!: number;
  public discount!: number;
  public taxTotal!: number;

  public shippingBase!: number;
  public shippingTax!: number;
  public shippingTotal!: number;

  public grandTotal!: number;

  public couponCode?: string | null;
  public couponType?: string | null;
  public couponDiscount?: number | null;

  public paymentMode!: string;
  public paymentMethod?: string | null;
  public paymentStatus!: string;

  public status!: string;
  public trackingId?: string | null;
  public trackingUrl?: string | null;
  public shiprocketId?: string | null;
  public corporateId?: number | null;

  public isGuest?: boolean;
  public guestEmail?: string | null;
  public guestMobile?: string | null;
  public guestName?: string | null;
  public guestToken?: string | null;
  public checkoutHash?: string | null;

  public orderProducts?: OrderProduct[];
  public shippingAddress?: OrderShippingAddress;
  public billingAddress?: OrderBillingAddress;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Order.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    invoiceNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },

    subtotal: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    discount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    taxTotal: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },

    shippingBase: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    shippingTax: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    shippingTotal: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },

    grandTotal: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },

    couponCode: { type: DataTypes.STRING(100), allowNull: true },
    couponType: { type: DataTypes.STRING(50), allowNull: true },
    couponDiscount: { type: DataTypes.FLOAT, allowNull: true },

    paymentMode: { type: DataTypes.STRING(50), allowNull: false },
    paymentMethod: { type: DataTypes.STRING(50), allowNull: true },
    paymentStatus: { type: DataTypes.STRING(50), allowNull: false },

    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "pending",
    },
    trackingId: { type: DataTypes.STRING(255), allowNull: true },
    trackingUrl: { type: DataTypes.STRING(500), allowNull: true },
    shiprocketId: { type: DataTypes.STRING(255), allowNull: true },
    corporateId: { type: DataTypes.INTEGER, allowNull: true },

    isGuest: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    guestEmail: { type: DataTypes.STRING, allowNull: true },
    guestMobile: { type: DataTypes.STRING, allowNull: true },
    guestName: { type: DataTypes.STRING, allowNull: true },
    guestToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Unique token linking guest cart to this order",
    },
    checkoutHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment:
        "Hash representing cart contents, coupon, and addresses for smart order reuse",
    },
  },
  {
    tableName: "orders",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default Order;
