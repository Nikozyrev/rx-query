import { Observable, of, OperatorFunction } from 'rxjs';
import { MaybeObservable } from './types';

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

export const convertToObservableIfNotObservable = <T>(v: MaybeObservable<T>) =>
  v instanceof Observable ? v : of(v);
