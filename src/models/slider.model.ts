// models/slider.model.ts
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface SliderAttributes {
  id: number;
  title: string;
  description?: string | null;
  type: "image" | "video";
  url: string;
  metaUrl?: string | null;
  redirectUrl?: string | null;
  orderBy: number;

  status: "active" | "inactive";
  created_at?: Date;
  updated_at?: Date;
}

type SliderCreationAttributes = Optional<
  SliderAttributes,
  "id" | "status" | "description" | "metaUrl" | "redirectUrl" | "orderBy"
>;

class Slider
  extends Model<SliderAttributes, SliderCreationAttributes>
  implements SliderAttributes
{
  public id!: number;
  public title!: string;
  public description!: string | null;
  public type!: "image" | "video";
  public url!: string;
  public metaUrl!: string | null;
  public redirectUrl!: string | null;
  public status!: "active" | "inactive";
  public orderBy!: number;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Slider.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    type: { type: DataTypes.ENUM("image", "video"), allowNull: false },
    url: { type: DataTypes.STRING, allowNull: false },
    metaUrl: { type: DataTypes.STRING, allowNull: true },
    redirectUrl: { type: DataTypes.STRING, allowNull: true },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active",
    },
    orderBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 0 },
    },

    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "Slider",
    tableName: "sliders",
    underscored: true,
    hooks: {
      // After create/update
      afterSave: async (slider) => {
        const allSliders = await Slider.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        for (let i = 0; i < allSliders.length; i++) {
          const item = allSliders[i];
          const newOrder = i + 1;
          if (item && item.orderBy !== newOrder) {
            item.orderBy = newOrder;
            await item.save({ fields: ["orderBy"], hooks: false });
          }
        }
      },

      // After delete
      afterDestroy: async () => {
        const allSliders = await Slider.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        for (let i = 0; i < allSliders.length; i++) {
          const item = allSliders[i];
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

export default Slider;
