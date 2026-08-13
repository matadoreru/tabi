import { googlePlacePhotoResponse } from "./google-maps.js";

function assertEquals(actual, expected) {
  if (actual !== expected) throw new Error(`Esperado ${expected}; recibido ${actual}`);
}

Deno.test("sirve fotografías de Places sin exponer la clave al navegador", async () => {
  let requestedUrl;
  const response = await googlePlacePhotoResponse(
    "places/demo/photos/first",
    "server-key",
    (url) => {
      requestedUrl = url;
      return Promise.resolve(Response.json({ photoUri: "https://lh3.googleusercontent.com/photo" }));
    },
  );
  assertEquals(response.status, 302);
  assertEquals(response.headers.get("location"), "https://lh3.googleusercontent.com/photo");
  assertEquals(requestedUrl.hostname, "places.googleapis.com");
  assertEquals(requestedUrl.searchParams.get("key"), "server-key");
  assertEquals(requestedUrl.searchParams.get("skipHttpRedirect"), "true");
});

Deno.test("rechaza referencias de fotografías externas", async () => {
  try {
    await googlePlacePhotoResponse("https://evil.example/photo", "server-key");
  } catch (error) {
    assertEquals(error.code, "INVALID_PLACE_PHOTO");
    return;
  }
  throw new Error("La referencia externa debería rechazarse");
});
