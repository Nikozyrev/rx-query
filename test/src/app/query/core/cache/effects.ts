import { ReplaySubject, Observable, mergeAll } from 'rxjs';
import { CacheAction } from '../types';

export const createEffects = () => {
  const effects$ = new ReplaySubject<Observable<CacheAction<any>>>();

  const reducedEffects$ = effects$.pipe(mergeAll());

  const registerEffect = (effect$: Observable<CacheAction<any>>): void => {
    effects$.next(effect$);
  };

  return {
    effects$: reducedEffects$,
    registerEffect,
  };
};
