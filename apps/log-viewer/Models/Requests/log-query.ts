// Parsed query parameters shared between the query mapper and the query service.

export type RequestSortField = 'ts' | 'durationMs' | 'status' | 'app';
export type AppLogSortField = 'ts' | 'level' | 'app';

export interface SortSpec<F> {
  field: F;
  dir: 'asc' | 'desc';
}

export interface Pagination {
  limit: number;
  offset: number;
}
