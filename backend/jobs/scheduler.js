const { Queue } = require("bullmq");
const Redis = require("ioredis");

const connection = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
});

const saleQueue = new Queue("saleQueue", { connection });

async function scheduleSaleStart(data, delay) {
  await saleQueue.add("startSale", data, {
    delay,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 }
  });
}

async function scheduleSaleEnd(data, delay) {
  await saleQueue.add("endSale", data, {
    delay,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 }
  });
}

module.exports = { scheduleSaleStart, scheduleSaleEnd };
