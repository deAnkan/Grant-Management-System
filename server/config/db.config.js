import mongoose from "mongoose";
import dns from "node:dns/promises";
import { config } from "../constants.js";

// Resolve DNS servers for MongoDB Atlas SRV lookups.
// - Production: only use DNS_SERVERS when explicitly set (respect the host's resolver).
// - Development: many local/ISP resolvers refuse SRV queries, which causes
//   `querySrv ECONNREFUSED`. Fall back to public resolvers so local dev works.
const configuredDnsServers = (config.dnsServers || "")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);

const dnsServersToUse =
  configuredDnsServers.length > 0
    ? configuredDnsServers
    : config.isProduction
      ? []
      : ["8.8.8.8", "8.8.4.4", "1.1.1.1"];

if (dnsServersToUse.length > 0) {
  dns.setServers(dnsServersToUse);
  console.log(`🌐 DNS resolvers applied: ${dnsServersToUse.join(", ")}`);
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

    if (/querySrv|ENOTFOUND|ECONNREFUSED/i.test(error.message)) {
      console.error(
        "💡 MongoDB Atlas SRV lookup failed. Verify the cluster hostname in " +
          "MONGODB_URI using the current connection string from the Atlas dashboard. " +
          "The cluster may have been deleted/paused, or your network may block SRV " +
          "queries (set DNS_SERVERS=8.8.8.8,1.1.1.1 if so).",
      );
    }

    process.exit(1);
  }
};

export default connectDB;