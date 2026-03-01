import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IBlogAttributes {
  id: number;
  title: string;
  slug: string;
  subTitle?: string | null;
  description: string;
  shortDescription?: string | null;
  featuredImage?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKey?: string | null;
  status: "active" | "inactive";
  createdAt?: Date;
  updatedAt?: Date;
}

export type IBlogCreationAttributes = Optional<
  IBlogAttributes,
  | "id"
  | "subTitle"
  | "shortDescription"
  | "featuredImage"
  | "metaTitle"
  | "metaDescription"
  | "metaKey"
>;

class Blog
  extends Model<IBlogAttributes, IBlogCreationAttributes>
  implements IBlogAttributes
{
  public id!: number;
  public title!: string;
  public slug!: string;
  public subTitle!: string | null;
  public description!: string;
  public shortDescription!: string | null;
  public featuredImage!: string | null;
  public metaTitle!: string | null;
  public metaDescription!: string | null;
  public metaKey!: string | null;
  public status!: "active" | "inactive";
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Blog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    subTitle: { type: DataTypes.STRING(255), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: false },
    shortDescription: { type: DataTypes.TEXT, allowNull: true },
    featuredImage: { type: DataTypes.STRING(255), allowNull: true },
    metaTitle: { type: DataTypes.STRING(255), allowNull: true },
    metaDescription: { type: DataTypes.TEXT, allowNull: true },
    metaKey: { type: DataTypes.STRING(255), allowNull: true },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    sequelize,
    tableName: "blogs",
    timestamps: true,
    underscored: true,
  }
);

export default Blog;
