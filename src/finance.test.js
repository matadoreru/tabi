import { entityContractIssues } from "./contracts.js";
import { canonicalBudgetSummary, entityFinancialTransactions, projectFinancialTransactions } from "./finance.js";
import { allocateMoney, convertMoney, createMoney, decimalToMinor, minorToDecimal } from "./money.js";

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}; recibido ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error("Se esperaba que la función fallase.");
}

Deno.test("Money conserva precisión decimal y reglas de moneda", () => {
  assertEquals(decimalToMinor("12.345", "EUR"), "1235");
  assertEquals(decimalToMinor("12500", "JPY"), "12500");
  assertEquals(minorToDecimal("1235", "EUR"), "12.35");
  assertThrows(() => createMoney("abc", "EUR"));
});

Deno.test("el reparto exacto asigna también el residuo", () => {
  const parts = allocateMoney(createMoney("10.00", "EUR"), [1, 1, 1]);
  assertEquals(parts.map((part) => part.minorUnits), ["333", "333", "334"]);
});

Deno.test("la conversión Money redondea una sola vez en la moneda de destino", () => {
  assertEquals(convertMoney(createMoney("10.01", "EUR"), "JPY", "162.345").minorUnits, "1625");
  assertEquals(convertMoney(createMoney("1250", "JPY"), "EUR", "0.0058").minorUnits, "725");
});

Deno.test("los contratos comparten errores estructurales entre cliente y servidor", () => {
  assertEquals(entityContractIssues("expenses", { title: "", actualAmount: -1 }).map((issue) => issue.code), [
    "REQUIRED",
    "INVALID_AMOUNT",
  ]);
  assertEquals(
    entityContractIssues("expenses", {
      title: "Cena",
      splits: [{ memberUserId: "usr_1", amountMinor: "no" }],
    })[0].code,
    "INVALID_SPLIT",
  );
});

Deno.test("la proyección financiera incluye reservas y evita reinterpretar importes", () => {
  const trip = { currency: "EUR", budget: 1000, travelers: 2 };
  const transactions = projectFinancialTransactions(trip, {
    expenses: [{ id: "e1", title: "Cena", actualAmount: 30, estimatedAmount: 50, currency: "EUR" }],
    reservations: [{
      id: "r1",
      title: "Entrada",
      type: "Actividad",
      price: 40,
      paidAmount: 10,
      paymentStatus: "Parcial",
      currency: "EUR",
    }],
  });
  const summary = canonicalBudgetSummary(
    trip,
    transactions,
    (money) => Number(minorToDecimal(money.minorUnits, money.currency)),
  );
  assertEquals(summary.spent, 40);
  assertEquals(summary.committed, 50);
  assertEquals(summary.remaining, 960);
});

Deno.test("proyecta alojamientos antiguos pagados aunque no tengan paidAmount", () => {
  const transactions = entityFinancialTransactions("stays", {
    id: "stay-legacy",
    name: "Hotel",
    price: 12500,
    currency: "JPY",
    paymentStatus: "Pagado",
    checkInDate: "2026-09-17",
  }, "JPY");

  assertEquals(transactions, [{
    key: "stays:stay-legacy:paid",
    sourceCollection: "stays",
    sourceId: "stay-legacy",
    kind: "paid",
    category: "Alojamiento",
    state: "confirmed",
    amount: { currency: "JPY", minorUnits: "12500", scale: 0 },
    payerId: null,
    occurredOn: "2026-09-17",
    title: "Hotel",
    exchange: null,
  }]);
});
