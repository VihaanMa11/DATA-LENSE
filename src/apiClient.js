export async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let payload = {};

  if (text && contentType.includes("application/json")) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("API returned invalid JSON.");
    }
  } else if (text.trim().startsWith("<!doctype") || text.trim().startsWith("<html")) {
    throw new Error("API route returned the app HTML instead of JSON. Check the /api deployment rewrite.");
  } else if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text.slice(0, 160) };
    }
  }

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}
