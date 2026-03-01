import dotenv from "dotenv";
import app from "./app";

dotenv.config({ quiet: true });

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
