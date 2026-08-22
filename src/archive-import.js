function syntaxLocation(text, message) {
  const positionMatch = String(message).match(/(?:position|posición)\s+(\d+)/i);
  const contextMatch = String(message).match(/\.\.\."([\s\S]+)" is not valid JSON$/i);
  const tokenMatch = String(message).match(/Unexpected token '([^']+)'/i);
  let inferredPosition = null;
  if (!positionMatch && contextMatch) {
    const contextStart = text.lastIndexOf(contextMatch[1]);
    const tokenOffset = tokenMatch ? contextMatch[1].lastIndexOf(tokenMatch[1]) : 0;
    if (contextStart >= 0) inferredPosition = contextStart + Math.max(0, tokenOffset);
  }
  if (positionMatch || inferredPosition !== null) {
    const position = Math.min(positionMatch ? Number(positionMatch[1]) : inferredPosition, text.length);
    const before = text.slice(0, position);
    const line = before.split("\n").length;
    const column = position - before.lastIndexOf("\n");
    return { line, column, source: text.split("\n")[line - 1] || "" };
  }
  const lineColumnMatch = String(message).match(/line\s+(\d+)(?:\s+column\s+(\d+))?/i);
  if (!lineColumnMatch) return null;
  const line = Number(lineColumnMatch[1]);
  return {
    line,
    column: lineColumnMatch[2] ? Number(lineColumnMatch[2]) : null,
    source: text.split("\n")[line - 1] || "",
  };
}

export function parseTripArchiveJson(text, filename = "") {
  try {
    return JSON.parse(text);
  } catch (error) {
    const location = syntaxLocation(text, error.message);
    const file = filename ? ` “${filename}”` : "";
    const where = location
      ? ` en la línea ${location.line}${location.column ? `, columna ${location.column}` : ""}`
      : "";
    const source = location?.source.trim().slice(0, 180);
    const detail = source ? `\nContenido cercano: ${source}` : "";
    const syntaxError = new SyntaxError(`El archivo${file} contiene JSON no válido${where}.${detail}`);
    syntaxError.cause = error;
    syntaxError.location = location;
    throw syntaxError;
  }
}

export function tripArchiveCompatibilityIssue(archive) {
  if (!archive || typeof archive !== "object" || Array.isArray(archive)) {
    return "La raíz del archivo debe ser un objeto JSON.";
  }
  if (archive.format !== "tabi-trip") {
    return `El campo “format” debe ser “tabi-trip”; se ha recibido ${
      JSON.stringify(archive.format) ?? "ningún valor"
    }.`;
  }
  if (![1, 2, 3].includes(archive.schemaVersion)) {
    return `La versión del archivo no es compatible. “schemaVersion” debe ser 1, 2 o 3; se ha recibido ${
      JSON.stringify(archive.schemaVersion) ?? "ningún valor"
    }.`;
  }
  if (!archive.trip || typeof archive.trip !== "object" || Array.isArray(archive.trip)) {
    return "Falta el objeto “trip” con los datos generales del viaje.";
  }
  if (!archive.collections || typeof archive.collections !== "object" || Array.isArray(archive.collections)) {
    return "Falta el objeto “collections” con el contenido del viaje.";
  }
  return "";
}

export function formatArchiveImportError(error, filename = "") {
  const lines = [`No se ha podido importar${filename ? ` “${filename}”` : ""}.`];
  if (error?.message) lines.push(error.message);
  const context = error?.details?.archive;
  if (context?.path && !String(error.message || "").includes(context.path)) {
    lines.push(`Ubicación: ${context.path}${context.label ? ` (“${context.label}”)` : ""}`);
  }
  const issues = Array.isArray(error?.details?.issues) ? error.details.issues : [];
  if (issues.length) {
    lines.push("Campos con problemas:");
    for (const issue of issues.slice(0, 6)) {
      const path = issue.path || [context?.path, issue.field].filter(Boolean).join(".");
      lines.push(`• ${path || "elemento"}: ${issue.message}`);
    }
    if (issues.length > 6) lines.push(`• …y ${issues.length - 6} problema(s) más.`);
  } else if (context?.fields?.length) {
    const base = context.collection === undefined ? "trip" : `collections.${context.collection}[${context.index}]`;
    lines.push(`Campos relacionados: ${context.fields.map((field) => `${base}.${field}`).join(", ")}`);
  }
  if (error?.code && error.code !== "REQUEST_FAILED") lines.push(`Código: ${error.code}`);
  return [...new Set(lines)].join("\n");
}
