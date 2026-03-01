import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface IFaqAttributes {
  id: number;
  question: string;
  answer: string;
  orderBy?: number | null;
  status: "active" | "inactive";
  createdAt?: Date;
  updatedAt?: Date;
}

type IFaqCreationAttributes = Optional<
  IFaqAttributes,
  "id" | "orderBy" | "status" | "createdAt" | "updatedAt"
>;

class Faq
  extends Model<IFaqAttributes, IFaqCreationAttributes>
  implements IFaqAttributes
{
  public id!: number;
  public question!: string;
  public answer!: string;
  public orderBy!: number | null;
  public status!: "active" | "inactive";
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Faq.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    question: { type: DataTypes.STRING(500), allowNull: false },
    answer: { type: DataTypes.TEXT, allowNull: false },
    orderBy: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    tableName: "faqs",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default Faq;
