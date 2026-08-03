// Parsed query parameters shared between the query mapper and the query service.

export type RequestSortField = 'ts' | 'durationMs' | 'status' | 'app';
export type AppLogSortField = 'ts' | 'level' | 'app';
export type ExceptionSortField = 'ts' | 'app' | 'source' | 'name';
export type DependencySortField = 'ts' | 'app' | 'type' | 'target' | 'durationMs';

export interface SortSpec<F> {
  field: F;
  dir: 'asc' | 'desc';
}

export interface Pagination {
  limit: number;
  offset: number;
}
