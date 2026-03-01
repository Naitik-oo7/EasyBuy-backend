import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IPageAttributes {
  id: number;
  title: string;
  slug?: string | null;
  description: string;
  image?: string | null;
  video?: string | null;
  metaTitle?: string | null;
  metaKeywords?: string | null;
  metaDescription?: string | null;
  metaSchema?: string | null;
  status: "active" | "inactive";
  createdAt?: Date;
  updatedAt?: Date;
}

export type IPageCreationAttributes = Optional<
  IPageAttributes,
  | "id"
  | "image"
  | "slug"
  | "video"
  | "metaTitle"
  | "metaKeywords"
  | "metaDescription"
  | "metaSchema"
>;

class Page
  extends Model<IPageAttributes, IPageCreationAttributes>
  implements IPageAttributes
{
  public id!: number;
  public title!: string;
  public slug!: string | null;
  public description!: string;
  public image!: string | null;
  public video!: string | null;
  public metaTitle!: string | null;
  public metaKeywords!: string | null;
  public metaDescription!: string | null;
  public metaSchema!: string | null;
  public status!: "active" | "inactive";
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Page.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    slug: { type: DataTypes.TEXT, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    image: { type: DataTypes.STRING(255), allowNull: true },
    video: { type: DataTypes.STRING(255), allowNull: true },
    metaTitle: { type: DataTypes.STRING(255), allowNull: true },
    metaKeywords: { type: DataTypes.TEXT, allowNull: true },
    metaDescription: { type: DataTypes.TEXT, allowNull: true },
    metaSchema: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    sequelize,
    tableName: "pages",
    timestamps: true,
    underscored: true,
  }
);

export default Page;
