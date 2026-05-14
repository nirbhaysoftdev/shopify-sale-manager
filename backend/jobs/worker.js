require("dotenv").config();
const { Worker } = require("bullmq");
const Redis = require("ioredis");
const { startSale, endSale } = require("../controllers/campaignController");

const connection = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
});

const worker = new Worker(
  "saleQueue",
  async (job) => {
    console.log(`✅ Processing job: ${job.name}`, job.data);

    if (job.name === "startSale") {
      const { campaignId, shop } = job.data;
      await startSale(campaignId, shop);
    }

    if (job.name === "endSale") {
      const { campaignId, shop } = job.data;
      await endSale(campaignId, shop);
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} (${job.name}) completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} (${job.name}) failed:`, err.message);
});

console.log("✅ Worker running and waiting for jobs...");
