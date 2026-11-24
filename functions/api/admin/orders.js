// GET /api/admin/orders?status=paid&q=search&ids=A,B  (Authorization: Bearer <ADMIN_PASSWORD>)
import { json, bad, db, requireAdmin } from "../../../lib/shop.js";
export async function onRequestGet({ request, env }) {
  const err = requireAdmin(request, env); if (err) return bad(err, 401);
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status") || "", q = (sp.get("q") || "").trim().slice(0, 80);
  const ids = (sp.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
  try {
    const DB = await db(env);
    const where = [], args = [];
    if (ids.length) { where.push(`id IN (${ids.map(() => "?").join(",")})`); args.push(...ids); }
    else if (status) { where.push("status = ?"); args.push(status); }
    else where.push("status != 'pending_payment'");
    if (q) {
      where.push("(id LIKE ? OR name LIKE ? OR phone LIKE ? OR email LIKE ? OR pincode LIKE ? OR city LIKE ? OR tracking_no LIKE ?)");
      const like = "%" + q.replace(/[%_]/g, "") + "%"; args.push(like, like, like, like, like, like, like);
    }
    const sql = `SELECT * FROM orders WHERE ${where.join(" AND ")} ORDER BY created_at ${status === "paid" ? "ASC" : "DESC"} LIMIT 500`;
    const { results } = await DB.prepare(sql).bind(...args).all();
    return json({ ok: true, orders: results.map((o) => ({ ...o, items: JSON.parse(o.items_json || "[]") })) });
  } catch (e) { return bad(e.message, 500); }
}
