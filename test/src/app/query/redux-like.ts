import { Injectable, inject } from '@angular/core';
import {
  Observable,
  Subject,
  merge,
  of,
  combineLatest,
  ReplaySubject,
  OperatorFunction,
  EMPTY,
} from 'rxjs';
import {
  switchMap,
  distinctUntilChanged,
  map,
  startWith,
  scan,
  shareReplay,
  catchError,
  tap,
  distinctUntilKeyChanged,
  mergeAll,
  finalize,
} from 'rxjs/operators';

/* ============================================================
   Типы и утилиты
============================================================ */

/** Интерфейс состояния запроса для подписчика */
export interface RequestState<R> {
  loading: boolean;
  data?: R;
  error?: any;
}

/** Интерфейс записи кэша */
export interface CacheEntry<R> {
  data: R;
  timestamp: number;
}

/** Тип действия (action) для обновления состояния кэша */
export type CacheAction<R> =
  | { type: 'UPDATE'; key: string[]; payload: R; timestamp: number }
  | { type: 'INVALIDATE'; key: string[] }
  | { type: 'CLEAR' };

const KEY_DELIMITER = '::';

/** Генерирует уникальный ключ на основе базового ключа и (опционально) параметров */
function generateCacheKey(keys: string[]): string {
  return keys.join(KEY_DELIMITER);
}

function generateCacheKeyArray(keys: unknown[]): string[] {
  return keys.map((key) => `${JSON.stringify(key)}`);
}

function generateFinalKey(keys: unknown[]): string {
  return generateCacheKey(generateCacheKeyArray(keys));
}

/* ============================================================
   QueryCacheStore – глобальное хранилище с декларативными эффектами
============================================================ */

@Injectable({ providedIn: 'root' })
export class QueryCacheStore {
  // Поток исходных действий (action), которые напрямую диспатчим.
  private actions$ = new Subject<CacheAction<any>>();

  // Поток эффектов: каждый эффект – это Observable, который эмитит действие.

  private effects$ = new ReplaySubject<Observable<CacheAction<any>>>();

  // private activeEffects = new Map<string, Observable<CacheAction<any>>>();

  private reducedEffects$ = this.effects$.pipe(
    // scan(
    //   (effects, effect) => new Set(effects.add(effect)),
    //   new Set<Observable<CacheAction<any>>>()
    // ),
    // tap((v) => console.log(v)),
    // mergeAll(),
    mergeAll()
  );

  // Общий поток, который объединяет действия и эффекты и редьюсится в состояние кэша.
  public cache$: Observable<Map<string, CacheEntry<any>>> = merge(
    this.actions$,
    this.reducedEffects$
  ).pipe(
    scan((cache, action) => {
      const newCache = new Map(cache);
      switch (action.type) {
        case 'UPDATE':
          newCache.set(generateCacheKey(action.key), {
            data: action.payload,
            timestamp: action.timestamp,
          });
          break;
        case 'INVALIDATE':
          const keys = Array.from(cache.keys());
          keys.forEach((key) => {
            const parts = key.split(KEY_DELIMITER);
            action.key.every((part) => parts.includes(part)) &&
              newCache.delete(key);
          });
          break;
        case 'CLEAR':
          return new Map();
      }
      return newCache;
    }, new Map<string, CacheEntry<any>>()),
    tap<Map<string, CacheEntry<any>>>(console.log),
    startWith(new Map()),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  /**
   * Регистрирует эффект обновления для заданного ключа.
   * Если для данного ключа уже активен эффект, новый регистрироваться не будет.
   * После завершения (или ошибки) эффект удаляется из карты activeEffects.
   */
  public registerEffect(
    key: string,
    effect$: Observable<CacheAction<any>>
  ): void {
    // const hasEffect = this.activeEffects.has(key);
    // if (hasEffect) return;
    // this.activeEffects.set(key, effect$);
    // const effectWithUnsub$ = effect$.pipe(
    //   tap({
    //     complete: () => this.activeEffects.delete(key),
    //     error: () => this.activeEffects.delete(key),
    //   })
    // );
    this.effects$.next(effect$);
  }

  /** Диспетчер действий (простая обёртка dispatch) */
  public dispatch(action: CacheAction<any>): void {
    this.actions$.next(action);
  }

  /** Удобный метод для обновления данных */
  public update<R>(key: string[], payload: R): void {
    this.dispatch({ type: 'UPDATE', key, payload, timestamp: Date.now() });
  }

  /** Метод для инвалидирования конкретного ключа */
  public invalidate(keys: unknown[]): void {
    const key = generateCacheKeyArray(keys);
    this.dispatch({ type: 'INVALIDATE', key });
    // Также очищаем зарегистрированный эффект по этому ключу, если он есть.
    // this.activeEffects.delete(baseKey);
  }

  /** Очищает весь кэшь */
  public clear(): void {
    this.dispatch({ type: 'CLEAR' });
    // this.activeEffects.clear();
  }
}

type CreateQueryParams<T, R> = {
  baseKey: string;
  params$?: Observable<T>;
  fetchFn: (params: T) => Observable<R>;
  ttl?: number;
};

/* ============================================================
   Функция createQuery – декларативный кэшированный запрос
============================================================ */

/**
 * Функция createQuery возвращает Observable состояния запроса.
 * Если для данного уникального ключа (baseKey + params) данные отсутствуют или устарели,
 * создаётся эффект (observable), который вызывает fetchFn и мэппит результат в действие UPDATE,
 * которое через редьюсер обновит кэш. При этом, если для одного и того же ключа уже зарегистрирован эффект,
 * он не дублируется. Подписчик всегда читает данные из состояния кэша (cache$).
 */
export function createQuery<T, R>({
  baseKey,
  params$,
  fetchFn,
  ttl = 300000, // TTL по умолчанию 5 минут
}: CreateQueryParams<T, R>): Observable<RequestState<R>> {
  const cacheStore = inject(QueryCacheStore);

  const finalParams$ = params$ ?? of(undefined as unknown as T);

  const paramsWithKey$ = finalParams$.pipe(
    map((params) => ({
      params,
      key: generateFinalKey([baseKey, params]),
    })),
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

  const refreshSubject$ = new ReplaySubject<T>();
  const refreshEffect$ = refreshSubject$.pipe(
    switchMap((params) =>
      fetchFn(params).pipe(
        map(
          (payload): CacheAction<R> => ({
            type: 'UPDATE',
            key: generateCacheKeyArray([baseKey, params]),
            payload,
            timestamp: Date.now(),
          })
        ),
        catchError((err) => EMPTY),
      )
    ),
    tap({
      complete: () => console.log('Complete effect'),
    })
  );

  cacheStore.registerEffect(baseKey, refreshEffect$);

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

/**
 * takeUntilCompleted – оператор, который подписывается на source и notifier.
 * Он транслирует эмиты source до тех пор, пока notifier не завершится.
 * После завершения notifier, оператор отписывается от source и завершает результирующий поток.
 *
 * @param notifier - observable, по завершении которого прекращается эмиссия значений из source
 */
export function takeUntilCompleted<T>(
  notifier: Observable<any>
): OperatorFunction<T, T> {
  return (source: Observable<T>) =>
    new Observable<T>((subscriber) => {
      // Подписываемся на исходный поток
      const sourceSub = source.subscribe({
        next: (value) => subscriber.next(value),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      // Подписываемся на notifier. Здесь нас интересует только событие complete.
      const notifierSub = notifier.subscribe({
        complete: () => {
          subscriber.complete();
          sourceSub.unsubscribe();
        },
        error: (err) => subscriber.error(err),
      });

      return () => {
        sourceSub.unsubscribe();
        notifierSub.unsubscribe();
      };
    });
}
