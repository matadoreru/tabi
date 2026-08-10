const paths = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  bag: '<path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  wallet:
    '<path d="M3 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/><path d="M3 7V5a2 2 0 0 1 2-2h12v4M16 13h5"/>',
  bed: '<path d="M3 5v16M3 16h18v5M7 12V8h5a3 3 0 0 1 3 3v5M3 12h18v4"/>',
  train:
    '<rect x="5" y="2" width="14" height="17" rx="4"/><path d="M8 22l2-3M16 19l2 3M5 13h14M9 6h6"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/>',
  ticket: '<path d="M3 7a2 2 0 0 0 0 4v6h18v-6a2 2 0 0 0 0-4V5H3v2Z"/><path d="M13 5v12"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.1.38.3.72.6 1 .3.27.68.4 1.1.4h.09v4h-.09a1.7 1.7 0 0 0-1.7.6Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert:
    '<path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  external: '<path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  plane: '<path d="M22 2 9 15M22 2l-6 20-4-9-9-4Z"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
};

export const icon = (name, className = "icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.more}</svg>`;
export const esc = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]),
  );
export const searchKey = (value = "") =>
  String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es").trim();
export const formatDate = (date, options = {}) => {
  if (!date) return "—";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", ...options }).format(parsed);
};
export const formatMoney = (amount, currency = "JPY") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: currency === "JPY" ? 0 : 2 })
    .format(Number(amount || 0));
export const fullDate = (date) =>
  date
    ? new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(
      new Date(`${date}T12:00:00`),
    )
    : "";
export const statusTone = (status = "") =>
  /pagado|comprado|visitado|confirmad|completad/i.test(status)
    ? "green"
    : /pendiente|por reservar|parcial/i.test(status)
    ? "amber"
    : /descartado|no encontrado|cancel/i.test(status)
    ? "red"
    : "blue";
export const badge = (label, tone) => `<span class="badge ${tone || statusTone(label)}">${esc(label)}</span>`;

export function modal({
  title,
  fields,
  submitLabel = "Guardar",
  dangerLabel = "",
  values = {},
  onSubmit,
  onDanger,
  onReady,
}) {
  const root = document.querySelector("#modal-root");
  const fieldHtml = fields.map((field) => {
    const value = values[field.name] ?? field.value ?? "";
    const required = field.required ? "required" : "";
    const options = (field.options || []).map((option) => {
      const item = typeof option === "string" ? { value: option, label: option } : option;
      return `<option value="${esc(item.value)}" ${String(item.value) === String(value) ? "selected" : ""}>${
        esc(item.label)
      }</option>`;
    }).join("");
    let control = `<input id="field-${field.name}" name="${field.name}" type="${field.type || "text"}" value="${
      esc(value)
    }" ${required} ${field.min !== undefined ? `min="${field.min}"` : ""} ${
      field.step ? `step="${field.step}"` : ""
    } placeholder="${esc(field.placeholder || "")}" />`;
    if (field.type === "select") {
      control = `<select id="field-${field.name}" name="${field.name}" ${required}>${
        field.empty ? `<option value="">${esc(field.empty)}</option>` : ""
      }${options}</select>`;
    }
    if (field.type === "autocomplete") {
      control =
        `<div class="autocomplete" data-autocomplete><input id="field-${field.name}" name="${field.name}" type="text" value="${
          esc(value)
        }" ${required} placeholder="${
          esc(field.placeholder || "Escribe para buscar…")
        }" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="field-${field.name}-options"><div id="field-${field.name}-options" class="autocomplete-options" role="listbox" hidden>${
          (field.options || []).map((option) => {
            const item = typeof option === "string" ? { value: option, label: option } : option;
            return `<button type="button" role="option" data-autocomplete-option data-value="${
              esc(item.value)
            }" data-search-key="${esc(searchKey(`${item.value} ${item.label} ${item.code || ""}`))}">${
              esc(item.label)
            }</button>`;
          }).join("")
        }</div></div>`;
    }
    if (field.type === "textarea") {
      control = `<textarea id="field-${field.name}" name="${field.name}" placeholder="${
        esc(field.placeholder || "")
      }">${esc(value)}</textarea>`;
    }
    return `<div class="field ${field.full ? "full" : ""}" data-field="${
      esc(field.name)
    }"><label for="field-${field.name}">${esc(field.label)}${field.required ? " *" : ""}</label>${control}${
      field.help ? `<span class="field-help">${esc(field.help)}</span>` : ""
    }</div>`;
  }).join("");
  root.innerHTML =
    `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><h2 id="modal-title">${
      esc(title)
    }</h2><button class="btn btn-ghost icon-btn" type="button" data-close aria-label="Cerrar">${
      icon("close")
    }</button></header><form><div class="modal-body"><div class="form-grid">${fieldHtml}</div></div><footer class="modal-foot">${
      dangerLabel ? `<button type="button" class="btn btn-danger" data-danger>${esc(dangerLabel)}</button>` : ""
    }<button type="button" class="btn btn-secondary" data-close>Cancelar</button><button type="submit" class="btn btn-primary">${
      esc(submitLabel)
    }</button></footer></form></section></div>`;
  const close = () => {
    root.innerHTML = "";
    document.removeEventListener("keydown", keyHandler);
  };
  const keyHandler = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", keyHandler);
  root.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", close));
  root.querySelector(".modal-backdrop").addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-backdrop")) close();
  });
  root.querySelectorAll("[data-autocomplete]").forEach((autocomplete) => {
    const input = autocomplete.querySelector("input");
    const list = autocomplete.querySelector("[role=listbox]");
    const optionElements = [...list.querySelectorAll("[data-autocomplete-option]")];
    let activeIndex = -1;
    const visible = () => optionElements.filter((option) => !option.hidden);
    const closeOptions = () => {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      activeIndex = -1;
      optionElements.forEach((option) => option.classList.remove("active"));
    };
    const validate = () => {
      const exact = optionElements.some((option) => option.dataset.value === input.value);
      input.setCustomValidity(!input.value || exact ? "" : "Selecciona un país de la lista.");
    };
    const filterOptions = () => {
      const query = searchKey(input.value);
      let count = 0;
      optionElements.forEach((option) => {
        option.hidden = Boolean(query) && !option.dataset.searchKey.includes(query);
        if (!option.hidden) count++;
      });
      list.hidden = count === 0;
      input.setAttribute("aria-expanded", String(count > 0));
      activeIndex = -1;
      validate();
    };
    const choose = (option) => {
      input.value = option.dataset.value;
      input.setCustomValidity("");
      closeOptions();
      input.focus();
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const move = (direction) => {
      const available = visible();
      if (!available.length) return;
      activeIndex = (activeIndex + direction + available.length) % available.length;
      optionElements.forEach((option) => option.classList.remove("active"));
      available[activeIndex].classList.add("active");
      available[activeIndex].scrollIntoView({ block: "nearest" });
    };
    input.addEventListener("focus", filterOptions);
    input.addEventListener("input", filterOptions);
    input.addEventListener("blur", () => setTimeout(closeOptions, 100));
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (list.hidden) filterOptions();
        move(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        choose(visible()[activeIndex]);
      } else if (event.key === "Escape") {
        event.stopPropagation();
        closeOptions();
      }
    });
    optionElements.forEach((option) =>
      option.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        choose(option);
      })
    );
    validate();
  });
  root.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    submit.disabled = true;
    const output = Object.fromEntries(new FormData(event.currentTarget));
    fields.filter((field) => field.type === "number").forEach((field) => {
      output[field.name] = Number(output[field.name] || 0);
    });
    try {
      await onSubmit(output);
      close();
    } catch (error) {
      submit.disabled = false;
      toast(error.message || "No se han podido guardar los cambios.", "error");
    }
  });
  if (onDanger) {
    root.querySelector("[data-danger]")?.addEventListener("click", async () => {
      try {
        await onDanger();
        close();
      } catch (error) {
        toast(error.message || "No se ha podido eliminar.", "error");
      }
    });
  }
  onReady?.(root);
  setTimeout(() => root.querySelector("input, select, textarea")?.focus(), 0);
}

export function toast(message, tone = "success") {
  const root = document.querySelector("#toast-root");
  root.innerHTML = `<div class="toast ${tone === "error" ? "error" : ""}">${esc(message)}</div>`;
  setTimeout(() => {
    root.innerHTML = "";
  }, 2800);
}

export function emptyState(title, copy, action = "") {
  return `<div class="empty"><div class="empty-icon">${icon("pin")}</div><h3>${esc(title)}</h3><p>${
    esc(copy)
  }</p>${action}</div>`;
}
