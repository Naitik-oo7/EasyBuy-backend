import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface ITestimonialAttributes {
  id: number;
  name: string;
  position: string;
  description?: string;
  type: "image" | "video";
  url: string;
  orderBy: number;
  status: "active" | "inactive";
  createdAt?: Date;
  updatedAt?: Date;
}

export type ITestimonialCreationAttributes = Optional<
  ITestimonialAttributes,
  "id" | "description" | "status" | "orderBy" | "createdAt" | "updatedAt"
>;

class Testimonial
  extends Model<ITestimonialAttributes, ITestimonialCreationAttributes>
  implements ITestimonialAttributes
{
  public id!: number;
  public name!: string;
  public position!: string;
  public description!: string;
  public type!: "image" | "video";
  public url!: string;
  public orderBy!: number;
  public status!: "active" | "inactive";
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Testimonial.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    position: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    type: {
      type: DataTypes.ENUM("image", "video"),
      allowNull: false,
    },
    url: { type: DataTypes.STRING(255), allowNull: false },
    orderBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1,
      },
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    sequelize,
    tableName: "testimonials",
    timestamps: true,
    underscored: true,
    hooks: {
      // After saving, ensure orderBy is unique and sequential
      afterSave: async (testimonial) => {
        // Get all testimonials ordered by current orderBy value, then by id for consistency
        const allTestimonials = await Testimonial.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        // Renumber all testimonials sequentially
        for (let i = 0; i < allTestimonials.length; i++) {
          const item = allTestimonials[i];
         const newOrder = i + 1;
if (item && item.orderBy !== newOrder) {
  item.orderBy = newOrder;
  await item.save({ fields: ["orderBy"], hooks: false });
}

        }
      },
      // Also renumber after deletion
      afterDestroy: async () => {
        // Get all testimonials ordered by current orderBy value, then by id for consistency
        const allTestimonials = await Testimonial.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        // Renumber all testimonials sequentially
        for (let i = 0; i < allTestimonials.length; i++) {
          const item = allTestimonials[i];
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

export default Testimonial;
