import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IInquiryAttributes {
  id: number;
  name: string;
  companyName: string;
  type: string;
  mobile: string;
  category: string;
  noOfUniform: number;
  description: string;
  sourcePage: string;
  productId?: number;
  status: string;
  image?: string | null;
  isReselling?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IInquiryCreation = Optional<
  IInquiryAttributes,
  "id" | "status" | "sourcePage" | "productId" | "image" | "type"
>;

class Inquiry
  extends Model<IInquiryAttributes, IInquiryCreation>
  implements IInquiryAttributes
{
  public id!: number;
  public name!: string;
  public companyName!: string;
  public type!: string;
  public mobile!: string;
  public category!: string;
  public noOfUniform!: number;
  public description!: string;
  public status!: string;
  public sourcePage!: string;
  public productId?: number;
  public image?: string | null;
  public isReselling!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Inquiry.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    companyName: { type: DataTypes.STRING(255), allowNull: false },
    image: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "requestACall",
    },

    mobile: { type: DataTypes.STRING(20), allowNull: false },
    category: { type: DataTypes.STRING(100), allowNull: false },
    noOfUniform: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "pending",
    },
    sourcePage: { type: DataTypes.STRING(255), allowNull: true },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "product", // 👈 table name of Product
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    isReselling: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: "inquiries",
    timestamps: true,
    underscored: true,
  }
);

export default Inquiry;
