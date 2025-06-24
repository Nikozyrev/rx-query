import {
  ReplaySubject,
  Observable,
  mergeAll,
  mergeMap,
  share,
  map,
  ignoreElements,
  startWith,
  endWith,
  scan,
  Subject,
} from 'rxjs';
import { CacheAction } from '../types';

export const createEffects = () => {
  const effects$ = new ReplaySubject<Observable<CacheAction<any>>>();

  const sharedEffects$ = effects$.pipe(map((effect$) => effect$.pipe(share())), share());

  const reducedEffects$ = sharedEffects$.pipe(mergeAll());

  const activeEffects$ = sharedEffects$.pipe(
    mergeMap((effect$) =>
      effect$.pipe(ignoreElements(), startWith(1), endWith(-1))
    ),
    scan((count, value) => count + value, 0),
    startWith(0)
  );

  const registerEffect = (effect$: Observable<CacheAction<any>>): void => {
    effects$.next(effect$);
  };

  return {
    effects$: reducedEffects$,
    activeEffects$,
    registerEffect,
  };
};
