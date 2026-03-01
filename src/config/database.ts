import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const { DB_NAME, DB_USER, DB_PASS, DB_HOST, DB_PORT } = process.env;

if (!DB_NAME || !DB_USER || !DB_HOST) {
  throw new Error(
    "Missing required environment variables: DB_NAME, DB_USER, or DB_HOST"
  );
}

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  dialect: "postgres",
  port: Number(DB_PORT) || 5432,
  logging: false,
});

export default sequelize;
