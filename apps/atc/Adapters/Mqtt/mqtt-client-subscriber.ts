import { connect } from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { MqttSubscriber } from '../../Ports/Mqtt/mqtt-subscriber.ts';
import type { BrokerConfig } from '../../Domain/ValueObjects/broker-config.ts';

/**
 * MqttSubscriber over the `mqtt` client. Connects to the broker, subscribes to
 * the configured topics, and logs every received message via console.* (which
 * server-kit mirrors into the structured app.log). Relies on mqtt.js's built-in
 * reconnect for transient broker outages. For now it only logs — it holds no
 * domain behaviour beyond the subscription itself.
 */
export class MqttClientSubscriber implements MqttSubscriber {
  private config: BrokerConfig;
  private client?: MqttClient;

  constructor(config: BrokerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const topics = [...this.config.topics];
    const client = connect(this.config.url, {
      username: this.config.username,
      password: this.config.password,
    });
    this.client = client;

    client.on('connect', () => {
      console.log(`[atc-mqtt] connected to ${this.config.url}`);
      client.subscribe(topics, (err) => {
        if (err) {
          console.error(`[atc-mqtt] failed to subscribe to ${topics.join(', ')}:`, err);
          return;
        }
        console.log(`[atc-mqtt] subscribed to ${topics.join(', ')}`);
      });
    });

    client.on('message', (topic, payload) => {
      console.log(`[atc-mqtt] ${topic} ${payload.toString()}`);
    });

    client.on('reconnect', () => console.log(`[atc-mqtt] reconnecting to ${this.config.url}`));
    client.on('close', () => console.log('[atc-mqtt] connection closed'));
    client.on('error', (err) => console.error('[atc-mqtt] client error:', err));
  }

  async stop(): Promise<void> {
    if (!this.client) return;
    await this.client.endAsync();
    this.client = undefined;
    console.log('[atc-mqtt] disconnected');
  }
}
