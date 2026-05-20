import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge/utilities";

let app = null;
let initError = null;

export function initAppBridge() {
  if (app || initError) return app;
  const params = new URLSearchParams(window.location.search);
  const host = params.get("host");
  const apiKey = process.env.REACT_APP_SHOPIFY_API_KEY;

  if (!host) {
    initError = new Error("Missing host parameter. Open this app from your Shopify admin.");
    return null;
  }
  if (!apiKey) {
    initError = new Error("REACT_APP_SHOPIFY_API_KEY is not configured in the frontend build.");
    return null;
  }

  try {
    app = createApp({ apiKey, host, forceRedirect: true });
    return app;
  } catch (err) {
    initError = err;
    return null;
  }
}

export function getInitError() {
  return initError;
}

export function getShop() {
  const params = new URLSearchParams(window.location.search);
  return params.get("shop");
}

export async function authFetch(url, options = {}) {
  const instance = initAppBridge();
  if (!instance) {
    throw initError || new Error("App Bridge not initialized");
  }
  const token = await getSessionToken(instance);
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
