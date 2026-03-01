// models/coupon.model.ts
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface ICouponAttributes {
  id: number;
  code: string;
  discount: number;
  type?: string | null; // e.g., "percentage" or "fixed"
  status: "active" | "inactive";
  maxUsage?: number | null; // per user
  totalUsage?: number; // global usage counter
  createdAt?: Date;
  updatedAt?: Date;
}

export type ICouponCreationAttributes = Optional<
  ICouponAttributes,
  "id" | "type" | "status" | "maxUsage" | "totalUsage"
>;

class Coupon
  extends Model<ICouponAttributes, ICouponCreationAttributes>
  implements ICouponAttributes
{
  public id!: number;
  public code!: string;
  public discount!: number;
  public type!: string | null;
  public status!: "active" | "inactive";
  public maxUsage!: number | null;
  public totalUsage!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Coupon.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(25), allowNull: false, unique: true },
    discount: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING(255), allowNull: true }, // "percentage" or "fixed"
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },
    maxUsage: { type: DataTypes.INTEGER, allowNull: true },
    totalUsage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "coupon",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default Coupon;
