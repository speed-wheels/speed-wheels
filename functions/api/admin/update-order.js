// POST /api/admin/update-order {id, status, courier, tracking_no, tracking_url, admin_note, notify}
import { json, bad, db, now, requireAdmin, sendEmail, emailShipped, emailDelivered, siteOrigin } from "../../../lib/shop.js";
const STATUSES = ["pending_payment", "paid", "packed", "shipped", "delivered", "cancelled", "refunded"];
export async function onRequestPost({ request, env }) {
  const err = requireAdmin(request, env); if (err) return bad(err, 401);
  let b; try { b = await request.json(); } catch { return bad("Invalid request."); }
  const DB = await db(env);
  const o = await DB.prepare("SELECT * FROM orders WHERE id = ?").bind(String(b.id || "")).first();
  if (!o) return bad("Order not found.", 404);
  const status = STATUSES.includes(b.status) ? b.status : o.status;
  const t = now();
  const s = (v, n) => (v == null ? null : String(v).trim().slice(0, n));
  let url = s(b.tracking_url, 500) ?? o.tracking_url;
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  const upd = {
    status, courier: s(b.courier, 60) ?? o.courier, tracking_no: s(b.tracking_no, 80) ?? o.tracking_no, tracking_url: url,
    admin_note: s(b.admin_note, 1000) ?? o.admin_note,
    shipped_at: status === "shipped" && !o.shipped_at ? t : o.shipped_at,
    delivered_at: status === "delivered" && !o.delivered_at ? t : o.delivered_at,
  };
  await DB.prepare("UPDATE orders SET status=?, courier=?, tracking_no=?, tracking_url=?, admin_note=?, shipped_at=?, delivered_at=?, updated_at=? WHERE id=?")
    .bind(upd.status, upd.courier, upd.tracking_no, upd.tracking_url, upd.admin_note, upd.shipped_at, upd.delivered_at, t, o.id).run();
  const order = { ...o, ...upd };
  let email = null;
  if (b.notify && (status === "shipped" || status === "delivered")) {
    const m = status === "shipped" ? emailShipped(siteOrigin(request), order) : emailDelivered(siteOrigin(request), order);
    email = await sendEmail(env, { to: order.email, ...m });
  }
  return json({ ok: true, order, email });
}
