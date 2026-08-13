const testCommit = "0123456789abcdef0123456789abcdef01234567";
Deno.env.set("TABI_PUBLIC_ORIGIN", "https://tabi.example");
Deno.env.set("TABI_COMMIT_SHA", testCommit);
Deno.env.delete("TABI_GOOGLE_MAPS_API_KEY");
Deno.env.delete("TABI_GOOGLE_MAPS_MAP_ID");

const { api } = await import("./api.js");
const { handleError } = await import("./http.js");
const { db } = await import("./database.js");
const { googleMapsUrl, resolveGoogleMapsUrl } = await import("./google-maps.js");
const { getExchangeRate } = await import("./exchange-rates.js");

await db.exec(`
  TRUNCATE TABLE
    route_estimates, entity_comments, exchange_rates, reminders, notes, inspirations, reservations, transports, stays, funds, expenses, purchases, tasks, places,
    activities, trip_activity_logs, trip_invitations, trip_members, sessions, trips, users
  CASCADE
`);

function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}
function assertEquals(actual, expected, message = "") {
  if (actual !== expected) throw new Error(message || `Esperado ${expected}; recibido ${actual}`);
}
function assertAlmostEquals(actual, expected, tolerance, message = "") {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(message || `Esperado ${expected} ± ${tolerance}; recibido ${actual}`);
  }
}

Deno.test("valida y resuelve enlaces cortos de Google Maps sin aceptar redirecciones externas", async () => {
  assert(googleMapsUrl("https://www.google.es/maps/place/Madrid"));
  assertEquals(googleMapsUrl("https://example.com/maps/place/Madrid"), null);
  const resolved = await resolveGoogleMapsUrl(
    "https://maps.app.goo.gl/example",
    () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://www.google.com/maps/place/Madrid/@40.4168,-3.7038,15z" },
        }),
      ),
  );
  assertEquals(resolved, "https://www.google.com/maps/place/Madrid/@40.4168,-3.7038,15z");
  let rejected = false;
  try {
    await resolveGoogleMapsUrl(
      "https://maps.app.goo.gl/example",
      () => Promise.resolve(new Response(null, { status: 302, headers: { location: "https://evil.example/" } })),
    );
  } catch (error) {
    rejected = error.code === "INVALID_MAPS_URL";
  }
  assert(rejected, "Debe rechazar redirecciones fuera de Google Maps");
});

async function call(method, path, payload, cookie = "", origin = "https://tabi.example") {
  const request = new Request(`http://local${path}`, {
    method,
    headers: {
      ...(payload ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      origin,
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  let response;
  try {
    response = await api(request, path);
  } catch (error) {
    response = handleError(error);
  }
  const data = await response.json();
  return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie };
}

Deno.test("publica la versión de la aplicación sin requerir sesión", async () => {
  const version = await call("GET", "/api/version");
  assertEquals(version.status, 200);
  assertEquals(version.data.commit, testCommit);
  assertEquals(version.data.shortCommit, testCommit.slice(0, 8));
});

Deno.test("cachea tipos de cambio y conserva el último valor si el proveedor falla", async () => {
  const fresh = await getExchangeRate("USD", "EUR", {
    force: true,
    fetcher: () => Promise.resolve(Response.json({ date: "2026-08-13", base: "USD", quote: "EUR", rate: 0.91 })),
  });
  assertEquals(fresh.rate, 0.91);
  assertEquals(fresh.provider, "frankfurter");
  await db.prepare("UPDATE exchange_rates SET fetched_at=? WHERE base_currency='USD' AND quote_currency='EUR'").run(
    "2026-01-01T00:00:00.000Z",
  );
  const fallback = await getExchangeRate("USD", "EUR", {
    force: true,
    fetcher: () => Promise.reject(new Error("sin conexión")),
  });
  assertEquals(fallback.rate, 0.91);
  assertEquals(fallback.stale, true);
});

Deno.test({
  name: "flujo colaborativo aplica autenticación, capacidades, invitaciones y locking",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const rejectedOrigin = await call(
      "POST",
      "/api/auth/register",
      {
        name: "Intruso",
        username: "intruso",
        email: "intruso@example.com",
        password: "not relevant",
      },
      "",
      "https://evil.example",
    );
    assertEquals(rejectedOrigin.status, 403, "Debe rechazar mutaciones desde un origen público distinto");

    const weakRegistration = await call("POST", "/api/auth/register", {
      name: "Débil",
      username: "debil",
      email: "debil@example.com",
      password: "abc123",
    });
    assertEquals(weakRegistration.status, 422);
    assertEquals(weakRegistration.data.error.code, "WEAK_PASSWORD");

    const owner = await call("POST", "/api/auth/register", {
      name: "Hortensi",
      username: "hortensi",
      email: "hortensi@example.com",
      password: "correct horse battery staple",
    });
    assertEquals(owner.status, 201);
    assert(owner.cookie.startsWith("tabi_session="));
    const stored = await db.prepare("SELECT password_hash,password_salt FROM users WHERE email=?").get(
      "hortensi@example.com",
    );
    assert(stored.password_hash !== "correct horse battery staple", "La contraseña nunca debe persistirse en claro");
    assert(stored.password_salt.length > 16);
    const mapsConfig = await call("GET", "/api/config/maps", null, owner.cookie);
    assertEquals(mapsConfig.status, 200);
    assertEquals(mapsConfig.data.enabled, false);

    const created = await call("POST", "/api/trips", {
      name: "Japón 2026",
      emoji: "🇯🇵",
      country: "Japón",
      startDate: "2026-09-17",
      endDate: "2026-10-12",
      travelers: 2,
      budget: 600000,
      currency: "JPY",
      exchangeRate: 0.0061,
    }, owner.cookie);
    assertEquals(created.status, 201);
    assertEquals(created.data.trip.exchangeRate, 0.0061);
    const tripId = created.data.trip.id;
    const place = await call(
      "POST",
      `/api/trips/${tripId}/places`,
      {
        name: "Museo Ghibli",
        city: "Tokio",
        markerIcon: "🏛️",
        admission: "Entrada de pago",
        ticketPrice: 1000,
        link: "https://www.google.com/maps/place/Museo+Ghibli/@35.6962,139.5704,17z",
      },
      owner.cookie,
    );
    assertEquals(place.status, 201);
    assertEquals(place.data.item.version, 1);
    assertEquals(place.data.item.markerIcon, "🏛️");
    const duplicatePlaceName = await call(
      "POST",
      `/api/trips/${tripId}/places`,
      { name: " museo-ghibli ", city: "TOKÍO" },
      owner.cookie,
    );
    assertEquals(duplicatePlaceName.status, 409);
    assertEquals(duplicatePlaceName.data.error.code, "PLACE_EXISTS");
    assertEquals(duplicatePlaceName.data.error.details.duplicateId, place.data.item.id);
    const duplicatePlaceLink = await call(
      "POST",
      `/api/trips/${tripId}/places`,
      {
        name: "Estudio de animación",
        city: "Mitaka",
        link: "https://maps.google.es/maps/place/Museo+Ghibli/@35.6962,139.5704,15z?hl=ja",
      },
      owner.cookie,
    );
    assertEquals(duplicatePlaceLink.status, 409);
    const stay = await call(
      "POST",
      `/api/trips/${tripId}/stays`,
      {
        name: "Hotel de prueba",
        city: "Tokio",
        platform: "Booking",
        bookingStatus: "Confirmada",
        checkInDate: "2026-09-18",
        checkOutDate: "2026-09-20",
        checkInTime: "15:00",
        checkOutTime: "11:00",
        luggageStorage: "Antes y después",
        luggageNotes: "Avisar en recepción",
      },
      owner.cookie,
    );
    assertEquals(stay.status, 201);
    assertEquals(stay.data.item.platform, "Booking");
    const invalidStay = await call(
      "POST",
      `/api/trips/${tripId}/stays`,
      {
        name: "Viaje temporal",
        city: "Osaka",
        platform: "Airbnb",
        checkInDate: "2026-09-20",
        checkOutDate: "2026-09-19",
      },
      owner.cookie,
    );
    assertEquals(invalidStay.status, 422);
    assertEquals(invalidStay.data.error.code, "INVALID_STAY_DATES");
    const inspiration = await call(
      "POST",
      `/api/trips/${tripId}/inspirations`,
      { url: "https://www.instagram.com/reel/ABC123/", category: "Comida", note: "Probar este restaurante" },
      owner.cookie,
    );
    assertEquals(inspiration.status, 201);
    assertEquals(inspiration.data.item.url, "https://www.instagram.com/reel/ABC123/");
    const storedInspiration = (await db.prepare("SELECT data FROM inspirations WHERE id=?").get(
      inspiration.data.item.id,
    )).data;
    assertEquals(storedInspiration.url, "https://www.instagram.com/reel/ABC123/");
    assertEquals(storedInspiration.category, "Comida");
    assertEquals(storedInspiration.note, "Probar este restaurante");
    assertEquals(storedInspiration.watched, false);
    const watchedInspiration = await call(
      "PATCH",
      `/api/trips/${tripId}/inspirations/${inspiration.data.item.id}`,
      { watched: true, version: 1 },
      owner.cookie,
    );
    assertEquals(watchedInspiration.status, 200);
    assertEquals(watchedInspiration.data.item.watched, true);
    const duplicateInspiration = await call(
      "POST",
      `/api/trips/${tripId}/inspirations`,
      { url: "https://www.instagram.com/reel/ABC123/" },
      owner.cookie,
    );
    assertEquals(duplicateInspiration.status, 409);
    const invalidInspiration = await call(
      "POST",
      `/api/trips/${tripId}/inspirations`,
      { url: "https://example.com/video" },
      owner.cookie,
    );
    assertEquals(invalidInspiration.status, 422);
    const fund = await call("POST", `/api/trips/${tripId}/funds`, {
      title: "Fondo inicial",
      contributor: "Hortensi",
      date: "2026-08-09",
      currency: "JPY",
      amount: 100000,
    }, owner.cookie);
    assertEquals(fund.status, 201);
    assertEquals(fund.data.item.exchangeRateSnapshot, 1);
    const euroExpense = await call("POST", `/api/trips/${tripId}/expenses`, {
      title: "Seguro",
      currency: "EUR",
      actualAmount: 61,
      paymentStatus: "Pagado",
    }, owner.cookie);
    assertEquals(euroExpense.status, 201);
    assertEquals(euroExpense.data.item.exchangeRateBase, "EUR");
    assertEquals(euroExpense.data.item.exchangeRateQuote, "JPY");
    assertAlmostEquals(euroExpense.data.item.exchangeRateSnapshot, 1 / 0.0061, 0.0001);

    const invitation = await call("POST", `/api/trips/${tripId}/invitations`, {
      role: "viewer",
      expiryDays: 7,
      maxUses: 1,
    }, owner.cookie);
    assertEquals(invitation.status, 201);
    const token = invitation.data.invitation.token;
    assert(token.length >= 40);
    const storedInvitation = await db.prepare("SELECT token_hash FROM trip_invitations WHERE id=?").get(
      invitation.data.invitation.id,
    );
    assert(storedInvitation.token_hash !== token, "El token de invitación debe almacenarse como hash");

    const alex = await call("POST", "/api/auth/register", {
      name: "Alex",
      username: "alex",
      email: "alex@example.com",
      password: "abc123-secure",
    });
    const usernameLogin = await call("POST", "/api/auth/login", { identifier: "alex", password: "abc123-secure" });
    assertEquals(usernameLogin.status, 200, "Debe ser posible iniciar sesión mediante el nombre de usuario");
    const accepted = await call("POST", `/api/invite/${token}/accept`, {}, alex.cookie);
    assertEquals(accepted.status, 200);
    assertEquals(accepted.data.tripId, tripId);
    const comment = await call("POST", `/api/trips/${tripId}/comments`, {
      entityCollection: "places",
      entityId: place.data.item.id,
      body: "@alex revisa el horario",
    }, owner.cookie);
    assertEquals(comment.status, 201);
    assertEquals(comment.data.comment.mentions[0], alex.data.user.id);
    const comments = await call(
      "GET",
      `/api/trips/${tripId}/comments?collection=places&entityId=${place.data.item.id}`,
      null,
      alex.cookie,
    );
    assertEquals(comments.status, 200);
    assertEquals(comments.data.comments.length, 1);
    const viewerComment = await call("POST", `/api/trips/${tripId}/comments`, {
      entityCollection: "places",
      entityId: place.data.item.id,
      body: "No permitido",
    }, alex.cookie);
    assertEquals(viewerComment.status, 403);
    const duplicateUse = await call("POST", `/api/invite/${token}/accept`, {}, alex.cookie);
    assertEquals(duplicateUse.status, 410);
    const viewerWrite = await call("POST", `/api/trips/${tripId}/activities`, { title: "No permitido" }, alex.cookie);
    assertEquals(viewerWrite.status, 403);
    const roleChange = await call(
      "PATCH",
      `/api/trips/${tripId}/members/${alex.data.user.id}`,
      { role: "editor" },
      owner.cookie,
    );
    assertEquals(roleChange.status, 200);
    const sharedExpense = await call("POST", `/api/trips/${tripId}/expenses`, {
      title: "Cena compartida",
      currency: "JPY",
      actualAmount: 1001,
      paymentStatus: "Pagado",
      paidByUserId: owner.data.user.id,
      splits: [{ memberUserId: owner.data.user.id }, { memberUserId: alex.data.user.id }],
    }, owner.cookie);
    assertEquals(sharedExpense.status, 201);
    assertEquals(sharedExpense.data.item.money.actualAmount.minorUnits, "1001");
    assertEquals(sharedExpense.data.expenseSplits.length, 2);
    assertEquals(sharedExpense.data.settlementTransfers.length, 1);
    assertEquals(
      sharedExpense.data.expenseSplits.reduce((sum, split) => sum + Number(split.amount.minorUnits), 0),
      1001,
    );
    const reservationCost = await call("POST", `/api/trips/${tripId}/reservations`, {
      title: "TeamLab",
      type: "Actividad",
      date: "2026-09-22",
      currency: "JPY",
      price: 5000,
      paidAmount: 1000,
      paymentStatus: "Parcial",
      status: "Confirmada",
    }, owner.cookie);
    assertEquals(reservationCost.status, 201);
    assert(
      reservationCost.data.financialTransactions.some((entry) =>
        entry.sourceId === reservationCost.data.item.id && entry.kind === "committed" &&
        entry.amount.minorUnits === "4000"
      ),
      "Las reservas deben participar en la proyección financiera",
    );
    const purchasePhoto = await call("POST", `/api/trips/${tripId}/purchases`, {
      product: "Amuleto",
      currency: "JPY",
      actualPrice: 700,
      photo:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    }, owner.cookie);
    assertEquals(purchasePhoto.status, 201);
    assertEquals(purchasePhoto.data.item.photo.startsWith("/api/media/"), true);
    assertEquals(purchasePhoto.data.item.photo.includes("base64"), false);
    const mediaRequest = new Request(`http://local${purchasePhoto.data.item.photo}`, {
      headers: { cookie: owner.cookie, origin: "https://tabi.example" },
    });
    const media = await api(mediaRequest, new URL(mediaRequest.url).pathname);
    assertEquals(media.status, 200);
    assertEquals(media.headers.get("content-type"), "image/png");
    assert((await media.arrayBuffer()).byteLength > 60);
    const editorWrite = await call("POST", `/api/trips/${tripId}/activities`, {
      title: "Plan compartido",
      date: "2026-09-18",
      start: "09:00",
      end: "10:00",
      placeId: place.data.item.id,
    }, alex.cookie);
    assertEquals(editorWrite.status, 201);
    const linkedPlaceActivity = await call("POST", `/api/trips/${tripId}/activities`, {
      title: "Visitar el museo",
      activityKind: "Lugar",
      placeId: place.data.item.id,
      date: "2026-09-18",
      start: "11:00",
      end: "12:00",
    }, owner.cookie);
    assertEquals(linkedPlaceActivity.status, 201);
    const linkedStayActivity = await call("POST", `/api/trips/${tripId}/activities`, {
      title: "Check-in",
      activityKind: "Hospedaje",
      stayId: stay.data.item.id,
      date: "2026-09-18",
      start: "15:00",
      end: "15:30",
    }, owner.cookie);
    assertEquals(linkedStayActivity.status, 201);
    const missingActivityLink = await call("POST", `/api/trips/${tripId}/activities`, {
      title: "Transporte sin seleccionar",
      activityKind: "Transporte",
      date: "2026-09-18",
      start: "16:00",
      end: "17:00",
    }, owner.cookie);
    assertEquals(missingActivityLink.status, 422);
    assertEquals(missingActivityLink.data.error.code, "MISSING_ACTIVITY_LINK");

    const note = await call("POST", `/api/trips/${tripId}/notes`, {
      title: "Recordatorio",
      content: "Llevar efectivo",
      order: 1,
    }, owner.cookie);
    assertEquals(note.status, 201);

    const archiveResponse = await call("GET", `/api/trips/${tripId}/archive`, null, owner.cookie);
    assertEquals(archiveResponse.status, 200);
    assertEquals(archiveResponse.data.format, "tabi-trip");
    assertEquals(archiveResponse.data.schemaVersion, 3);
    assertEquals(archiveResponse.data.collections.places[0].id, place.data.item.id);
    assertEquals(archiveResponse.data.collections.notes[0].title, "Recordatorio");
    assertEquals(archiveResponse.data.collections.places[0].version, undefined);
    archiveResponse.data.trip.name = "Japón editado desde archivo";
    archiveResponse.data.collections.places[0].description = "Cambio externo";
    archiveResponse.data.collections.places.push({ id: "place_new_1", name: "Kinkaku-ji", city: "Kioto" });
    archiveResponse.data.collections.activities.push({
      title: "Visitar Kinkaku-ji",
      date: "2026-09-19",
      start: "10:00",
      end: "11:00",
      placeId: "place_new_1",
    });
    archiveResponse.data.collections.tasks.push({ title: "Preparar maletas", status: "Pendiente" });
    const importedArchive = await call(
      "POST",
      `/api/trips/${tripId}/archive`,
      { archive: archiveResponse.data },
      owner.cookie,
    );
    assertEquals(importedArchive.status, 200);
    assertEquals(importedArchive.data.trip.name, "Japón editado desde archivo");
    const afterArchive = await call("GET", `/api/trips/${tripId}/bootstrap`, null, owner.cookie);
    assertEquals(afterArchive.data.places[0].description, "Cambio externo");
    assertEquals(afterArchive.data.tasks[0].title, "Preparar maletas");
    assertEquals(afterArchive.data.notes[0].content, "Llevar efectivo");
    assertEquals(afterArchive.data.purchases[0].photo.startsWith("/api/media/"), true);
    assert(
      afterArchive.data.financialTransactions.some((entry) => entry.sourceCollection === "reservations"),
      "La importación debe reconstruir la proyección financiera",
    );
    assertEquals(afterArchive.data.activities[0].title, "Plan compartido");
    assertEquals(afterArchive.data.activities[0].placeId, place.data.item.id);
    assertEquals(
      afterArchive.data.activities.find(({ title }) => title === "Visitar Kinkaku-ji").placeId,
      "place_new_1",
    );
    const template = await call("POST", `/api/trips/${tripId}/duplicate`, {
      name: "Japón reutilizable",
      startDate: "2027-09-17",
      asTemplate: true,
      resetProgress: true,
      collections: ["activities", "places", "tasks", "notes"],
    }, owner.cookie);
    assertEquals(template.status, 201);
    const templateBootstrap = await call("GET", `/api/trips/${template.data.tripId}/bootstrap`, null, owner.cookie);
    assertEquals(templateBootstrap.data.trip.isTemplate, true);
    assertEquals(templateBootstrap.data.trip.startDate, "2027-09-17");
    assertEquals(templateBootstrap.data.activities[0].date.startsWith("2027"), true);
    assertEquals(templateBootstrap.data.purchases.length, 0);

    const outsider = await call("POST", "/api/auth/register", {
      name: "Laura",
      username: "laura",
      email: "laura@example.com",
      password: "yet another secure password",
    });
    const idor = await call("PATCH", `/api/trips/${tripId}/places/${place.data.item.id}`, {
      name: "Ataque",
      version: 1,
    }, outsider.cookie);
    assertEquals(idor.status, 404, "Un usuario ajeno no debe poder distinguir viajes existentes");
    const otherTrip = await call("POST", "/api/trips", {
      name: "Italia 2027",
      startDate: "2027-05-04",
      endDate: "2027-05-12",
    }, outsider.cookie);
    const crossTripResource = await call(
      "PATCH",
      `/api/trips/${otherTrip.data.trip.id}/places/${place.data.item.id}`,
      { name: "Ataque cruzado", version: 1 },
      outsider.cookie,
    );
    assertEquals(crossTripResource.status, 404, "Un recurso nunca debe resolverse fuera del trip_id de la ruta");

    const firstUpdate = await call("PATCH", `/api/trips/${tripId}/places/${place.data.item.id}`, {
      name: "Museo Ghibli actualizado",
      version: 1,
    }, owner.cookie);
    assertEquals(firstUpdate.status, 200);
    assertEquals(firstUpdate.data.item.version, 2);
    const staleUpdate = await call("PATCH", `/api/trips/${tripId}/places/${place.data.item.id}`, {
      name: "Sobrescritura",
      version: 1,
    }, owner.cookie);
    assertEquals(staleUpdate.status, 409);
    assertEquals(staleUpdate.data.error.code, "VERSION_CONFLICT");

    const disposableTask = await call("POST", `/api/trips/${tripId}/tasks`, {
      title: "Tarea temporal",
      phase: "Antes",
      status: "Pendiente",
      assigneeId: alex.data.user.id,
    }, owner.cookie);
    assertEquals(disposableTask.status, 201);
    assertEquals(disposableTask.data.item.phase, undefined, "Las tareas ya no deben conservar fases");
    const updatedTask = await call("PATCH", `/api/trips/${tripId}/tasks/${disposableTask.data.item.id}`, {
      notes: "Información actualizada",
      version: 1,
    }, owner.cookie);
    assertEquals(updatedTask.status, 200);
    const staleDelete = await call(
      "DELETE",
      `/api/trips/${tripId}/tasks/${disposableTask.data.item.id}`,
      { version: 1 },
      owner.cookie,
    );
    assertEquals(staleDelete.status, 409, "No debe eliminar una tarea modificada por otra persona");
    const currentDelete = await call(
      "DELETE",
      `/api/trips/${tripId}/tasks/${disposableTask.data.item.id}`,
      { version: 2 },
      owner.cookie,
    );
    assertEquals(currentDelete.status, 200);

    const logs = await call("GET", `/api/trips/${tripId}/bootstrap`, null, owner.cookie);
    assertEquals(logs.status, 200);
    assertEquals(logs.data.funds[0].amount, 100000);
    assert(logs.data.logs.some((entry) => entry.action === "entity.updated"));
    assert(logs.data.financialTransactions.length > 0);
    assert(logs.data.settlementBalances.some((balance) => balance.memberUserId === owner.data.user.id));

    const sessions = await call("GET", "/api/auth/sessions", null, owner.cookie);
    assertEquals(sessions.status, 200);
    assert(sessions.data.sessions.some((entry) => entry.current));
    const revokeOthers = await call("POST", "/api/auth/sessions/revoke-others", {}, owner.cookie);
    assertEquals(revokeOthers.status, 200);

    const recoveryUser = await call("POST", "/api/auth/register", {
      name: "Recuperación",
      username: "recovery",
      email: "recovery@example.com",
      password: "initial-secure-password",
    });
    assertEquals(recoveryUser.status, 201);
    const recoveryCodes = await call("POST", "/api/auth/recovery-codes", {}, recoveryUser.cookie);
    assertEquals(recoveryCodes.status, 201);
    assertEquals(recoveryCodes.data.codes.length, 8);
    const storedRecovery = await db.prepare("SELECT code_hash FROM account_recovery_codes WHERE user_id=? LIMIT 1").get(
      recoveryUser.data.user.id,
    );
    assert(
      !recoveryCodes.data.codes.includes(storedRecovery.code_hash),
      "Los códigos deben persistirse únicamente como hash",
    );
    const recovered = await call("POST", "/api/auth/recover", {
      identifier: "recovery",
      recoveryCode: recoveryCodes.data.codes[0],
      newPassword: "new-secure-password",
    });
    assertEquals(recovered.status, 200);
    assertEquals(
      (await call("POST", "/api/auth/recover", {
        identifier: "recovery",
        recoveryCode: recoveryCodes.data.codes[0],
        newPassword: "another-secure-password",
      })).status,
      422,
    );
    assertEquals((await call("GET", "/api/me", null, recoveryUser.cookie)).status, 401);
    assertEquals(
      (await call("POST", "/api/auth/login", { identifier: "recovery", password: "new-secure-password" })).status,
      200,
    );
  },
});
