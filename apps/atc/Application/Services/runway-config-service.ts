import { RunwayConfiguration } from '../../Domain/ValueObjects/runway-configuration.ts';

/**
 * Holds the latest EHAM runway configuration received over MQTT. Acts as the
 * MQTT message handler (parse + store) and the read model the controller serves.
 * A payload that fails to parse is logged and ignored so a bad message never
 * clears the last-known-good config.
 */
export class RunwayConfigService {
  private current?: RunwayConfiguration;

  /** MQTT message handler: parse the payload and keep it as the latest config. */
  handleMessage(_topic: string, payload: string): void {
    try {
      this.current = RunwayConfiguration.fromJson(payload);
    } catch (err) {
      console.error('[atc-runway] failed to parse runway payload:', err);
    }
  }

  /** The most recent runway configuration, or undefined if none received yet. */
  latest(): RunwayConfiguration | undefined {
    return this.current;
  }
}
