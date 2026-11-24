// GET /api/track?order=SW...&phone=9876543210  (phone or email must match)
import { json, bad, db, publicOrder } from "../../lib/shop.js";
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const id = (u.searchParams.get("order") || "").trim().toUpperCase();
  let who = (u.searchParams.get("contact") || "").trim().toLowerCase().replace(/[\s-]/g, "");
  if (/^\+?91\d{10}$/.test(who)) who = who.slice(-10); else if (/^0\d{10}$/.test(who)) who = who.slice(1);
  if (!id || !who) return bad("Enter your order number and phone or email.");
  try {
    const o = await (await db(env)).prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
    if (!o || (o.phone !== who && o.email !== who) || o.status === "pending_payment")
      return bad("We couldn't find that order. Check the order number and the phone or email you used.", 404);
    return json({ ok: true, order: publicOrder(o) });
  } catch (e) { return bad("Tracking is temporarily unavailable.", 503); }
}
