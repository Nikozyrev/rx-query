import { Injectable, inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  of,
  throwError,
  combineLatest,
  interval,
} from 'rxjs';
import {
  switchMap,
  distinctUntilChanged,
  map,
  startWith,
  tap,
  catchError,
  shareReplay,
  distinctUntilKeyChanged,
} from 'rxjs/operators';

/** Интерфейс состояния запроса */
export interface RequestState<R> {
  loading: boolean;
  data?: R;
  error?: any;
}

/** Элемент кэша содержит само значение и время его получения */
export interface CacheEntry<R> {
  data: R;
  timestamp: number;
}

/**
 * Генерирует уникальный ключ для кэша на основе базового ключа и (опционально) параметров запроса.
 */
function generateCacheKey<T>(baseKey: string, params?: T): string {
  return params == null ? baseKey : `${baseKey}::${JSON.stringify(params)}`;
}

/**
 * Вспомогательная функция, которая вызывает fetchFn, а затем обновляет кэш с новым значением.
 */
function fetchAndUpdateCache<T, R>(
  params: T,
  cacheKey: string,
  fetchFn: (params: T) => Observable<R>,
  cacheManager: QueryCacheManager
): Observable<RequestState<R>> {
  return fetchFn(params).pipe(
    tap((data: R) => {
      const currentCache = new Map(cacheManager.queryCache$.value);
      const newEntry: CacheEntry<R> = { data, timestamp: Date.now() };
      currentCache.set(cacheKey, newEntry);
      cacheManager.queryCache$.next(currentCache);
    }),
    map((data: R) => ({ loading: false, data } as RequestState<R>)),
    catchError((err) => {
      const currentCache = new Map(cacheManager.queryCache$.value);
      currentCache.delete(cacheKey);
      cacheManager.queryCache$.next(currentCache);
      return throwError(() => err);
    })
  );
}

/**
 * Сервис QueryCacheManager отвечает за хранение кэша запросов.
 * Весь кэш хранится как BehaviorSubject, содержащий Map.
 */
@Injectable({
  providedIn: 'root',
})
export class QueryCacheManager {
  public queryCache$ = new BehaviorSubject<Map<string, CacheEntry<any>>>(
    new Map()
  );
  public defaultCacheDuration = 300000; // 5 минут по умолчанию
  private cleanupInterval = 60000; // интервал очистки — 1 минута
  private cleanupSubscription = interval(this.cleanupInterval).subscribe(() =>
    this.cleanupCache()
  );

  /** Метод, который проходит по кэшу и удаляет устаревшие записи. */
  private cleanupCache(): void {
    const now = Date.now();
    const currentCache = this.queryCache$.value;
    const newCache = new Map<string, CacheEntry<any>>();
    currentCache.forEach((entry, key) => {
      if (now - entry.timestamp < this.defaultCacheDuration) {
        newCache.set(key, entry);
      }
    });
    if (newCache.size !== currentCache.size) {
      this.queryCache$.next(newCache);
    }
  }

  /** Инвалидирует (удаляет) запись кэша по базовому ключу и параметрам. */
  public invalidateCache<T>(baseKey: string, params?: T): void {
    const cacheKey = generateCacheKey(baseKey, params);
    const newCache = new Map(this.queryCache$.value);
    newCache.delete(cacheKey);
    this.queryCache$.next(newCache);
  }

  /** Очищает весь кэш. */
  public clearCache(): void {
    this.queryCache$.next(new Map());
  }

  /** Освобождает ресурсы, отписываясь от интервального очистки кэша. */
  public dispose(): void {
    this.cleanupSubscription.unsubscribe();
  }
}

/**
 * Функция createQuery создаёт кэшированный Observable, эмитящий объект состояния запроса.
 *
 * Аргументы:
 *  - baseKey: базовый ключ для идентификации запроса (например, URL).
 *  - params$: (необязательный) Observable с параметрами запроса.
 *  - fetchFn: функция, которая по параметрам возвращает Observable с данными типа R.
 *
 * После объединения потока параметров и потока кэша с помощью combineLatest,
 * с помощью map извлекается нужное значение кэша по ключу,
 * к нему применяется distinctUntilChanged, и затем происходит переход в switchMap:
 * если актуальная запись есть – сразу возвращаются кэшированные данные,
 * иначе вызывается fetchFn для обновления кэша.
 */
export function createQuery<T, R>(
  baseKey: string,
  params$: Observable<T> | undefined,
  fetchFn: (params: T) => Observable<R>
): Observable<RequestState<R>> {
  const cacheManager = inject(QueryCacheManager);
  const finalParams$ = (params$ ?? of(undefined as unknown as T)).pipe(
    map((params) => ({ params, cacheKey: generateCacheKey(baseKey, params) })),
    distinctUntilKeyChanged('cacheKey')
  );

  return combineLatest([finalParams$, cacheManager.queryCache$]).pipe(
    map(([{ cacheKey, params }, cache]) => ({
      params,
      cacheKey,
      entry: cache.get(cacheKey),
    })),
    distinctUntilChanged(
      (prev, curr) =>
        prev.entry === curr.entry && prev.cacheKey === curr.cacheKey
    ),
    switchMap(({ params, cacheKey, entry }) => {
      const now = Date.now();
      const fresh =
        entry && now - entry.timestamp < cacheManager.defaultCacheDuration;
      return fresh
        ? of(cacheKey)
        : fetchAndUpdateCache(params, cacheKey, fetchFn, cacheManager).pipe(
            startWith(undefined),
            map(() => cacheKey)
          );
    }),
    switchMap((cacheKey) =>
      cacheManager.queryCache$.pipe(
        map((cache) => cacheKey ? cache.get(cacheKey): undefined),
        map((entry): RequestState<R> => ({ loading: !cacheKey, data: entry?.data }))
      )
    ),
    shareReplay({ bufferSize: 1, refCount: false })
  );
}
