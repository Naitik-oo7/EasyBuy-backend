import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IBlogCommentAttributes {
  id: number;
  blogId: number;
  userId?: number | null; // optional for anonymous comments
  name?: string | null; // required if anonymous
  email?: string | null; // required if anonymous
  comment: string;
  rating?: number | null;
  website?: string | null;
  status: string; // moderation
  createdAt?: Date;
  updatedAt?: Date;
}

export type IBlogCommentCreationAttributes = Optional<
  IBlogCommentAttributes,
  "id" | "userId" | "name" | "email" | "status" | "rating"
>;

class BlogComment
  extends Model<IBlogCommentAttributes, IBlogCommentCreationAttributes>
  implements IBlogCommentAttributes
{
  public id!: number;
  public blogId!: number;
  public userId!: number | null;
  public name!: string | null;
  public email!: string | null;
  public comment!: string;
  public rating!: number | null;
  public website!: string | null;
  public status!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

BlogComment.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    blogId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING(255), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    comment: { type: DataTypes.TEXT, allowNull: false },
    rating: { type: DataTypes.INTEGER, allowNull: true },
    website: { type: DataTypes.STRING(255), allowNull: true },
    status: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "pending",
    },
  },
  {
    sequelize,
    tableName: "blog_comments",
    timestamps: true,
    underscored: true,
  }
);

export default BlogComment;
