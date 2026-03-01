import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import Product from "./product.model";
import ProductCategory from "./productCategory.model";
import CategoryFaq from "./categoryFaq.model"; // Added import

export interface ICategoryAttributes {
  id: number;
  parentId?: number | null;
  type?: string | null;
  title: string;
  subTitle?: string | null;
  h1?: string | null;
  description: string;
  detailDescription?: string | null; // Added detail description field
  metaTitle?: string | null;
  metaDesc?: string | null;
  metaImage?: string | null;
  image?: string | null;
  image2?: string | null;
  video?: string | null; // Added video field
  status: string;
  isPublic?: boolean;
  isFeatured?: boolean;
  isProfession?: boolean; // Added isProfession field
  orderBy?: number | null;
  slug: string;
  corporateId?: number | null;
  createdAt?: Date;
  updatedAt?: Date | null;
}

export type ICategoryCreationAttributes = Optional<
  ICategoryAttributes,
  | "id"
  | "parentId"
  | "type"
  | "subTitle"
  | "h1"
  | "detailDescription" // Added detailDescription to optional fields
  | "metaTitle"
  | "metaDesc"
  | "metaImage"
  | "image"
  | "image2"
  | "video" // Added video to optional fields
  | "isPublic"
  | "isFeatured"
  | "isProfession" // Added isProfession to optional fields
  | "orderBy"
  | "corporateId"
  | "createdAt"
  | "updatedAt"
>;

class Category
  extends Model<ICategoryAttributes, ICategoryCreationAttributes>
  implements ICategoryAttributes
{
  public id!: number;
  public parentId!: number | null;
  public type!: string | null;
  public title!: string;
  public subTitle!: string | null;
  public h1!: string | null;
  public description!: string;
  public detailDescription!: string | null; // Added detailDescription property
  public metaTitle!: string | null;
  public metaDesc!: string | null;
  public metaImage!: string | null;
  public image!: string | null;
  public image2!: string | null;
  public video!: string | null; // Added video property
  public status!: string;
  public isPublic!: boolean;
  public isFeatured!: boolean;
  public isProfession!: boolean; // Added isProfession property
  public orderBy!: number | null;
  public slug!: string;
  public corporateId?: number | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date | null;
}

Category.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    parentId: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    type: { type: DataTypes.STRING(255), allowNull: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    subTitle: { type: DataTypes.STRING(255), allowNull: true },
    h1: { type: DataTypes.STRING(255), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: false },
    detailDescription: { type: DataTypes.TEXT, allowNull: true }, // Added detailDescription field definition
    metaTitle: { type: DataTypes.TEXT, allowNull: true },
    metaDesc: { type: DataTypes.TEXT, allowNull: true },
    metaImage: { type: DataTypes.STRING(255), allowNull: true },
    image: { type: DataTypes.STRING(191), allowNull: true },
    image2: { type: DataTypes.STRING(191), allowNull: true },
    video: { type: DataTypes.STRING(191), allowNull: true }, // Added video field definition
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "active",
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isProfession: {
      // Added isProfession field definition
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    orderBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
    },
    corporateId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },

    slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "category",
    sequelize,
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ["parent_id"] }],
    hooks: {
      // After saving, ensure orderBy is unique and sequential
      afterSave: async (category) => {
        // Get all categories ordered by current orderBy value, then by id for consistency
        const allCategories = await Category.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        // Renumber all categories sequentially
        for (let i = 0; i < allCategories.length; i++) {
          const item = allCategories[i];
          const newOrder = i + 1;
          if (item && item.orderBy !== newOrder) {
            item.orderBy = newOrder;
            await item.save({ fields: ["orderBy"], hooks: false });
          }
        }
      },
      // Also renumber after deletion
      afterDestroy: async () => {
        // Get all categories ordered by current orderBy value, then by id for consistency
        const allCategories = await Category.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        // Renumber all categories sequentially
        for (let i = 0; i < allCategories.length; i++) {
          const item = allCategories[i];
          const newOrder = i + 1;
          if (item && item.orderBy !== newOrder) {
            item.orderBy = newOrder;
            await item.save({ fields: ["orderBy"], hooks: false });
          }
        }
      },
    },
  }
);

export default Category;
