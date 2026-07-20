import type { NotificationChannel } from '../../Ports/Channels/notification-channel.ts';
import type { Notification } from '../../Domain/ValueObjects/notification.ts';

/** SMTP config for the email channel (read from env in register.ts). */
export interface EmailConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  /** Default recipient(s) when a notification carries no explicit target. */
  to: string[];
}

/**
 * Delivers notifications by email. SKELETON: config + wiring are in place but
 * deliver() is not implemented yet — it is the reference for how a real channel
 * is added.
 *
 * To implement:
 *   1. add `nodemailer` to package.json (+ @types/nodemailer) and the Dockerfile
 *      builder stage, then create the transport from `this.config`.
 *   2. build the message from the notification (subject = title, body = message,
 *      link the url), and send to the notification's target recipients or
 *      `this.config.to`.
 *   3. throw on transport failure so the dispatcher logs it (Promise.allSettled).
 */
export class EmailChannel implements NotificationChannel {
  readonly name = 'email';
  private readonly config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  deliver(_notification: Notification): Promise<void> {
    // TODO: implement SMTP send (see class doc). Throwing keeps it honest — the
    // dispatcher isolates the failure and logs it without failing the request.
    return Promise.reject(new Error(`email channel not implemented (would send via ${this.config.host})`));
  }
}
