// Shared server code for Cloudflare Pages Functions (checkout, orders, tracking, emails).
// Prices and shipping are ALWAYS computed here from the published catalog, never trusted from the browser.

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

export const bad = (msg, status = 400) => json({ ok: false, error: msg }, status);

export async function loadCatalog(request, env) {
  const url = new URL("/catalog.json", request.url);
  const res = env.ASSETS ? await env.ASSETS.fetch(url) : await fetch(url);
  if (!res.ok) throw new Error("catalog unavailable");
  return res.json();
}

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export function shippingFor(shipping, subtotal, state) {
  const s = shipping || {};
  const zone = (s.zones || []).find((z) => (z.states || []).some((x) => x.toLowerCase() === String(state || "").toLowerCase()));
  const free = zone && zone.freeAbove != null && zone.freeAbove !== "" ? Number(zone.freeAbove) : Number(s.freeAbove || 0);
  if (free > 0 && subtotal >= free) return 0;
  return Number(zone ? zone.rate : s.defaultRate) || 0;
}

// items: [{id, colour, qty}] -> priced lines (throws Error with user-facing message)
export function priceCart(catalog, items, state) {
  if (!Array.isArray(items) || !items.length) throw new Error("Your cart is empty.");
  if (items.length > 50) throw new Error("Too many items in cart.");
  const byId = Object.fromEntries(catalog.products.map((p) => [p.id, p]));
  const lines = items.map((it) => {
    const p = byId[String(it.id)];
    if (!p) throw new Error("A product in your cart is no longer available. Please remove it.");
    if (!p.inStock) throw new Error(`${p.title} is sold out. Please remove it from your cart.`);
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1 && qty <= 20)) throw new Error("Quantity must be between 1 and 20.");
    let colour = String(it.colour || "");
    if (p.colours && p.colours.length) {
      if (!p.colours.includes(colour)) colour = p.colours[0];
    } else colour = "";
    return { id: p.id, title: p.title, colour, qty, price: p.price, lineTotal: p.price * qty };
  });
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  const shipping = shippingFor(catalog.shipping, subtotal, state);
  return { lines, subtotal, shipping, total: subtotal + shipping };
}

export function cleanCustomer(c = {}) {
  const t = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const cust = {
    name: t(c.name, 80), phone: t(c.phone, 20).replace(/[^\d+]/g, ""), email: t(c.email, 120).toLowerCase(),
    address: t(c.address, 300), city: t(c.city, 60), state: t(c.state, 60), pincode: t(c.pincode, 6),
  };
  let digits = cust.phone.replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (cust.name.length < 2) throw new Error("Please enter your full name.");
  if (!/^[6-9]\d{9}$/.test(digits)) throw new Error("Please enter a valid 10-digit mobile number.");
  cust.phone = digits;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cust.email)) throw new Error("Please enter a valid email address.");
  if (cust.address.length < 8) throw new Error("Please enter your full delivery address.");
  if (cust.city.length < 2) throw new Error("Please enter your city.");
  if (!INDIAN_STATES.includes(cust.state)) throw new Error("Please choose your state.");
  if (!/^[1-9]\d{5}$/.test(cust.pincode)) throw new Error("Please enter a valid 6-digit PIN code.");
  return cust;
}

export function newOrderId() {
  const r = crypto.getRandomValues(new Uint8Array(3));
  const rnd = Array.from(r, (b) => (b % 36).toString(36)).join("");
  return ("SW" + Date.now().toString(36).slice(-6) + rnd).toUpperCase();
}

// ---- crypto helpers
const enc = new TextEncoder();
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- Razorpay
export async function razorpayCreateOrder(env, { amountPaise, receipt, notes }) {
  const res = await fetch((env.RAZORPAY_API_BASE || "https://api.razorpay.com") + "/v1/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`),
    },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Payment gateway error: " + (data?.error?.description || res.status));
  return data;
}

// Razorpay notes: max 15 keys, 256 chars each
export function razorpayNotes(orderId, cust, priced) {
  const items = priced.lines.map((l) => `${l.qty}x ${l.title}${l.colour ? " (" + l.colour + ")" : ""}`).join("; ");
  const notes = {
    order_id: orderId, name: cust.name, phone: cust.phone, email: cust.email,
    address: cust.address.slice(0, 250), city: cust.city, state: cust.state, pincode: cust.pincode,
    shipping: String(priced.shipping),
  };
  for (let i = 0; i < 4 && items.length > i * 250; i++) notes["items_" + (i + 1)] = items.slice(i * 250, (i + 1) * 250);
  return notes;
}

// ---- Database (Cloudflare D1, binding name: DB)
const SCHEMA = `CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT, status TEXT NOT NULL,
  rzp_order_id TEXT UNIQUE, rzp_payment_id TEXT,
  name TEXT, phone TEXT, email TEXT, address TEXT, city TEXT, state TEXT, pincode TEXT,
  items_json TEXT, subtotal INTEGER, shipping INTEGER, total INTEGER,
  courier TEXT, tracking_no TEXT, tracking_url TEXT, admin_note TEXT, paid_at TEXT, shipped_at TEXT, delivered_at TEXT
)`;
let schemaReady = false;
export async function db(env) {
  if (!env.DB) throw new Error("Orders database is not connected yet (D1 binding 'DB' missing).");
  if (!schemaReady) {
    await env.DB.prepare(SCHEMA).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at)").run();
    schemaReady = true;
  }
  return env.DB;
}
export const now = () => new Date().toISOString();

export function publicOrder(o) {
  return {
    id: o.id, status: o.status, created_at: o.created_at, paid_at: o.paid_at, shipped_at: o.shipped_at, delivered_at: o.delivered_at,
    items: JSON.parse(o.items_json || "[]"), subtotal: o.subtotal, shipping: o.shipping, total: o.total,
    courier: o.courier, tracking_no: o.tracking_no, tracking_url: o.tracking_url,
    name: o.name, city: o.city, state: o.state, pincode: o.pincode,
  };
}

// Mark an order paid (idempotent). Returns the order row, and whether it changed.
export async function markPaid(env, rzpOrderId, paymentId) {
  const DB = await db(env);
  const o = await DB.prepare("SELECT * FROM orders WHERE rzp_order_id = ?").bind(rzpOrderId).first();
  if (!o) return { order: null, changed: false };
  if (o.status !== "pending_payment") return { order: o, changed: false };
  const t = now();
  await DB.prepare("UPDATE orders SET status='paid', rzp_payment_id=?, paid_at=?, updated_at=? WHERE id=? AND status='pending_payment'")
    .bind(paymentId, t, t, o.id).run();
  return { order: { ...o, status: "paid", rzp_payment_id: paymentId, paid_at: t }, changed: true };
}

// ---- Email (Resend, optional: set RESEND_API_KEY + verify the domain in Resend)
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

export async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) return { skipped: true };
  const from = env.EMAIL_FROM || "Speed Wheels <orders@speedwheels.in>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, reply_to: replyTo || env.STORE_EMAIL }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function itemsTable(o) {
  const items = JSON.parse(o.items_json || "[]");
  const rows = items.map((l) => `<tr><td style="padding:6px 0">${l.qty} × ${esc(l.title)}${l.colour ? ` <span style="color:#6b665e">(${esc(l.colour)})</span>` : ""}</td><td style="text-align:right">${inr(l.lineTotal)}</td></tr>`).join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
  <tr><td style="padding-top:8px;color:#6b665e">Shipping</td><td style="text-align:right;padding-top:8px">${o.shipping ? inr(o.shipping) : "Free"}</td></tr>
  <tr><td style="font-weight:700">Total paid</td><td style="text-align:right;font-weight:700">${inr(o.total)}</td></tr></table>`;
}
function wrap(siteUrl, body) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#17181b">
  <div style="background:#17181b;color:#fff;padding:14px 18px;font-weight:900;font-style:italic;letter-spacing:1px">SPEED <span style="color:#ff6a13">WHEELS</span></div>
  <div style="padding:18px;border:1px solid #e3ddd3;border-top:0">${body}
  <p style="font-size:12px;color:#6b665e;margin-top:24px">Questions? Just reply to this email. <a href="${siteUrl}">${siteUrl.replace(/^https?:\/\//, "")}</a></p></div></div>`;
}
export function emailOrderConfirmed(siteUrl, o) {
  const track = `${siteUrl}/track/?order=${encodeURIComponent(o.id)}`;
  return {
    subject: `Order confirmed: ${o.id}`,
    html: wrap(siteUrl, `<h2 style="margin:0 0 8px">Thank you, ${esc(o.name.split(" ")[0])}!</h2>
    <p>We've received your payment and your order <b>${esc(o.id)}</b> is being prepared.</p>${itemsTable(o)}
    <p style="margin-top:16px"><b>Delivering to:</b><br>${esc(o.name)}<br>${esc(o.address)}<br>${esc(o.city)}, ${esc(o.state)} ${esc(o.pincode)}<br>Phone: ${esc(o.phone)}</p>
    <p><a href="${track}" style="background:#ff6a13;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:700">Track your order</a></p>`),
  };
}
export function emailShipped(siteUrl, o) {
  const track = `${siteUrl}/track/?order=${encodeURIComponent(o.id)}`;
  return {
    subject: `Your order ${o.id} has shipped 🚚`,
    html: wrap(siteUrl, `<h2 style="margin:0 0 8px">Your order is on its way!</h2>
    <p>Order <b>${esc(o.id)}</b> has been shipped${o.courier ? ` with <b>${esc(o.courier)}</b>` : ""}.</p>
    ${o.tracking_no ? `<p>Tracking number: <b>${esc(o.tracking_no)}</b></p>` : ""}
    ${o.tracking_url ? `<p><a href="${esc(o.tracking_url)}" style="background:#ff6a13;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:700">Track with courier</a></p>` : ""}
    <p>You can also check your order any time here: <a href="${track}">${track}</a></p>${itemsTable(o)}`),
  };
}
export function emailDelivered(siteUrl, o) {
  return {
    subject: `Delivered: order ${o.id}`,
    html: wrap(siteUrl, `<h2 style="margin:0 0 8px">Delivered! 🏁</h2><p>Your order <b>${esc(o.id)}</b> has been delivered. We hope you love it. Tag us on Instagram to show off your collection!</p>`),
  };
}
export function emailNewOrder(siteUrl, o) {
  return {
    subject: `🛒 New order ${o.id}: ${inr(o.total)}`,
    html: wrap(siteUrl, `<h2 style="margin:0 0 8px">New paid order ${esc(o.id)}</h2>${itemsTable(o)}
    <p><b>Ship to:</b><br>${esc(o.name)}<br>${esc(o.address)}<br>${esc(o.city)}, ${esc(o.state)} ${esc(o.pincode)}<br>Phone: ${esc(o.phone)}<br>Email: ${esc(o.email)}</p>
    <p>Payment ID: ${esc(o.rzp_payment_id)}</p><p><a href="${siteUrl}/admin/orders/">Open orders screen</a></p>`),
  };
}

export async function notifyPaid(env, siteUrl, o) {
  const c = emailOrderConfirmed(siteUrl, o);
  const n = emailNewOrder(siteUrl, o);
  await Promise.all([
    sendEmail(env, { to: o.email, ...c }),
    env.STORE_EMAIL ? sendEmail(env, { to: env.STORE_EMAIL, ...n, replyTo: o.email }) : null,
  ]);
}

export function requireAdmin(request, env) {
  const h = request.headers.get("authorization") || "";
  const pass = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 8) return "Admin password is not set up yet.";
  if (!safeEqual(pass, env.ADMIN_PASSWORD)) return "Wrong password.";
  return null;
}

export const siteOrigin = (request) => new URL(request.url).origin;
