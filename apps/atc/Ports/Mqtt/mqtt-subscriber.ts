/**
 * Port for a long-lived MQTT subscription. Implemented in the Adapters layer.
 * `start` connects to the broker and subscribes; `stop` disconnects cleanly and
 * is called from the graceful-shutdown hook.
 */
export interface MqttSubscriber {
  /** Connect to the broker and subscribe to the configured topics. */
  start(): Promise<void>;
  /** Disconnect from the broker, releasing the connection. */
  stop(): Promise<void>;
}
