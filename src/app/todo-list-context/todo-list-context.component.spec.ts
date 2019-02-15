import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TodoListContextComponent } from './todo-list-context.component';
import { MockComponent } from 'ng-mocks';
import { TodoListComponent } from '../todo-list/todo-list.component';

describe('TodoListContextComponent', () => {
  let component: TodoListContextComponent;
  let fixture: ComponentFixture<TodoListContextComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [
        TodoListContextComponent,
        MockComponent(TodoListComponent)
      ],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TodoListContextComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
