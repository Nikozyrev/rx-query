import { Observable } from "rxjs";

export type NotObservable<T> = T extends Observable<unknown> ? never : T;

export type MaybeObservable<T> = NotObservable<T> | Observable<T>;
export type MaybeObservablesTuple<T extends readonly [...any]> = {
  [K in keyof T]: MaybeObservable<T[K]>;
};

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
