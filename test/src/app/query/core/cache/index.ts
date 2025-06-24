import { Observable, merge } from 'rxjs';
import { scan, startWith, tap, shareReplay } from 'rxjs/operators';
import { CacheAction, CacheEntry } from '../types';
import { createActions } from './actions';
import { createEffects } from './effects';
import { cacheReducer } from './reducer';

export type QueryClient = {
  store$: Observable<Map<string, CacheEntry<any>>>;
  update: <R>(key: string[], payload: R) => void;
  invalidate: (keys: unknown[]) => void;
  clear: () => void;
  registerEffect: (effect$: Observable<CacheAction<any>>) => void;
};

export const createQueryClient = (): QueryClient => {
  const { actions$, invalidate, update, clear } = createActions();
  const { effects$, registerEffect } = createEffects();

  const store$: Observable<Map<string, CacheEntry<any>>> = merge(
    actions$,
    effects$
  ).pipe(
    scan(cacheReducer, new Map<string, CacheEntry<any>>()),
    tap<Map<string, CacheEntry<any>>>(console.log),
    startWith(new Map()),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  return {
    store$,
    update,
    invalidate,
    clear,
    registerEffect,
  };
};
