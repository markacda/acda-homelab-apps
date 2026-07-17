/** A summary of failed requests seen in one ingest cycle. */
export interface FailureSummary {
  /** How many new failed (status >= 400) requests were seen this cycle. */
  count: number;
  /** The most recent failed request in the batch. */
  latest: { method: string; url: string; status: number; app?: string };
}

/** Sends a push notification when new failed requests appear in the logs. */
export interface FailureNotifier {
  notify(summary: FailureSummary): Promise<void>;
}
