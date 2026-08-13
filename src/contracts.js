import { isSupportedCurrency } from "./currency.js";

export const ENTITY_CONTRACTS = Object.freeze({
  activities: { required: ["title", "date", "start", "end"] },
  places: { required: ["name", "city"], money: ["ticketPrice"] },
  tasks: { required: ["title"] },
  purchases: { required: ["product"], money: ["estimatedPrice", "actualPrice", "maxBudget"] },
  expenses: { required: ["title"], money: ["estimatedAmount", "actualAmount"] },
  funds: { required: ["title", "amount"], money: ["amount"] },
  stays: { required: ["name", "checkInDate", "checkOutDate"], money: ["price", "paidAmount"] },
  transports: { required: ["origin", "destination", "departureDate"], money: ["price", "paidAmount"] },
  reservations: { required: ["title", "date"], money: ["price", "paidAmount"] },
  reminders: { required: ["title", "remindAt"] },
  inspirations: { required: ["url"] },
  notes: { required: ["title"] },
  proposals: { required: ["title"] },
  availabilities: { required: ["participantId", "startAt", "endAt"] },
  journalEntries: { required: ["date", "title"] },
  emergencyContacts: { required: ["name", "phone"] },
  locationShares: { required: ["latitude", "longitude", "expiresAt"] },
});

export const MONEY_FIELDS = Object.freeze(
  [...new Set(Object.values(ENTITY_CONTRACTS).flatMap((contract) => contract.money || [])), "ticketPrice"],
);

/** @typedef {{ field: string, code: string, message: string }} ContractIssue */

/** Browser/server shared structural validation. Domain-specific checks remain in domain services. */
export function entityContractIssues(collection, value) {
  const contract = ENTITY_CONTRACTS[collection];
  if (!contract) return [{ field: "collection", code: "UNSUPPORTED_ENTITY", message: "Entidad no soportada." }];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ field: "", code: "INVALID_ENTITY", message: "El elemento debe ser un objeto." }];
  }
  const issues = [];
  for (const field of contract.required) {
    if (!String(value[field] ?? "").trim()) issues.push({ field, code: "REQUIRED", message: "Campo obligatorio." });
  }
  if (value.currency && !isSupportedCurrency(value.currency)) {
    issues.push({ field: "currency", code: "UNSUPPORTED_CURRENCY", message: "Moneda no soportada." });
  }
  for (const field of contract.money || []) {
    if (value[field] === undefined || value[field] === "") continue;
    const amount = Number(value[field]);
    if (!Number.isFinite(amount) || amount < 0) {
      issues.push({ field, code: "INVALID_AMOUNT", message: "El importe debe ser un número positivo." });
    }
  }
  if (value.splits !== undefined) {
    if (!Array.isArray(value.splits) || value.splits.length > 100) {
      issues.push({ field: "splits", code: "INVALID_SPLITS", message: "El reparto no es válido." });
    } else {
      value.splits.forEach((split, index) => {
        if (
          !split || typeof split !== "object" ||
          (!split.participantId && !split.memberUserId && !String(split.participantName || "").trim())
        ) {
          issues.push({ field: `splits.${index}`, code: "INVALID_SPLIT", message: "Participante no válido." });
        }
        if (split?.amountMinor !== undefined && !/^\d+$/.test(String(split.amountMinor))) {
          issues.push({
            field: `splits.${index}.amountMinor`,
            code: "INVALID_SPLIT",
            message: "Importe de reparto no válido.",
          });
        }
        if (
          split?.percentage !== undefined &&
          (!Number.isFinite(Number(split.percentage)) || Number(split.percentage) < 0)
        ) {
          issues.push({ field: `splits.${index}.percentage`, code: "INVALID_SPLIT", message: "Porcentaje no válido." });
        }
        if (
          split?.weight !== undefined &&
          (!Number.isFinite(Number(split.weight)) || Number(split.weight) <= 0)
        ) {
          issues.push({ field: `splits.${index}.weight`, code: "INVALID_SPLIT", message: "Peso no válido." });
        }
      });
      const percentages = value.splits.filter((split) => split?.percentage !== undefined);
      if (
        percentages.length &&
        (percentages.length !== value.splits.length ||
          Math.abs(percentages.reduce((sum, split) => sum + Number(split.percentage), 0) - 100) > 0.001)
      ) {
        issues.push({
          field: "splits",
          code: "INVALID_SPLIT_PERCENTAGE",
          message: "Los porcentajes deben sumar 100 %.",
        });
      }
    }
  }
  return issues;
}

export function assertEntityContract(collection, value) {
  const issues = entityContractIssues(collection, value);
  if (issues.length) {
    const error = new TypeError(issues[0].message);
    error.code = issues[0].code;
    error.issues = issues;
    throw error;
  }
  return value;
}
