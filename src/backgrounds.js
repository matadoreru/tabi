export const PLACE_BACKGROUND_MODES = Object.freeze({
  AUTO: "auto",
  IMAGE: "image",
  COLOR: "color",
  EMOJI: "emoji",
});

const VALID_MODES = new Set(Object.values(PLACE_BACKGROUND_MODES));
const SAFE_COLOR = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/-]+\))$/i;

export function normalizePlaceAppearance(place = {}) {
  const requestedMode = String(place.backgroundMode || "").toLowerCase();
  return {
    mode: VALID_MODES.has(requestedMode) ? requestedMode : PLACE_BACKGROUND_MODES.AUTO,
    automaticImage: String(place.photoUrl || ""),
    customImage: String(place.backgroundImage || ""),
    color: SAFE_COLOR.test(String(place.backgroundColor || "")) ? String(place.backgroundColor) : "",
    emoji: String(place.backgroundEmoji || ""),
  };
}

export function resolvePlaceBackground(place = {}, fallbackEmoji = "📍") {
  const appearance = normalizePlaceAppearance(place);
  if (appearance.mode === PLACE_BACKGROUND_MODES.IMAGE && appearance.customImage) {
    return { type: "image", value: appearance.customImage, automatic: false };
  }
  if (appearance.mode === PLACE_BACKGROUND_MODES.COLOR && appearance.color) {
    return { type: "color", value: appearance.color, automatic: false };
  }
  if (appearance.mode === PLACE_BACKGROUND_MODES.EMOJI) {
    return { type: "emoji", value: appearance.emoji || fallbackEmoji, automatic: false };
  }
  if (appearance.mode === PLACE_BACKGROUND_MODES.AUTO && appearance.automaticImage) {
    return { type: "image", value: appearance.automaticImage, automatic: true };
  }
  return { type: "fallback", value: appearance.emoji || fallbackEmoji, automatic: false };
}
