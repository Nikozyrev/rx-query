import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AsyncPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, map, tap } from 'rxjs';
import { RxQuery } from '../query/angular';

@Component({
  selector: 'app-comp-one',
  standalone: true,
  imports: [AsyncPipe],
  template: ` <div class="list">
    <h2>1</h2>
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
export class Comp1Component {
  private http = inject(HttpClient);
  private rxQuery = inject(RxQuery);

  public page$ = new BehaviorSubject<number>(0);
  public params$ = this.page$.pipe(
    map((page): TodosParams => ({ limit: 10, skip: page * 10 }))
  );

  public todos$ = this.rxQuery.createQuery({
    key: ['todos', this.params$],
    fetchFn: ([, params]) =>
      this.http.get<TodosResponse>('https://dummyjson.com/todos', { params }),
  }).pipe(tap((v) => console.log(v)));

  public todos = toSignal(this.todos$);

  public invalidate(): void {
    this.rxQuery.invalidate(['todos', { limit: 10, skip: 0 }]);
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
