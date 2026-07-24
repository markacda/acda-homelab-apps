import express from 'express';
import type { Express } from 'express';
import { join } from 'node:path';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import compression from 'compression';
import { HttpAirplanesSource } from '../../Adapters/AirplanesLive/http-airplanes-source.ts';
import { FallbackAirplanesSource } from '../../Adapters/AirplanesLive/fallback-airplanes-source.ts';
import { MqttClientSubscriber } from '../../Adapters/Mqtt/mqtt-client-subscriber.ts';
import { BrokerConfig } from '../../Domain/ValueObjects/broker-config.ts';
import type { MqttSubscriber } from '../../Ports/Mqtt/mqtt-subscriber.ts';
import { AirplanesController } from '../Controllers/airplanes-controller.ts';
import { errorMapping } from '../Filters/error-mapping.ts';

// atc proxies api.airplanes.live for the browser, so it needs permissive CORS
// and response compression — the two extras beyond the shared bootstrap.
const corsOptions: CorsOptions = {
  origin: (_origin, callback) => callback(null, true),
  credentials: true,
};

// What register() hands back to the composition root so it can drive long-lived
// background work over the server lifecycle (start on listen, stop on shutdown).
export interface Registrations {
  // The MQTT subscription, present only when MQTT_URL is configured.
  mqtt?: MqttSubscriber;
}

/**
 * Composition root: mount CORS/compression, the vendored static frontend, the
 * proxy routes, and the error filter. (server.ts passes staticDir: null so
 * startServer doesn't double-serve.) Also wires the optional MQTT subscription
 * and returns it so server.ts can start/stop it on the server lifecycle.
 */
export function register(app: Express): Registrations {
  app.use(cors(corsOptions));
  app.use(compression());

  // Vendored browser frontend, served always-revalidate (maxAge 0 + ETag): the
  // browser revalidates every load so a redeploy is picked up immediately, while
  // unchanged assets still return 304. Web/public resolves from cwd (app root in
  // dev, /app in Docker); express.static serves index.html at "/".
  app.use(express.static(join(process.cwd(), 'Web', 'public'), { maxAge: 0, etag: true }));

  // Wrap the HTTP source so pass-through DB requests fall back to the cached
  // snapshots under proxy-fallback/ when the upstream backend is unreachable.
  const source = new FallbackAirplanesSource(new HttpAirplanesSource(), join(process.cwd(), 'proxy-fallback'));
  const controller = new AirplanesController(source);
  app.use('/api', controller.router);

  app.use(errorMapping());

  return { mqtt: buildMqttSubscriber() };
}

// Build the MQTT subscription from the environment, or undefined when MQTT_URL
// is unset (so the app runs fine locally/in tests without a broker). Topics are
// a comma-separated MQTT_TOPIC (default "#" — every message); auth is anonymous
// unless MQTT_USERNAME/MQTT_PASSWORD are provided.
function buildMqttSubscriber(): MqttSubscriber | undefined {
  const url = process.env.MQTT_URL;
  if (!url) return undefined;

  const topics = (process.env.MQTT_TOPIC ?? '#').split(',');
  const config = BrokerConfig.create(url, topics, process.env.MQTT_USERNAME, process.env.MQTT_PASSWORD);
  return new MqttClientSubscriber(config);
}
