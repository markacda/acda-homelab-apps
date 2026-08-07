import express from 'express';
import type { Express } from 'express';
import { join } from 'node:path';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import compression from 'compression';
import { HttpAirplanesSource } from '../../Adapters/AirplanesLive/http-airplanes-source.ts';
import { FallbackAirplanesSource } from '../../Adapters/AirplanesLive/fallback-airplanes-source.ts';
import { MqttClientSubscriber } from '../../Adapters/Mqtt/mqtt-client-subscriber.ts';
import { BrokerConfig } from '../../Adapters/Mqtt/broker-config.ts';
import type { MqttSubscriber, MqttMessageHandler } from '../../Ports/Mqtt/mqtt-subscriber.ts';
import { AirplanesController } from '../Controllers/airplanes-controller.ts';
import { RunwayController } from '../Controllers/runway-controller.ts';
import { RunwayConfigService } from '../Services/runway-config-service.ts';
import { errorMapping } from '../Filters/error-mapping.ts';
import { createAtcGuards } from './auth-guards.ts';

// Subscribe to every topic by default; known topics are dispatched to their
// handler and unknown ones are logged. Override with MQTT_TOPIC (comma-separated).
const DEFAULT_TOPIC = '#';

// EHAM (Schiphol) active-runway configuration published by Home Assistant — the
// one topic we parse (into RunwayConfiguration) rather than just log.
const RUNWAY_TOPIC = 'homeassistant/sensor/eham/runway';

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

  // User-role gate (issue #154): the /api proxy answers JSON 401/403; the served
  // static frontend bounces logged-out browsers to the auth login. /healthz stays
  // public (both guards skip it). Mounted before static + the /api routers below.
  // Home Assistant embed bypass (issue #186): ATC_EMBED_TOKEN authorizes an iframe whose
  // URL carries ?embed_token=<token> (the reliable route — an HA iframe often sends no
  // Referer), and ATC_TRUSTED_EMBED_ORIGINS authorizes by Origin/Referer when it does
  // survive. Either one grants the embed a short-lived cookie; both unset = fully gated.
  const trustedEmbedOrigins = (process.env.ATC_TRUSTED_EMBED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const embedToken = process.env.ATC_EMBED_TOKEN?.trim() || undefined;
  const { requireApiUser, requireUserPage } = createAtcGuards({ trustedEmbedOrigins, embedToken });
  app.use('/api', requireApiUser); // gates AirplanesController + RunwayController
  app.use(requireUserPage); // gates the static index.html + assets (skips /api, /healthz)

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

  // Latest EHAM runway configuration: an in-memory store fed by MQTT and served
  // at GET /api/runways (503 until the first message arrives). The controller is
  // always mounted; MQTT feeds it only when configured.
  const runwayService = new RunwayConfigService();
  app.use('/api', new RunwayController(runwayService).router);

  app.use(errorMapping());

  // Route known topics to their handler (silently); the subscriber logs the rest.
  const handlers = new Map<string, MqttMessageHandler>([[RUNWAY_TOPIC, (topic, payload) => runwayService.handleMessage(topic, payload)]]);

  return { mqtt: buildMqttSubscriber(handlers) };
}

// Build the MQTT subscription from the environment, or undefined when MQTT_URL
// is unset (so the app runs fine locally/in tests without a broker). Topics are
// a comma-separated MQTT_TOPIC (default "#" — every topic); auth is anonymous
// unless MQTT_USERNAME/MQTT_PASSWORD are provided. Messages on a topic in
// `handlers` are dispatched to it; all others are logged by the subscriber.
function buildMqttSubscriber(handlers: Map<string, MqttMessageHandler>): MqttSubscriber | undefined {
  const url = process.env.MQTT_URL;
  if (!url) return undefined;

  const topics = (process.env.MQTT_TOPIC ?? DEFAULT_TOPIC).split(',');
  const config = BrokerConfig.create(url, topics, process.env.MQTT_USERNAME, process.env.MQTT_PASSWORD);
  return new MqttClientSubscriber(config, handlers);
}
