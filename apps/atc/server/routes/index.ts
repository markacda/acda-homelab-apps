import express from "express";
import type { Request, Response, Router } from "express";
import path from "path";

const router: Router = express.Router();

// Serve index.html for root path
router.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(import.meta.dirname, "..", "..", "src", "index.html"));
});

// Health check endpoint
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptimeSeconds: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
