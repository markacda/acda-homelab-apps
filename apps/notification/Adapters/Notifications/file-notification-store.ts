import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { NotificationStore } from '../../Ports/Notifications/notification-store.ts';
import type { Notification } from '../../Domain/ValueObjects/notification.ts';

/** How many notifications to retain in the recent feed. */
const MAX_ENTRIES = 200;

/**
 * JSON-file-backed feed of recent notifications, newest first and capped at
 * {@link MAX_ENTRIES}. Writes are serialized through a promise chain (see
 * FileSubscriptionStore for the same pattern).
 */
export class FileNotificationStore implements NotificationStore {
  private readonly path: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.path = path;
  }

  private async readAll(): Promise<Notification[]> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as Notification[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  add(n: Notification): Promise<void> {
    this.queue = this.queue.then(async () => {
      const next = [n, ...(await this.readAll())].slice(0, MAX_ENTRIES);
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, JSON.stringify(next, null, 2), 'utf8');
    });
    return this.queue;
  }

  async recent(limit: number): Promise<Notification[]> {
    return (await this.readAll()).slice(0, Math.max(0, limit));
  }
}
