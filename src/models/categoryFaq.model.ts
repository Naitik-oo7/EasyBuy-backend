import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface ICategoryFaqAttributes {
  id: number;
  categoryId: number;
  question: string;
  answer: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ICategoryFaqCreationAttributes = Optional<
  ICategoryFaqAttributes,
  "id"
>;

class CategoryFaq
  extends Model<ICategoryFaqAttributes, ICategoryFaqCreationAttributes>
  implements ICategoryFaqAttributes
{
  public id!: number;
  public categoryId!: number;
  public question!: string;
  public answer!: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

CategoryFaq.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "category",
        key: "id",
      },
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
    tableName: "category_faq",
    timestamps: true,
    underscored: true,
  }
);

export default CategoryFaq;
