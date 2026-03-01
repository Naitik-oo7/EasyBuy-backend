import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database"; // your Sequelize instance
import Category from "./category.model";
import ProductCategory from "./productCategory.model";
import User from "./user.model";

export interface IProductAttributes {
  id: number;
  title: string;
  slug?: string | null;
  featuredImage?: string | null;
  video?: string | null;
    videoThumbnail?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  price?: number | null;
  featuredProduct?: boolean;
  bestSeller?: boolean;
  sale?: boolean;
  gender: string;
  length?: string | null;
  breadth?: string | null;
  height?: string | null;
  weight?: string | null;
  stockQuantity?: number;
  minQuantity?: number;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKey?: string | null;
  metaSchema?: string | null;
  sku?: string | null;
  hsn?: string | null;
  majorFabric?: string | null;
  minorFabric?: string | null;
  pattenNumber?: string | null;
  otherComments?: string | null;
  corporate?: boolean;
  corporateId?: number | null;
  sizes?: number[];
  orderBy?: number | null;
  outOfStock?: boolean;
allowEmbroidery?: boolean;


  status?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IProductCreationAttributes = Optional<
  IProductAttributes,
  | "id"
  | "slug"
  | "featuredImage"
  | "video"
  | "videoThumbnail"
  | "description"
  | "shortDescription"
  | "price"
  | "featuredProduct"
  | "bestSeller"
  | "sale"
  | "length"
  | "breadth"
  | "height"
  | "weight"
  | "stockQuantity"
  | "minQuantity"
  | "metaTitle"
  | "metaDescription"
  | "metaKey"
  | "metaSchema"
  | "sku"
  | "hsn"
  | "majorFabric"
  | "minorFabric"
  | "pattenNumber"
  | "otherComments"
  | "corporate"
  | "corporateId"
  | "sizes"
  | "status"
  | "allowEmbroidery"
  | "createdAt"
  | "updatedAt"
>;

class Product
  extends Model<IProductAttributes, IProductCreationAttributes>
  implements IProductAttributes
{
  public id!: number;
  public title!: string;
  public slug!: string | null;
  public featuredImage!: string | null;
  public video!: string | null;
  public videoThumbnail!: string | null;
  public description!: string | null;
  public shortDescription!: string | null;
  public price!: number | null;
  public featuredProduct!: boolean;
  public bestSeller!: boolean;
  public sale!: boolean;
  public gender!: string;
  public length!: string | null;
  public breadth!: string | null;
  public height!: string | null;
  public weight!: string | null;
  public stockQuantity!: number;
  public minQuantity!: number;
  public metaTitle!: string | null;
  public metaDescription!: string | null;
  public metaKey!: string | null;
  public metaSchema!: string | null;
  public sku!: string | null;
  public hsn!: string | null;
  public majorFabric!: string | null;
  public minorFabric!: string | null;
  public pattenNumber!: string | null;
  public otherComments!: string | null;
  public corporate!: boolean;
  public corporateId!: number | null;
  public status!: string | null;
  public sizes!: number[];
  public orderBy!: number | null;
  public allowEmbroidery!: boolean;
  public outOfStock!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Product.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    title: { type: DataTypes.STRING(255), allowNull: false },
    slug: { type: DataTypes.STRING(255), allowNull: true },
    featuredImage: { type: DataTypes.STRING(255), allowNull: true },
    video: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    videoThumbnail: {  // ✅ NEW FIELD
  type: DataTypes.STRING(255),
  allowNull: true,
},
    description: { type: DataTypes.TEXT, allowNull: true },
    shortDescription: { type: DataTypes.TEXT, allowNull: true },
    price: { type: DataTypes.INTEGER, allowNull: true },
    featuredProduct: { type: DataTypes.BOOLEAN, allowNull: true },
    bestSeller: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    sale: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    gender: { type: DataTypes.STRING(15), allowNull: false },
    length: { type: DataTypes.STRING(155), allowNull: true },
    breadth: { type: DataTypes.STRING(155), allowNull: true },
    height: { type: DataTypes.STRING(155), allowNull: true },
    weight: { type: DataTypes.STRING(155), allowNull: true },
    stockQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    orderBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    outOfStock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    minQuantity: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
    metaTitle: { type: DataTypes.STRING(255), allowNull: true },
    metaDescription: { type: DataTypes.STRING(255), allowNull: true },
    metaKey: { type: DataTypes.TEXT, allowNull: true },
    metaSchema: { type: DataTypes.TEXT, allowNull: true },
    sku: { type: DataTypes.STRING(50), allowNull: true },
    hsn: { type: DataTypes.STRING(55), allowNull: true },
    majorFabric: { type: DataTypes.STRING(255), allowNull: true },
    minorFabric: { type: DataTypes.STRING(255), allowNull: true },
    pattenNumber: { type: DataTypes.STRING(255), allowNull: true },
    otherComments: { type: DataTypes.TEXT, allowNull: true },
    corporate: {
      // 👈 NEW FIELD
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    corporateId: {
      type: DataTypes.INTEGER,
      allowNull: true, // null if not owned by a corporate
      references: {
        model: User, // name of your User table
        key: "id",
      },
    },
    sizes: {
      type: DataTypes.JSON, // stores array of IDs
      allowNull: true, // can be null if product has no size restriction
      defaultValue: [], // default empty array
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "active",
    },
    allowEmbroidery: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: true, 
},

  },
  {
    tableName: "product",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default Product;
