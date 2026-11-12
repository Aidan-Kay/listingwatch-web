import { api } from "./api";

export type PushStatus = "unsupported" | "needs-install" | "blocked" | "off" | "on";

/** Register the service worker (production builds only; the dev server doesn't build one). */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/** iPhones and iPads only allow push for web apps added to the home screen. */
function isIosBrowserTab(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !window.matchMedia("(display-mode: standalone)").matches;
}

export async function pushStatus(): Promise<PushStatus> {
  if (isIosBrowserTab()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !import.meta.env.PROD) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

/** Ask permission, subscribe this device and register it with the server. */
export async function enablePush(): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>("/push/vapid-key");
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) });
  await api("/push/subscriptions", { method: "POST", body: subscription.toJSON() });
  return "on";
}

export async function disablePush(): Promise<PushStatus> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api("/push/subscriptions", { method: "DELETE", body: { endpoint: subscription.endpoint } }).catch(() => {});
    await subscription.unsubscribe();
  }
  return "off";
}

function urlBase64ToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
