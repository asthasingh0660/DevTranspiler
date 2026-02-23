/**
 * worker/index.js
 * Bull worker that supports manually enqueued Bull jobs from Python.
 */

import Queue from "bull";
import Groq from "groq-sdk";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// ───────────────── CONFIG ─────────────────

const REDIS_URL = process.env.REDIS_URL ?? "redis://redis:6379";
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";

const LLM_MODEL = process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS ?? "4096", 10);
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? "3", 10);

// ───────────────── CLIENTS ─────────────────

const groq = new Groq({ apiKey: GROQ_API_KEY });
const statusClient = new Redis(REDIS_URL);

const conversionQueue = new Queue("conversions", REDIS_URL);

// ───────────────── HELPERS ─────────────────

const JOB_HASH_PREFIX = "bull:job:";
const JOB_TTL = 60 * 60 * 24;

async function writeStatus(jobId, fields) {
  const key = `${JOB_HASH_PREFIX}${jobId}`;
  await statusClient.hset(key, fields);
  await statusClient.expire(key, JOB_TTL);
}

function buildPrompt(sourceLang, targetLang, inputCode) {
  return `You are a precise code translator. Convert ${sourceLang} → ${targetLang}.

Return ONLY code in a single fenced block.

Source:
\`\`\`${String(sourceLang).toLowerCase()}
${inputCode}
\`\`\`

Converted:
\`\`\`${String(targetLang).toLowerCase()}`;
}

// ───────────────── WORKER ─────────────────

conversionQueue.process(CONCURRENCY, async (job) => {
  try {
    console.log("──────────────── JOB RECEIVED ────────────────");
    console.log("[worker] FULL JOB →", JSON.stringify(job));

    const {
      id: jobId,
      source_lang,
      target_lang,
      input_code,
    } = job.data;

    // 🛑 validation
    if (!jobId || !source_lang || !target_lang || !input_code) {
      throw new Error("Invalid job payload");
    }

    console.log(
      `[worker] Processing ${jobId} (${source_lang} → ${target_lang})`
    );

    await writeStatus(jobId, { status: "processing" });

    const start = Date.now();

    const prompt = buildPrompt(
      source_lang,
      target_lang,
      input_code
    );

    const completion = await groq.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: LLM_MAX_TOKENS,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    });

    const outputCode =
      completion.choices?.[0]?.message?.content?.trim() ?? "";

    if (!outputCode) {
      throw new Error("Empty LLM response");
    }

    const duration_ms = Date.now() - start;

    await writeStatus(jobId, {
      status: "done",
      output_code: outputCode,
      duration_ms: String(duration_ms),
      completed_at: new Date().toISOString(),
    });

    console.log(`[worker] DONE ${jobId} in ${duration_ms}ms`);

    return true;
  } catch (err) {
    console.error("[worker] CRASH →", err.message);

    const fallbackId = job?.data?.id || job?.id;

    if (fallbackId) {
      await writeStatus(fallbackId, {
        status: "failed",
        error: err.message,
        completed_at: new Date().toISOString(),
      });
    }

    throw err;
  }
});

// ───────────────── EVENTS ─────────────────

conversionQueue.on("completed", (job) =>
  console.log(`[bull] Job ${job.id} completed`)
);

conversionQueue.on("failed", (job, err) =>
  console.error(
    `[bull] Job ${job.id} failed (attempt ${job.attemptsMade}) → ${err.message}`
  )
);

conversionQueue.on("stalled", (job) =>
  console.warn(`[bull] Job ${job.id} stalled`)
);

conversionQueue.on("error", (err) =>
  console.error("[bull] Queue error →", err)
);

console.log(
  `[worker] Listening on queue "conversions" (concurrency: ${CONCURRENCY})`
);