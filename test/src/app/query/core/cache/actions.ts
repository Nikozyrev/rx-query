import { Subject } from 'rxjs';
import { CacheAction } from '../types';
import { generateCacheKeyArray } from '../keys';

export const createActions = () => {
  const actions$ = new Subject<CacheAction<any>>();

  const dispatch = (action: CacheAction<any>): void => actions$.next(action);

  const update = <R>(key: string[], payload: R): void => {
    dispatch({ type: 'UPDATE', key, payload, timestamp: Date.now() });
  };

  const invalidate = (keys: unknown[]): void => {
    const key = generateCacheKeyArray(keys);
    dispatch({ type: 'INVALIDATE', key });
  };

  const clear = (): void => {
    dispatch({ type: 'CLEAR' });
  };

  return {
    actions$: actions$.asObservable(),
    update,
    invalidate,
    clear,
  };
};
