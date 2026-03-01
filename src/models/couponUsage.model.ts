// models/couponUsage.model.ts
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface ICouponUsageAttributes {
  id: number;
  couponId: number;
  userId: number;
  usedCount: number;
}

export type ICouponUsageCreationAttributes = Optional<
  ICouponUsageAttributes,
  "id" | "usedCount"
>;

class CouponUsage
  extends Model<ICouponUsageAttributes, ICouponUsageCreationAttributes>
  implements ICouponUsageAttributes
{
  public id!: number;
  public couponId!: number;
  public userId!: number;
  public usedCount!: number;
}

CouponUsage.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    couponId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    usedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "coupon_usage",
    sequelize,
    timestamps: false,
    underscored: true,
  }
);

export default CouponUsage;
