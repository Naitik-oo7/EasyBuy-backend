// models/productReview.model.ts
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import ProductReviewImage from "./productReviewImage.model";

export interface IProductReviewAttributes {
  id: number;
  productId: number;
  userId?: number;
  userName: string;
  userEmail: string;
  review: string;
  rating: number;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IProductReviewCreationAttributes = Optional<
  IProductReviewAttributes,
  "id" | "userId" | "status" | "userName" | "userEmail"
>;

class ProductReview
  extends Model<IProductReviewAttributes, IProductReviewCreationAttributes>
  implements IProductReviewAttributes
{
  public id!: number;
  public productId!: number;
  public userId?: number;
  public userName!: string;
  public userEmail!: string;
  public review!: string;
  public rating!: number;
  public status!: string;

  public images?: ProductReviewImage[];

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ProductReview.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    userName: {
      type: DataTypes.STRING(191),
    },
    userEmail: {
      type: DataTypes.STRING(191),
    },
    review: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    sequelize,
    tableName: "product_reviews",
    timestamps: true,
    underscored: true,
  }
);

export default ProductReview;
