import express from "express";
import type { Router } from "express";
import { getAirplanes, getGlobeAirplanesLive } from "../controllers/airplanes.controller.ts";

const router: Router = express.Router();

// Proxy endpoint for api.airplanes.live
router.get("/airplanes/:lat/:lon/:radius", getAirplanes);

// Fallback endpoint for globe.airplanes.live.
// Express 5 (path-to-regexp v8) requires a *named* wildcard; the matched
// segments arrive as req.params.splat (an array).
router.get("/globe-airplanes-live/*splat", getGlobeAirplanesLive);

export default router;
