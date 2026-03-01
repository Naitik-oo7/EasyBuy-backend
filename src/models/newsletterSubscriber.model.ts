import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface INewsletterSubscriberAttributes {
  id: number;
  email: string;
  name?: string | null;
  status?: string; // 'active' or 'unsubscribed'
  createdAt?: Date;
  updatedAt?: Date;
}

export type INewsletterSubscriberCreationAttributes = Optional<
  INewsletterSubscriberAttributes,
  "id" | "name" | "status" | "createdAt" | "updatedAt"
>;

class NewsletterSubscriber
  extends Model<
    INewsletterSubscriberAttributes,
    INewsletterSubscriberCreationAttributes
  >
  implements INewsletterSubscriberAttributes
{
  public id!: number;
  public email!: string;
  public name!: string | null;
  public status!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

NewsletterSubscriber.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("active", "unsubscribed"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    tableName: "newsletter_subscribers",
    sequelize,
    timestamps: true,
    underscored: true,
  }
);

export default NewsletterSubscriber;
