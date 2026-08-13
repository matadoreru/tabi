export const TASK_TEMPLATES = Object.freeze({
  international: {
    label: "Viaje internacional",
    items: [
      "Revisar pasaporte",
      "Contratar seguro",
      "Preparar adaptador",
      "Descargar mapas offline",
      "Avisar al banco",
    ],
  },
  luggage: {
    label: "Equipaje básico",
    items: ["Documentación", "Medicamentos", "Cargadores", "Ropa interior", "Neceser"],
  },
  beach: { label: "Playa", items: ["Protector solar", "Bañador", "Toalla", "Gafas de sol"] },
  children: { label: "Viaje con niños", items: ["Documentación infantil", "Botiquín", "Entretenimiento", "Snacks"] },
});

export function templateTasks(templateId, assigneeId = "") {
  const template = TASK_TEMPLATES[templateId];
  if (!template) return [];
  return template.items.map((title) => ({
    title,
    category: "Equipaje",
    priority: "Media",
    status: "Pendiente",
    assigneeId,
    notes: `Plantilla: ${template.label}`,
  }));
}
