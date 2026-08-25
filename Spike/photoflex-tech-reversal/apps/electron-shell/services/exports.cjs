const { randomUUID } = require("node:crypto");
const { access, mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { Worker } = require("node:worker_threads");

function eventFor(job, state = job.state) {
  return {
    jobId: job.jobId,
    state,
    completed: job.completed,
    total: job.request.pageIds.length,
    errors: job.error ? [{ code: "PDF_WORKER_FAILED", message: job.error, recoverable: true }] : [],
    emittedAt: new Date().toISOString(),
    workerStopped: job.workerStopped
  };
}

function createExportService(appDataPath) {
  const outputRoot = join(appDataPath ?? process.cwd(), "benchmark-exports");
  const jobs = new Map();

  async function startPdf(request) {
    if (!request || !Array.isArray(request.pageIds) || request.pageIds.length < 1 || request.pageIds.length > 200) {
      throw new Error("PDF request must contain between 1 and 200 page IDs");
    }
    const jobId = randomUUID();
    await mkdir(outputRoot, { recursive: true });
    const temporaryPath = join(outputRoot, `.${jobId}.pdf.tmp`);
    const destinationPath = join(outputRoot, `${jobId}.pdf`);
    let resolveWorkerStop;
    const workerStop = new Promise((resolve) => { resolveWorkerStop = resolve; });
    const job = { jobId, request: { ...request, pageIds: [...request.pageIds] }, state: "queued", completed: 0, error: null, worker: null, workerStopped: false, workerStop, resolveWorkerStop, temporaryPath, destinationPath, waiters: [] };
    jobs.set(jobId, job);
    const worker = new Worker(join(__dirname, "pdf-worker.cjs"), { workerData: { pageIds: job.request.pageIds, temporaryPath, destinationPath } });
    job.worker = worker;
    job.state = "running";
    worker.on("message", (message) => {
      if (message.type === "progress") job.completed = message.completed;
      if (message.type === "succeeded" || message.type === "cancelled" || message.type === "failed") {
        job.completed = message.completed ?? job.completed;
        job.state = message.type;
        job.error = message.message ?? null;
        job.worker = null;
        for (const resolve of job.waiters.splice(0)) resolve(eventFor(job));
      }
    });
    worker.on("error", (error) => {
      job.state = "failed";
      job.error = error.message;
      job.worker = null;
      for (const resolve of job.waiters.splice(0)) resolve(eventFor(job));
    });
    worker.on("exit", (code) => {
      job.worker = null;
      job.workerStopped = true;
      job.resolveWorkerStop({ code, stoppedAt: new Date().toISOString() });
    });
    return { jobId };
  }

  return {
    startPdf,

    async status({ jobId }) {
      const job = jobs.get(jobId);
      if (!job) throw new Error("Unknown export job");
      return eventFor(job);
    },

    async cancel({ jobId }) {
      const job = jobs.get(jobId);
      if (!job) throw new Error("Unknown export job");
      if (job.state === "queued" || job.state === "running") {
        job.state = "cancelled";
        job.worker.postMessage({ type: "cancel" });
      }
      return eventFor(job, "cancelled");
    },

    async retry({ jobId }) {
      const job = jobs.get(jobId);
      if (!job) throw new Error("Unknown export job");
      if (job.state !== "cancelled" && job.state !== "failed") throw new Error("Only cancelled or failed jobs can be retried");
      return startPdf(job.request);
    },

    async waitForTerminal(jobId, timeoutMs = 5000) {
      const job = jobs.get(jobId);
      if (!job) throw new Error("Unknown export job");
      if (["succeeded", "cancelled", "failed"].includes(job.state) && !job.worker) return eventFor(job);
      return Promise.race([
        new Promise((resolve) => job.waiters.push(resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("PDF job timed out")), timeoutMs))
      ]);
    },

    async waitForWorkerStop(jobId, timeoutMs = 2000) {
      const job = jobs.get(jobId);
      if (!job) throw new Error("Unknown export job");
      return Promise.race([
        job.workerStop,
        new Promise((_, reject) => setTimeout(() => reject(new Error("PDF worker did not stop")), timeoutMs))
      ]);
    },

    async outputFileForTest(jobId) {
      const job = jobs.get(jobId);
      if (!job) throw new Error("Unknown export job");
      await access(job.destinationPath);
      return job.destinationPath;
    },

    temporaryFileForTest(jobId) {
      const job = jobs.get(jobId);
      if (!job) throw new Error("Unknown export job");
      return job.temporaryPath;
    }
  };
}

module.exports = { createExportService };
