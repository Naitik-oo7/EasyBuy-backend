import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

export interface IRoleBasePermission {
  id?: number;
  role: string;
  permissions: string[]; // Stored as an array of strings
  createdAt?: Date;
  updatedAt?: Date;
}

class RoleBasePermission
  extends Model<IRoleBasePermission>
  implements IRoleBasePermission
{
  public id!: number;
  public role!: string;
  public permissions!: string[];
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

RoleBasePermission.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    permissions: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "RoleBasePermission",
    tableName: "role_base_permissions",
    timestamps: true, // createdAt and updatedAt are automatically managed
    underscored: true, // optional: converts camelCase fields to snake_case in DB
  }
);

export default RoleBasePermission;
