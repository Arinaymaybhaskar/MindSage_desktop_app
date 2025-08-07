import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new Pool({
  host: process.env.MINDSAGE_DB_URL || process.env.DATABASE_URL || "localhost",
  port: 5432,
  user: process.env.MINDSAGE_DB_USERNAME || "postgres",
  password: process.env.MINDSAGE_DB_PASSWORD || "password",
  database: process.env.MINDSAGE_DB_DATABASE || "mindsage",
  ssl: {
    rejectUnauthorized: false,
  },
});

export default pool;
