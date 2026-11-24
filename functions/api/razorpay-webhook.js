// Optional backup: Razorpay webhook (events: payment.captured, order.paid).
// Marks orders paid even if the customer closed the browser before returning to the site.
import { json, hmacHex, safeEqual, markPaid, notifyPaid, siteOrigin } from "../../lib/shop.js";

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return json({ ok: false }, 404);
  const raw = await request.text();
  const sig = request.headers.get("x-razorpay-signature") || "";
  if (!safeEqual(await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw), sig)) return json({ ok: false }, 401);
  let ev; try { ev = JSON.parse(raw); } catch { return json({ ok: false }, 400); }
  const pay = ev?.payload?.payment?.entity;
  const oid = pay?.order_id || ev?.payload?.order?.entity?.id;
  if (oid && pay?.id && (ev.event === "payment.captured" || ev.event === "order.paid")) {
    const { order, changed } = await markPaid(env, oid, pay.id);
    if (order && changed) waitUntil(notifyPaid(env, siteOrigin(request), order));
  }
  return json({ ok: true });
}
