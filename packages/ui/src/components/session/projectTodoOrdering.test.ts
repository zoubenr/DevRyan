import { describe, expect, test } from 'bun:test';
import { orderProjectTodos, type ProjectTodoOrderable } from './projectTodoOrdering';

type TestTodo = ProjectTodoOrderable & { id: string };

describe('orderProjectTodos', () => {
  test('places incomplete todos before completed todos in a mixed list', () => {
    const todos: TestTodo[] = [
      { id: 'a', completed: true },
      { id: 'b', completed: false },
      { id: 'c', completed: true },
      { id: 'd', completed: false },
    ];

    expect(orderProjectTodos(todos).map((todo) => todo.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  test('preserves relative order among completed todos', () => {
    const todos: TestTodo[] = [
      { id: 'a', completed: true },
      { id: 'b', completed: true },
      { id: 'c', completed: true },
    ];

    expect(orderProjectTodos(todos).map((todo) => todo.id)).toEqual(['a', 'b', 'c']);
  });

  test('preserves relative order among incomplete todos', () => {
    const todos: TestTodo[] = [
      { id: 'a', completed: false },
      { id: 'b', completed: false },
      { id: 'c', completed: false },
    ];

    expect(orderProjectTodos(todos).map((todo) => todo.id)).toEqual(['a', 'b', 'c']);
  });

  test('returns an empty array for an empty input', () => {
    expect(orderProjectTodos([])).toEqual([]);
  });

  test('returns all todos unchanged when every todo is incomplete', () => {
    const todos: TestTodo[] = [
      { id: 'a', completed: false },
      { id: 'b', completed: false },
    ];

    expect(orderProjectTodos(todos).map((todo) => todo.id)).toEqual(['a', 'b']);
  });

  test('returns all todos unchanged when every todo is completed', () => {
    const todos: TestTodo[] = [
      { id: 'a', completed: true },
      { id: 'b', completed: true },
    ];

    expect(orderProjectTodos(todos).map((todo) => todo.id)).toEqual(['a', 'b']);
  });

  test('does not mutate the original array or its items', () => {
    const todos: TestTodo[] = [
      { id: 'a', completed: true },
      { id: 'b', completed: false },
    ];
    const snapshot = todos.map((todo) => ({ ...todo }));

    const ordered = orderProjectTodos(todos);

    expect(todos).toEqual(snapshot);
    expect(ordered).not.toBe(todos);
    expect(ordered[0]).toBe(todos[1]);
    expect(ordered[1]).toBe(todos[0]);
  });
});
