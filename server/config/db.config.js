import mongoose from "mongoose";
import { config } from "../constants.js";

// ✅ Apply DNS fix only in development
if (process.env.NODE_ENV === "development") {
  const dns = await import("node:dns/promises");
  dns.default.setServers(["1.1.1.1", "8.8.8.8"]);
  console.log("🌐 Custom DNS applied (development mode)");
}

const connectDB = async () => {
  try {
    if (!config.uri) {
      throw new Error("Database URI is missing in config.");
    }

    await mongoose.connect(config.uri);

    console.log("✅ MongoDB connection SUCCESS");
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;