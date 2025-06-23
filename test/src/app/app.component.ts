import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Comp1Component } from './components/component-1.component';
import { Comp2Component } from "./components/component-2.component";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, Comp1Component, Comp2Component],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  public show1 = signal(false);
  public show2 = signal(true);
}
