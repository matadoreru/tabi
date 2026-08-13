import { templateTasks } from "./task-templates.js";

Deno.test("las plantillas TODO crean elementos compatibles con la lista única", () => {
  const tasks = templateTasks("international", "usr_1");
  if (!tasks.length || tasks.some((task) => task.category !== "Equipaje" || task.assigneeId !== "usr_1")) {
    throw new Error("Plantilla TODO no válida.");
  }
});
