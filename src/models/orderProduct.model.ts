import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import Product from "./product.model";

export interface IOrderProductAttributes {
  id: number;
  order_id: number;
  productId: number;

  product_name: string;
  sku?: string | null;
  hsn?: string | null;

  quantity: number;
  weight?: number | null;

  price: number; // unit price

  majorFabric?: string | null;
  minorFabric?: string | null;
  pattenNumber?: string | null;

  embroidery: boolean;
  embroideryLogo?: string | null;
  embroideryPosition?: string | null;
  embroideryPrice?: number | null;

  sizes?: Record<string, number>; // same as cart
  productImage?: string | null;

  lineTotal: number; // locked total for this line
}

export type IOrderProductCreationAttributes = Optional<
  IOrderProductAttributes,
  | "id"
  | "sku"
  | "hsn"
  | "weight"
  | "majorFabric"
  | "minorFabric"
  | "pattenNumber"
  | "embroideryLogo"
  | "embroideryPosition"
  | "embroideryPrice"
  | "sizes"
  | "productImage"
>;

class OrderProduct
  extends Model<IOrderProductAttributes, IOrderProductCreationAttributes>
  implements IOrderProductAttributes
{
  public id!: number;
  public order_id!: number;
  public productId!: number;

  public product_name!: string;
  public sku!: string | null;
  public hsn!: string | null;

  public quantity!: number;
  public weight!: number | null;

  public price!: number;

  public majorFabric!: string | null;
  public minorFabric!: string | null;
  public pattenNumber!: string | null;
  public embroidery!: boolean;
  public embroideryLogo!: string | null;
  public embroideryPosition!: string | null;
  public embroideryPrice!: number | null;

  public sizes!: Record<string, number>;
  public productImage!: string | null;

  public lineTotal!: number;

  public product?: Product;
}

OrderProduct.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    order_id: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },

    product_name: { type: DataTypes.STRING(255), allowNull: false },
    sku: { type: DataTypes.STRING(255), allowNull: true },
    hsn: { type: DataTypes.STRING(55), allowNull: true },

    quantity: { type: DataTypes.INTEGER, allowNull: false },
    weight: { type: DataTypes.FLOAT, allowNull: true },

    price: { type: DataTypes.FLOAT, allowNull: false },

    majorFabric: { type: DataTypes.STRING(255), allowNull: true },
    minorFabric: { type: DataTypes.STRING(255), allowNull: true },
    pattenNumber: { type: DataTypes.STRING(255), allowNull: true },

    embroidery: { type: DataTypes.BOOLEAN, defaultValue: false },
    embroideryLogo: { type: DataTypes.STRING(255), allowNull: true },
    embroideryPosition: { type: DataTypes.STRING(255), allowNull: true },
    embroideryPrice: { type: DataTypes.FLOAT, allowNull: true },

    sizes: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    productImage: { type: DataTypes.STRING(255), allowNull: true },

    lineTotal: { type: DataTypes.FLOAT, allowNull: false },
  },
  {
    sequelize,
    tableName: "order_products",
    timestamps: false, // products don’t need createdAt/updatedAt
    underscored: true,
  }
);

export default OrderProduct;
