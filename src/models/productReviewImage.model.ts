import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import ProductReview from "./productReview.model";

interface IProductReviewImage {
  id: number;
  reviewId: number;
  image: string;
}

type IProductReviewImageCreation = Optional<IProductReviewImage, "id">;

class ProductReviewImage
  extends Model<IProductReviewImage, IProductReviewImageCreation>
  implements IProductReviewImage
{
  public id!: number;
  public reviewId!: number;
  public image!: string;
}

ProductReviewImage.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    reviewId: { type: DataTypes.INTEGER, allowNull: false },
    image: { type: DataTypes.STRING(255), allowNull: false },
  },
  {
    sequelize,
    tableName: "product_review_images",
    timestamps: true,
    underscored: true,
  }
);

export default ProductReviewImage;
