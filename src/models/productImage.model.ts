import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database"; // your Sequelize instance
import Product from "./product.model"; // link to Product model

export interface IProductImageAttributes {
  id: number;
  productId: number;
  image: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IProductImageCreationAttributes = Optional<
  IProductImageAttributes,
  "id" | "createdAt" | "updatedAt"
>;

class ProductImage
  extends Model<IProductImageAttributes, IProductImageCreationAttributes>
  implements IProductImageAttributes
{
  public id!: number;
  public productId!: number;
  public image!: string;
  public status!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ProductImage.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Product, key: "id" },
      field: "product_id",
      onDelete: "CASCADE",
    },
    image: { type: DataTypes.STRING(255), allowNull: false },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    tableName: "product_image",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default ProductImage;
