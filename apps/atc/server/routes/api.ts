import express, { Router } from 'express';
import { getAirplanes, getGlobeAirplanesLive } from '../controllers/airplanes.controller';

const router: Router = express.Router();

// Proxy endpoint for api.airplanes.live
router.get('/airplanes/:lat/:lon/:radius', getAirplanes);

// Fallback endpoint for globe.airplanes.live
router.get('/globe-airplanes-live/*', getGlobeAirplanesLive);

export default router;
