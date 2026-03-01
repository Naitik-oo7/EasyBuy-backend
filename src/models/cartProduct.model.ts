// models/cartProduct.model.ts
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface ICartProductAttributes {
  id: number;
  cartId: number;
  productId: number;
  price: number;
  discount?: number | null;
  quantity?: number;
  weight?: number | null;
  discountPercentage?: number | null;
  embroidery: boolean;
  embroideryLogo?: string | null;
  embroideryPosition?: string | null;
  embroideryPrice?: number | null;
  productName?: string | null;
  sku?: string | null;
  hsn?: string | null;
  majorFabric?: string | null;
  minorFabric?: string | null;
  pattenNumber?: string | null;
  otherComments?: string | null;
  productImage?: string | null;
  sizes?: Record<string, number>;
  createdAt?: Date;
  updatedAt?: Date;
}

// ✅ Define CreationAttributes type
export type ICartProductCreationAttributes = Optional<
  ICartProductAttributes,
  | "id"
  | "discount"
  | "quantity"
  | "weight"
  | "discountPercentage"
  | "embroidery"
  | "embroideryLogo"
  | "embroideryPosition"
  | "embroideryPrice"
  | "productName"
  | "sku"
  | "hsn"
  | "majorFabric"
  | "minorFabric"
  | "pattenNumber"
  | "otherComments"
  | "productImage"
  | "sizes"
>;

class CartProduct
  extends Model<
    ICartProductAttributes & { sizes?: Record<string, number> },
    ICartProductCreationAttributes
  >
  implements ICartProductAttributes
{
  public id!: number;
  public cartId!: number;
  public productId!: number;
  public price!: number;
  public discount!: number | null;
  public weight!: number | null;
  public discountPercentage!: number | null;
  public quantity!: number;
  public embroidery!: boolean;
  public embroideryLogo!: string | null;
  public embroideryPosition!: string | null;
  public embroideryPrice!: number | null;
  public productName!: string | null;
  public sku!: string | null;
  public hsn!: string | null;
  public majorFabric!: string | null;
  public minorFabric!: string | null;
  public pattenNumber!: string | null;
  public otherComments!: string | null;
  public productImage!: string | null;
  public sizes!: Record<string, number>; // ✅ NEW field
  public createdAt!: Date;
  public updatedAt!: Date;
}

CartProduct.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    cartId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    price: { type: DataTypes.INTEGER, allowNull: false },
    discount: { type: DataTypes.INTEGER, allowNull: true },
    quantity: { type: DataTypes.INTEGER, allowNull: true },
    weight: { type: DataTypes.FLOAT, allowNull: true },
    discountPercentage: { type: DataTypes.INTEGER, allowNull: true },
    embroidery: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    embroideryLogo: { type: DataTypes.STRING(255), allowNull: true },
    embroideryPosition: { type: DataTypes.STRING(255), allowNull: true },
    embroideryPrice: { type: DataTypes.INTEGER, allowNull: true },
    productName: { type: DataTypes.STRING(255), allowNull: true },
    sku: { type: DataTypes.STRING(255), allowNull: true },
    hsn: { type: DataTypes.STRING(55), allowNull: true },
    majorFabric: { type: DataTypes.STRING(255), allowNull: true },
    minorFabric: { type: DataTypes.STRING(255), allowNull: true },
    pattenNumber: { type: DataTypes.STRING(255), allowNull: true },
    otherComments: { type: DataTypes.TEXT, allowNull: true },
    productImage: { type: DataTypes.STRING(255), allowNull: true },
    sizes: { type: DataTypes.JSON, allowNull: false, defaultValue: {} }, // ✅ NEW
  },
  {
    tableName: "cart_product",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default CartProduct;
