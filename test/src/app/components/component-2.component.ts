import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { createQuery, query, QueryCacheStore, toQuery } from '../query/core';
import { AsyncPipe } from '@angular/common';
import { BehaviorSubject, map, shareReplay, switchMap, tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-comp-two',
  standalone: true,
  imports: [AsyncPipe],
  template: ` <div class="list">
    <h2>2</h2>
    @if (todos$ | async; as todos) {
    <div class="buttons">
      <button (click)="prevPage()">Prev</button>
      <button (click)="nextPage()">Next</button>
      <button (click)="invalidate()">Clear</button>
    </div>

    @if (todos.loading) {
    <div>LOADING</div>
    } @for (todo of todos?.data?.todos; track todo.id) {
    <div>{{ todo.todo }}</div>
    } }
  </div>`,
  styles: `
    .list {
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }

    .buttons {
      display: flex;
      gap: .5rem;
    }

    button {
      width: fit-content;
    }
  `,
})
export class Comp2Component {
  private http = inject(HttpClient);
  private cache = inject(QueryCacheStore);

  public page$ = new BehaviorSubject<number>(0);
  public params$ = this.page$.pipe(
    map((page): TodosParams => ({ limit: 10, skip: page * 10 }))
  );

  public todos$ = this.params$.pipe(
    toQuery((params) => ({
      client: this.cache,
      key: ['todos', params],
      fetchFn: () =>
        this.http.get<TodosResponse>('https://dummyjson.com/todos', {
          params,
        }),
    })),
    tap((v) => console.log(v))
  );

  public todos = toSignal(this.todos$);

  public invalidate(): void {
    this.cache.clear();
  }

  public nextPage(): void {
    this.page$.next(this.page$.value + 1);
  }

  public prevPage(): void {
    this.page$.next(this.page$.value - 1);
  }
}

type TodosParams = {
  limit?: number;
  skip?: number;
};

type TodosResponse = {
  todos: Todo[];
  total: number;
  skip: number;
  limit: number;
};

type Todo = {
  id: number;
  todo: string;
  completed: boolean;
  userId: number;
};
