export interface RequestState<R> {
  loading: boolean;
  data?: R;
  error?: any;
}

export interface CacheEntry<R> {
  data: R;
  timestamp: number;
}

export type CacheAction<R> =
  | { type: 'UPDATE'; key: string[]; payload: R; timestamp: number }
  | { type: 'INVALIDATE'; key: string[] }
  | { type: 'CLEAR' };
