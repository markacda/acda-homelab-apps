import type { UsageData } from "../../Domain/ValueObjects/usage.ts";

// Port for turning an uploaded meter export into domain UsageData. Implemented in
// the Adapters layer (HomeWizard CSV). Kept out of Domain because the file format
// is an external concern, not a domain rule.

/** Detected source columns, echoed back for debugging. */
export interface ColumnMapping {
  headers: string[];
  time: string;
  importT1: string | null;
  importT2: string | null;
  importTotal: string | null;
  gas: string | null;
}

/** UsageData plus the parse metadata surfaced in the API response `meta`. */
export interface ParseResult extends UsageData {
  mapping: ColumnMapping;
  rowCount: number;
  skippedRows: number;
}

export interface UsageParser {
  /** Parse raw export text into usage intervals. Throws on unusable input. */
  parse(text: string): ParseResult;
}
