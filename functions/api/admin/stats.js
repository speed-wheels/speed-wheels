// GET /api/admin/stats  -> dashboard numbers (Authorization: Bearer <ADMIN_PASSWORD>)
import { json, bad, db, requireAdmin } from "../../../lib/shop.js";
const IST = 330 * 60 * 1000; // India time offset
const istDay = (d) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
export async function onRequestGet({ request, env }) {
  const err = requireAdmin(request, env); if (err) return bad(err, 401);
  try {
    const DB = await db(env);
    const counts = {};
    (await DB.prepare("SELECT status, COUNT(*) n FROM orders GROUP BY status").all()).results.forEach((r) => (counts[r.status] = r.n));
    const since = new Date(Date.now() - 40 * 864e5).toISOString();
    const { results } = await DB.prepare(
      "SELECT id, total, items_json, paid_at, created_at, status FROM orders WHERE paid_at IS NOT NULL AND paid_at >= ? AND status NOT IN ('cancelled','refunded','pending_payment')"
    ).bind(since).all();
    const today = istDay(new Date()), month = today.slice(0, 7);
    const days = {}; for (let i = 13; i >= 0; i--) days[istDay(new Date(Date.now() - i * 864e5))] = { sales: 0, orders: 0 };
    let todaySales = 0, todayOrders = 0, monthSales = 0, monthOrders = 0;
    const top = {};
    for (const o of results) {
      const d = istDay(new Date(o.paid_at));
      if (days[d]) { days[d].sales += o.total; days[d].orders++; }
      if (d === today) { todaySales += o.total; todayOrders++; }
      if (d.slice(0, 7) === month) { monthSales += o.total; monthOrders++; }
      if (Date.now() - new Date(o.paid_at) < 30 * 864e5) for (const l of JSON.parse(o.items_json || "[]")) {
        top[l.title] = top[l.title] || { title: l.title, qty: 0, sales: 0 }; top[l.title].qty += l.qty; top[l.title].sales += l.lineTotal;
      }
    }
    const latest = await DB.prepare("SELECT id, paid_at FROM orders WHERE paid_at IS NOT NULL ORDER BY paid_at DESC LIMIT 1").first();
    const all = await DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders WHERE status NOT IN ('cancelled','refunded','pending_payment')").first();
    return json({
      ok: true, counts, todaySales, todayOrders, monthSales, monthOrders, allOrders: all.n, allSales: all.s,
      days: Object.entries(days).map(([d, v]) => ({ day: d, ...v })),
      top: Object.values(top).sort((a, b) => b.qty - a.qty).slice(0, 5),
      latestPaid: latest ? latest.paid_at : null,
      emailEnabled: !!env.RESEND_API_KEY, storeEmail: env.STORE_EMAIL || "",
    });
  } catch (e) { return bad(e.message, 500); }
}
