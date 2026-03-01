import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface IOptionAttributes {
  id: number;
  name: string; // e.g., 'Small', 'Red', 'XL'
  optionType: string; // e.g., 'size', 'color'
  status: string;
  orderBy: number;
  createdAt?: Date;
  updatedAt?: Date | null;
}

export type IOptionCreationAttributes = Optional<
  IOptionAttributes,
  "id" | "orderBy" | "createdAt" | "updatedAt"
>;

class Option
  extends Model<IOptionAttributes, IOptionCreationAttributes>
  implements IOptionAttributes
{
  public id!: number;
  public name!: string;
  public optionType!: string;
  public status!: string;
  public orderBy!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date | null;
}

Option.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(255), allowNull: false },
    optionType: { type: DataTypes.STRING(255), allowNull: false },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "active",
    },
    orderBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
      validate: {
        min: 1,
      },
    },
  },
  {
    tableName: "options",
    sequelize,
    timestamps: true,
    underscored: true,
    hooks: {
      // After saving, ensure orderBy is unique and sequential starting from 1
      afterSave: async (option) => {
        // Get all options ordered by current orderBy value, then by id for consistency
        const allOptions = await Option.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        // Renumber all options sequentially starting from 1
        for (let i = 0; i < allOptions.length; i++) {
          const item = allOptions[i];
          // Start from 1, not 0
          if (item && item.orderBy !== i + 1) {
            item.orderBy = i + 1;
            await item.save({ fields: ["orderBy"], hooks: false });
          }
        }
      },
      // Also renumber after deletion
      afterDestroy: async (option) => {
        // Get all options ordered by current orderBy value, then by id for consistency
        const allOptions = await Option.findAll({
          order: [
            ["orderBy", "ASC"],
            ["id", "ASC"],
          ],
        });

        // Renumber all options sequentially starting from 1
        for (let i = 0; i < allOptions.length; i++) {
          const item = allOptions[i];
          // Start from 1, not 0
          if (item && item.orderBy !== i + 1) {
            item.orderBy = i + 1;
            await item.save({ fields: ["orderBy"], hooks: false });
          }
        }
      },
    },
  }
);

export default Option;
