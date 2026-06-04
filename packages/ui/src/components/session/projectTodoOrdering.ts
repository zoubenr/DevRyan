export type ProjectTodoOrderable = {
  completed?: boolean;
};

export function orderProjectTodos<T extends ProjectTodoOrderable>(todos: readonly T[]): T[] {
  const incomplete: T[] = [];
  const completed: T[] = [];

  for (const todo of todos) {
    if (todo.completed) {
      completed.push(todo);
    } else {
      incomplete.push(todo);
    }
  }

  return [...incomplete, ...completed];
}
