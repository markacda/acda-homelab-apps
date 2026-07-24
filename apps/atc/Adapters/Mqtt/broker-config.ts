/**
 * Validated MQTT broker connection config: a broker URL, one or more topic
 * filters to subscribe to, and optional credentials. Infrastructure config for
 * the MQTT adapter (not domain logic) — the factory trims and enforces
 * non-empty values so the client can trust them, failing startup on bad input.
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
      throw new Error('MQTT broker URL must not be empty');
    }

    const cleanTopics = topics.map((t) => t.trim()).filter((t) => t !== '');
    if (cleanTopics.length === 0) {
      throw new Error('At least one MQTT topic filter is required');
    }

    const user = username?.trim();
    const pass = password?.trim();
    return new BrokerConfig(trimmedUrl, cleanTopics, user || undefined, pass || undefined);
  }
}
