import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IProductRelatedAttributes {
  id: number;
  productId: number;
  relatedProductId: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IProductRelatedCreation = Optional<IProductRelatedAttributes, "id">;

class ProductRelated
  extends Model<IProductRelatedAttributes, IProductRelatedCreation>
  implements IProductRelatedAttributes
{
  public id!: number;
  public productId!: number;
  public relatedProductId!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ProductRelated.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "product_id",
    },
    relatedProductId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "related_product_id",
    },
  },
  {
    sequelize,
    tableName: "product_related",
    timestamps: true,
    underscored: true, 
    indexes: [
      { unique: true, fields: ["product_id", "related_product_id"] },
    ],
  }
);

export default ProductRelated;
