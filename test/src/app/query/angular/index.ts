import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CacheAction,
  createQuery,
  createQueryClient,
  CreateQueryParams,
} from '../core';

type QueryParams<Key extends readonly [...any], R> = Omit<
  CreateQueryParams<Key, R>,
  'client'
>;

@Injectable({ providedIn: 'root' })
export class RxQuery {
  public readonly client = createQueryClient();

  public createQuery<Key extends readonly [...any], R>(
    params: QueryParams<Key, R>
  ) {
    const { key, fetchFn, ttl } = params;
    return createQuery<Key, R>({ client: this.client, key, fetchFn, ttl });
  }

  public registerEffect(effect$: Observable<CacheAction<any>>): void {
    this.client.registerEffect(effect$);
  }

  public update<R>(key: string[], payload: R): void {
    this.client.update(key, payload);
  }

  public invalidate(keys: unknown[]): void {
    this.client.invalidate(keys);
  }

  public clear(): void {
    this.client.clear();
  }
}
