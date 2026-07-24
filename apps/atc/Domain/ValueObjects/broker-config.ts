import { ValidationError } from '../Exceptions/validation-error.ts';

/**
 * A validated MQTT broker connection config: a broker URL, one or more topic
 * filters to subscribe to, and optional credentials. The factory trims and
 * enforces non-empty values so the adapter can trust them.
 */
export class BrokerConfig {
  readonly url: string;
  readonly topics: readonly string[];
  readonly username?: string;
  readonly password?: string;

  private constructor(url: string, topics: readonly string[], username?: string, password?: string) {
    this.url = url;
    this.topics = topics;
    this.username = username;
    this.password = password;
  }

  static create(url: string, topics: string[], username?: string, password?: string): BrokerConfig {
    const trimmedUrl = url.trim();
    if (trimmedUrl === '') {
      throw new ValidationError('MQTT broker URL must not be empty');
    }

    const cleanTopics = topics.map((t) => t.trim()).filter((t) => t !== '');
    if (cleanTopics.length === 0) {
      throw new ValidationError('At least one MQTT topic filter is required');
    }

    const user = username?.trim();
    const pass = password?.trim();
    return new BrokerConfig(trimmedUrl, cleanTopics, user || undefined, pass || undefined);
  }
}
