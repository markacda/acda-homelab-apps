/** A notification to deliver via the notification app. */
export interface AlertMessage {
  title: string;
  message: string;
  /** Where tapping the notification navigates; defaults to the log viewer. */
  url?: string;
}

/** Delivers alerts (via the notification app) when a rule fires in the logs. */
export interface Notifier {
  notify(alert: AlertMessage): Promise<void>;
}
