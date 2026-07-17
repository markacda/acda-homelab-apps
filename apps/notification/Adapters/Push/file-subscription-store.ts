import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SubscriptionStore } from '../../Ports/Push/subscription-store.ts';
import type { PushSubscription } from '../../Domain/ValueObjects/push-subscription.ts';

/**
 * JSON-file-backed subscription store. Single-process, so a serialized
 * read-modify-write is enough; writes are chained on a promise so concurrent
 * add/remove calls don't clobber each other.
 */
export class FileSubscriptionStore implements SubscriptionStore {
  private readonly path: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.path = path;
  }

  async list(): Promise<PushSubscription[]> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as PushSubscription[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  add(sub: PushSubscription): Promise<void> {
    return this.mutate((subs) => [...subs.filter((s) => s.endpoint !== sub.endpoint), sub]);
  }

  remove(endpoint: string): Promise<void> {
    return this.mutate((subs) => subs.filter((s) => s.endpoint !== endpoint));
  }

  /** Serialize read-modify-write operations through a single promise chain. */
  private mutate(fn: (subs: PushSubscription[]) => PushSubscription[]): Promise<void> {
    this.queue = this.queue.then(async () => {
      const next = fn(await this.list());
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, JSON.stringify(next, null, 2), 'utf8');
    });
    return this.queue;
  }
}
