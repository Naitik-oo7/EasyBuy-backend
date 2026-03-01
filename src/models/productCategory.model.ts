import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import Product from "./product.model";
import Category from "./category.model";

export interface IProductCategoryAttributes {
  id: number;
  productId?: number | null;
  categoryId?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IProductCategoryCreationAttributes = Optional<
  IProductCategoryAttributes,
  "id" | "productId" | "categoryId" | "createdAt" | "updatedAt"
>;

class ProductCategory
  extends Model<IProductCategoryAttributes, IProductCategoryCreationAttributes>
  implements IProductCategoryAttributes
{
  public id!: number;
  public productId!: number | null;
  public categoryId!: number | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ProductCategory.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: Product, key: "id" },
      onDelete: "CASCADE",
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: Category, key: "id" },
      onDelete: "CASCADE",
    },
  },
  {
    tableName: "product_category",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default ProductCategory;
