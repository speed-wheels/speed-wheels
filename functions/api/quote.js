// POST /api/quote { items, state } -> server-calculated totals for display (no order created)
import { json, bad, loadCatalog, priceCart } from "../../lib/shop.js";
export async function onRequestPost({ request, env }) {
  try {
    const { items, state } = await request.json();
    const priced = priceCart(await loadCatalog(request, env), items, state);
    return json({ ok: true, ...priced });
  } catch (e) { return bad(e.message || "Invalid request."); }
}
