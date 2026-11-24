// POST /api/admin/bulk-update {ids:[...], status:"packed"|"delivered"|"paid"}  -> change status of many orders at once
import { json, bad, db, now, requireAdmin, sendEmail, emailDelivered, siteOrigin } from "../../../lib/shop.js";
const ALLOWED = ["paid", "packed", "delivered"];
export async function onRequestPost({ request, env }) {
  const err = requireAdmin(request, env); if (err) return bad(err, 401);
  let b; try { b = await request.json(); } catch { return bad("Invalid request."); }
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 100);
  if (!ids.length) return bad("No orders selected.");
  if (!ALLOWED.includes(b.status)) return bad("That status can't be set in bulk.");
  const DB = await db(env), t = now();
  const { results } = await DB.prepare(`SELECT * FROM orders WHERE id IN (${ids.map(() => "?").join(",")}) AND status != 'pending_payment'`).bind(...ids).all();
  let emailed = 0;
  for (const o of results) {
    const delivered_at = b.status === "delivered" && !o.delivered_at ? t : o.delivered_at;
    await DB.prepare("UPDATE orders SET status=?, delivered_at=?, updated_at=? WHERE id=?").bind(b.status, delivered_at, t, o.id).run();
    if (b.notify && b.status === "delivered" && o.status !== "delivered") {
      const r = await sendEmail(env, { to: o.email, ...emailDelivered(siteOrigin(request), { ...o, status: "delivered" }) });
      if (r && r.ok) emailed++;
    }
  }
  return json({ ok: true, updated: results.length, emailed });
}
