import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IWishlistAttributes {
  id: number;
  userId: number;
  productId: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IWishlistCreationAttributes = Optional<IWishlistAttributes, "id">;

class Wishlist
  extends Model<IWishlistAttributes, IWishlistCreationAttributes>
  implements IWishlistAttributes
{
  public id!: number;
  public userId!: number;
  public productId!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Wishlist.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    tableName: "wishlists",
    timestamps: true,
    underscored: true,
  }
);

export default Wishlist;
