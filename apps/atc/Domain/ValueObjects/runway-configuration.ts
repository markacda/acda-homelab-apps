import { ValidationError } from '../Exceptions/validation-error.ts';

// The raw MQTT payload shape (homeassistant/sensor/eham/runway): landing/takeoff
// runways arrive as three fixed slots each, blanks padded with "" or spaces.
interface RawRunwayMessage {
  id?: unknown;
  updated?: unknown;
  start?: unknown;
  end?: unknown;
  state?: unknown;
  isLast?: unknown;
  [slot: string]: unknown;
}

/**
 * The active EHAM (Schiphol) runway configuration for a time window: which
 * runways are in use for landing and takeoff. Parsed from the runway MQTT
 * message, with the three fixed landing/takeoff slots normalised into arrays
 * (blank/whitespace slots dropped) so consumers get a clean list.
 */
export class RunwayConfiguration {
  readonly id: number;
  readonly updated: string;
  readonly start: string;
  readonly end: string;
  readonly landing: readonly string[];
  readonly takeoff: readonly string[];
  readonly state: string;
  readonly isLast: boolean;

  private constructor(
    id: number,
    updated: string,
    start: string,
    end: string,
    landing: readonly string[],
    takeoff: readonly string[],
    state: string,
    isLast: boolean
  ) {
    this.id = id;
    this.updated = updated;
    this.start = start;
    this.end = end;
    this.landing = landing;
    this.takeoff = takeoff;
    this.state = state;
    this.isLast = isLast;
  }

  /** Parse a runway MQTT payload (JSON string or already-parsed object). */
  static fromJson(payload: string | RawRunwayMessage): RunwayConfiguration {
    let raw: RawRunwayMessage;
    if (typeof payload === 'string') {
      try {
        raw = JSON.parse(payload) as RawRunwayMessage;
      } catch {
        throw new ValidationError('Runway payload is not valid JSON');
      }
    } else {
      raw = payload;
    }

    if (typeof raw !== 'object' || raw === null) {
      throw new ValidationError('Runway payload must be a JSON object');
    }

    const id = Number(raw.id);
    if (!Number.isFinite(id)) {
      throw new ValidationError('Runway payload is missing a numeric id');
    }

    return new RunwayConfiguration(
      id,
      asString(raw.updated),
      asString(raw.start),
      asString(raw.end),
      collectRunways(raw, 'landing'),
      collectRunways(raw, 'takeoff'),
      asString(raw.state),
      Boolean(raw.isLast)
    );
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Gather the three fixed slots (landing1..3 / takeoff1..3), trim, drop blanks.
function collectRunways(raw: RawRunwayMessage, prefix: 'landing' | 'takeoff'): string[] {
  return [raw[`${prefix}1`], raw[`${prefix}2`], raw[`${prefix}3`]]
    .map((slot) => (typeof slot === 'string' ? slot.trim() : ''))
    .filter((slot) => slot !== '');
}
