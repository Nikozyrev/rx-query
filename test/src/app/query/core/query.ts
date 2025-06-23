import { inject } from '@angular/core';
import {
  Observable,
  of,
  combineLatest,
  ReplaySubject,
  EMPTY,
  pipe,
} from 'rxjs';
import {
  switchMap,
  distinctUntilChanged,
  map,
  shareReplay,
  catchError,
  tap,
  finalize,
} from 'rxjs/operators';
import { QueryCacheStore } from './cache';
import { RequestState, CacheAction } from './types';
import { generateCacheKeyArray, generateStoreKey } from './keys';
import { takeUntilCompleted } from './utils';

type QueryParams<Key extends [...any], R> = {
  key: readonly [...Key];
  ttl?: number;
  client: QueryCacheStore;
  fetchFn: (params: readonly [...Key]) => Observable<R>;
};

export function query<Key extends [...any], R>({
  client,
  key,
  fetchFn,
  ttl = 300000, // TTL по умолчанию 5 минут
}: QueryParams<Key, R>): Observable<RequestState<R>> {
  const storeKey = generateStoreKey(key);

  const entry$ = client.cache$.pipe(
    map((cache) => cache.get(storeKey)),
    distinctUntilChanged()
  );

  const complete$ = new ReplaySubject<void>();

  return entry$.pipe(
    map((entry): RequestState<R> => {
      const now = Date.now();
      const hasFreshData = entry && now - entry.timestamp < ttl;

      if (hasFreshData && entry.data !== undefined) {
        return { loading: false, data: entry.data };
      } else {
        const refreshEffect$ = fetchFn(key).pipe(
          map(
            (payload): CacheAction<R> => ({
              type: 'UPDATE',
              key: generateCacheKeyArray(key),
              payload,
              timestamp: Date.now(),
            })
          ),
          catchError((err) => EMPTY),
          tap({
            complete: () => console.log('Complete effect'),
          }),
          takeUntilCompleted(complete$)
        );

        client.registerEffect(refreshEffect$);

        return { loading: true };
      }
    }),
    finalize(() => (console.log('finalize'), complete$.complete())),
    shareReplay({ bufferSize: 1, refCount: true })
  );
}

export const toQuery = <Key extends [...any], Params, R>(
  getQueryParams: (params: Params) => QueryParams<Key, R>
) =>
  pipe(
    switchMap((params: Params) => query(getQueryParams(params))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

type UnwrapValue<T> = T extends Observable<infer U> ? U : T;

type UnwrapObservables<T extends readonly [...any]> = {
  [K in keyof T]: UnwrapValue<T[K]>;
};

type CreateQueryParams<Key extends readonly [...any], R> = {
  key: readonly [...Key];
  fetchFn: (params: readonly [...UnwrapObservables<Key>]) => Observable<R>;
  ttl?: number;
};

export function createQuery<Key extends [...any], R>({
  key,
  fetchFn,
  ttl = 300000, // TTL по умолчанию 5 минут
}: CreateQueryParams<Key, R>): Observable<RequestState<R>> {
  const cacheStore = inject(QueryCacheStore);

  const params$ = combineLatest(
    key.map((v) => ((v as unknown) instanceof Observable ? v : of(v)))
  ) as Observable<UnwrapObservables<Key>>;

  return params$.pipe(
    toQuery<UnwrapObservables<Key>, UnwrapObservables<Key>, R>((key) => ({
      client: cacheStore,
      key,
      fetchFn,
      ttl,
    }))
  );
}
