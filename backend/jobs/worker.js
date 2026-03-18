require("dotenv").config();
const { Worker } = require("bullmq");
const Redis = require("ioredis");

const connection = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
});

const worker = new Worker(
  "saleQueue",
  async (job) => {
    console.log(`✅ Processing job: ${job.name}`);

    if (job.name === "startSale") {
      console.log("🟢 Starting Sale:", job.data);
    }

    if (job.name === "endSale") {
      console.log("🔴 Ending Sale:", job.data);
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

console.log("✅ Worker running and waiting for jobs...");
