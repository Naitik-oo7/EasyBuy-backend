// models/cart.model.ts
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import CartProduct from "./cartProduct.model";
import Coupon from "./coupon.model";

export interface ICartAttributes {
  id: number;
  userId: number | null;
  couponId?: number | null;
  guestToken?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ICartCreationAttributes = Optional<
  ICartAttributes,
  "id" | "userId" | "couponId" | "guestToken"
>;

class Cart
  extends Model<ICartAttributes, ICartCreationAttributes>
  implements ICartAttributes
{
  public id!: number;
  public userId!: number | null;
  public couponId!: number | null;
  public guestToken!: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Association fields for TypeScript
  public cartProducts?: CartProduct[];
  public coupon?: Coupon;
}

Cart.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    couponId: { type: DataTypes.INTEGER, allowNull: true },
    guestToken: { type: DataTypes.STRING, allowNull: true },
  },
  {
    tableName: "cart",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default Cart;
