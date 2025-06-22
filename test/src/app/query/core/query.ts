import { inject } from '@angular/core';
import {
  Observable,
  of,
  combineLatest,
  ReplaySubject,
  EMPTY,
} from 'rxjs';
import {
  switchMap,
  distinctUntilChanged,
  map,
  shareReplay,
  catchError,
  tap,
  distinctUntilKeyChanged,
  finalize,
} from 'rxjs/operators';
import { QueryCacheStore } from './cache';
import { RequestState, CacheAction } from './types';
import { generateCacheKeyArray, generateStoreKey } from './keys';

type UnwrapValue<T> = T extends Observable<infer U> ? U : T;

type UnwrapObservables<T extends readonly [...any]> = {
  [K in keyof T]: UnwrapValue<T[K]>;
};

type CreateQueryParams<Key extends readonly [...any], R> = {
  key: readonly [...Key];
  fetchFn: (params: UnwrapObservables<Key>) => Observable<R>;
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

  const paramsWithKey$ = params$.pipe(
    map((params) => ({ params, key: generateStoreKey(params as unknown[]) })),
    distinctUntilKeyChanged('key'),
    shareReplay({ bufferSize: 1, refCount: true }),
    tap({
      subscribe: () => console.log('sub to params'),
      unsubscribe: () => console.log('Complete params'),
    })
  );

  const entry$ = combineLatest([paramsWithKey$, cacheStore.cache$]).pipe(
    map(([{ key, params }, cache]) => ({ params, key, entry: cache.get(key) })),
    distinctUntilChanged(
      (prev, curr) => prev.entry === curr.entry && prev.key === curr.key
    )
  );

  const refreshSubject$ = new ReplaySubject<UnwrapObservables<Key>>();
  const refreshEffect$ = refreshSubject$.pipe(
    switchMap((params) =>
      fetchFn(params).pipe(
        map(
          (payload): CacheAction<R> => ({
            type: 'UPDATE',
            key: generateCacheKeyArray(params as unknown[]),
            payload,
            timestamp: Date.now(),
          })
        ),
        catchError((err) => EMPTY)
      )
    ),
    tap({
      complete: () => console.log('Complete effect'),
    })
  );

  cacheStore.registerEffect(refreshEffect$);

  return entry$.pipe(
    map(({ params, entry }): RequestState<R> => {
      const now = Date.now();
      const hasFreshData = entry && now - entry.timestamp < ttl;

      if (hasFreshData && entry.data !== undefined) {
        return { loading: false, data: entry.data };
      } else {
        refreshSubject$.next(params);
        return { loading: true };
      }
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
    finalize(() => (console.log('finalize'), refreshSubject$.complete()))
  );
}
