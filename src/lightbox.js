const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function initializeImageLightbox(root = document) {
  const triggers = [...root.querySelectorAll("[data-lightbox]")];
  if (!triggers.length) return;

  triggers.forEach((trigger) => {
    if (trigger.dataset.lightboxReady) return;
    trigger.dataset.lightboxReady = "true";
    trigger.addEventListener("click", () => openLightbox(trigger, triggers));
  });
}

function openLightbox(initialTrigger, allTriggers) {
  document.querySelector("[data-lightbox-dialog]")?.remove();
  const group = initialTrigger.dataset.lightbox || "default";
  const items = allTriggers.filter((trigger) => (trigger.dataset.lightbox || "default") === group).map((trigger) => {
    const image = trigger.querySelector("img");
    return { src: image?.currentSrc || image?.src || "", alt: image?.alt || "Fotografía" };
  }).filter(({ src }) => src);
  if (!items.length) return;

  let index = Math.max(
    0,
    allTriggers.filter((trigger) => (trigger.dataset.lightbox || "default") === group)
      .indexOf(initialTrigger),
  );
  let scale = 1;
  let x = 0;
  let y = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  const previousOverflow = document.body.style.overflow;
  const dialog = document.createElement("div");
  dialog.className = "lightbox-backdrop";
  dialog.dataset.lightboxDialog = "";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Visor de fotografías");
  dialog.innerHTML =
    `<div class="lightbox-toolbar"><span data-lightbox-counter></span><button class="lightbox-control" type="button" data-lightbox-zoom-out aria-label="Alejar">−</button><button class="lightbox-control" type="button" data-lightbox-zoom-in aria-label="Ampliar">+</button><button class="lightbox-control" type="button" data-lightbox-close aria-label="Cerrar">×</button></div><div class="lightbox-stage" data-lightbox-stage><img draggable="false" alt=""></div>`;
  const image = dialog.querySelector("img");
  const stage = dialog.querySelector("[data-lightbox-stage]");
  const counter = dialog.querySelector("[data-lightbox-counter]");

  const transform = () => {
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    stage.classList.toggle("zoomed", scale > 1);
  };
  const resetTransform = () => {
    scale = 1;
    x = 0;
    y = 0;
    transform();
  };
  const show = (nextIndex) => {
    index = (nextIndex + items.length) % items.length;
    image.src = items[index].src;
    image.alt = items[index].alt;
    counter.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : "";
    resetTransform();
  };
  const zoom = (delta) => {
    scale = clamp(scale + delta, 1, 4);
    if (scale === 1) x = y = 0;
    transform();
  };
  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    document.body.style.overflow = previousOverflow;
    dialog.remove();
    initialTrigger.focus();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft" && items.length > 1) show(index - 1);
    if (event.key === "ArrowRight" && items.length > 1) show(index + 1);
  };

  dialog.querySelector("[data-lightbox-close]").addEventListener("click", close);
  dialog.querySelector("[data-lightbox-zoom-in]").addEventListener("click", () => zoom(.5));
  dialog.querySelector("[data-lightbox-zoom-out]").addEventListener("click", () => zoom(-.5));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  stage.addEventListener("dblclick", () => zoom(scale > 1 ? 1 - scale : 1));
  stage.addEventListener("click", (event) => {
    if (event.target === stage) close();
  });
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoom(event.deltaY < 0 ? .25 : -.25);
  }, { passive: false });
  stage.addEventListener("pointerdown", (event) => {
    if (scale <= 1) return;
    dragging = true;
    startX = event.clientX - x;
    startY = event.clientY - y;
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    x = event.clientX - startX;
    y = event.clientY - startY;
    transform();
  });
  stage.addEventListener("pointerup", () => dragging = false);
  stage.addEventListener("pointercancel", () => dragging = false);
  document.addEventListener("keydown", onKeydown);
  document.body.style.overflow = "hidden";
  document.body.append(dialog);
  show(index);
  dialog.querySelector("[data-lightbox-close]").focus();
}
