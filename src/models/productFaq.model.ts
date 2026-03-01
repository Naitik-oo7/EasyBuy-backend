import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IProductFaqAttributes {
  id: number;
  productId: number;
  question: string;
  answer: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IProductFaqCreationAttributes = Optional<
  IProductFaqAttributes,
  "id"
>;

class ProductFaq
  extends Model<IProductFaqAttributes, IProductFaqCreationAttributes>
  implements IProductFaqAttributes
{
  public id!: number;
  public productId!: number;
  public question!: string;
  public answer!: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ProductFaq.init(
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
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "product_faq",
    timestamps: true,
    underscored: true,
  }
);

export default ProductFaq;
