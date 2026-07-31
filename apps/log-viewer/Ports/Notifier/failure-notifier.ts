/** A summary of failed requests seen in one ingest cycle. */
export interface FailureSummary {
  /** How many new server-error (status >= 500) requests were seen this cycle. */
  count: number;
  /** The most recent failed request in the batch. */
  latest: {
    method: string;
    url: string;
    status: number;
    app?: string;
    /** The failed entry's ISO timestamp, used to deep-link the log viewer to it. */
    ts?: string;
    /** The `error` value pulled from the response body, if the body was JSON with one. */
    error?: string;
  };
}

/** Notifies (via the notification app) when new server errors appear in the logs. */
export interface FailureNotifier {
  notify(summary: FailureSummary): Promise<void>;
}
