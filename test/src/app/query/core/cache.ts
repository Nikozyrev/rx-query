import { Injectable } from '@angular/core';
import { Observable, Subject, ReplaySubject, merge } from 'rxjs';
import { scan, startWith, tap, shareReplay, mergeAll } from 'rxjs/operators';
import { CacheAction, CacheEntry } from './types';
import { generateCacheKey, generateCacheKeyArray, splitKey } from './keys';

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
            const parts = splitKey(key);
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
