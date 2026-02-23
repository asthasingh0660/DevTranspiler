import express from "express";
import Queue from "bull";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

const conversionQueue = new Queue("conversions", REDIS_URL);

app.post("/enqueue", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload?.id) {
      return res.status(400).json({ error: "Missing job id" });
    }

    await conversionQueue.add(payload);

    return res.json({ status: "enqueued" });
  } catch (err) {
    console.error("Producer enqueue error:", err);
    res.status(500).json({ error: "enqueue failed" });
  }
});

app.listen(3001, () =>
  console.log("🚀 Producer running on port 3001")
);