const testDatabase = `/tmp/tabi-test-${Deno.pid}-${Date.now()}.sqlite`;
Deno.env.set("TABI_DATABASE_PATH", testDatabase);
Deno.env.set("TABI_PUBLIC_ORIGIN", "https://tabi.example");
Deno.env.delete("TABI_GOOGLE_MAPS_API_KEY");
Deno.env.delete("TABI_GOOGLE_MAPS_MAP_ID");

const { api } = await import("./api.js");
const { handleError } = await import("./http.js");
const { db } = await import("./database.js");
const { googleMapsUrl, resolveGoogleMapsUrl } = await import("./google-maps.js");

function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}
function assertEquals(actual, expected, message = "") {
  if (actual !== expected) throw new Error(message || `Esperado ${expected}; recibido ${actual}`);
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

    const owner = await call("POST", "/api/auth/register", {
      name: "Hortensi",
      username: "hortensi",
      email: "hortensi@example.com",
      password: "correct horse battery staple",
    });
    assertEquals(owner.status, 201);
    assert(owner.cookie.startsWith("tabi_session="));
    const stored = db.prepare("SELECT password_hash,password_salt FROM users WHERE email=?").get(
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
    }, owner.cookie);
    assertEquals(created.status, 201);
    const tripId = created.data.trip.id;
    const place = await call(
      "POST",
      `/api/trips/${tripId}/places`,
      { name: "Museo Ghibli", city: "Tokio" },
      owner.cookie,
    );
    assertEquals(place.status, 201);
    assertEquals(place.data.item.version, 1);
    const inspiration = await call(
      "POST",
      `/api/trips/${tripId}/inspirations`,
      { url: "https://www.instagram.com/reel/ABC123/", category: "Comida", note: "Probar este restaurante" },
      owner.cookie,
    );
    assertEquals(inspiration.status, 201);
    assertEquals(inspiration.data.item.url, "https://www.instagram.com/reel/ABC123/");
    assertEquals(
      db.prepare("SELECT data FROM inspirations WHERE id=?").get(inspiration.data.item.id).data,
      '{"url":"https://www.instagram.com/reel/ABC123/","category":"Comida","note":"Probar este restaurante"}',
      "La inspiración debe guardar el enlace, la categoría y la nota",
    );
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

    const invitation = await call("POST", `/api/trips/${tripId}/invitations`, {
      role: "viewer",
      expiryDays: 7,
      maxUses: 1,
    }, owner.cookie);
    assertEquals(invitation.status, 201);
    const token = invitation.data.invitation.token;
    assert(token.length >= 40);
    const storedInvitation = db.prepare("SELECT token_hash FROM trip_invitations WHERE id=?").get(
      invitation.data.invitation.id,
    );
    assert(storedInvitation.token_hash !== token, "El token de invitación debe almacenarse como hash");

    const alex = await call("POST", "/api/auth/register", {
      name: "Alex",
      username: "alex",
      email: "alex@example.com",
      password: "abc123",
    });
    const usernameLogin = await call("POST", "/api/auth/login", { identifier: "alex", password: "abc123" });
    assertEquals(usernameLogin.status, 200, "Debe ser posible iniciar sesión mediante el nombre de usuario");
    const accepted = await call("POST", `/api/invite/${token}/accept`, {}, alex.cookie);
    assertEquals(accepted.status, 200);
    assertEquals(accepted.data.tripId, tripId);
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
    const editorWrite = await call("POST", `/api/trips/${tripId}/activities`, {
      title: "Plan compartido",
      date: "2026-09-18",
      start: "09:00",
      end: "10:00",
    }, alex.cookie);
    assertEquals(editorWrite.status, 201);

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

    const logs = await call("GET", `/api/trips/${tripId}/bootstrap`, null, owner.cookie);
    assertEquals(logs.status, 200);
    assertEquals(logs.data.funds[0].amount, 100000);
    assert(logs.data.logs.some((entry) => entry.action === "entity.updated"));
  },
});
