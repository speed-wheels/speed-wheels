// GET /api/admin/orders?status=paid  (Authorization: Bearer <ADMIN_PASSWORD>)
import { json, bad, db, requireAdmin } from "../../../lib/shop.js";
export async function onRequestGet({ request, env }) {
  const err = requireAdmin(request, env); if (err) return bad(err, 401);
  const status = new URL(request.url).searchParams.get("status") || "";
  try {
    const DB = await db(env);
    const q = status
      ? DB.prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 300").bind(status)
      : DB.prepare("SELECT * FROM orders WHERE status != 'pending_payment' ORDER BY created_at DESC LIMIT 300");
    const { results } = await q.all();
    return json({ ok: true, orders: results.map((o) => ({ ...o, items: JSON.parse(o.items_json || "[]") })) });
  } catch (e) { return bad(e.message, 500); }
}
