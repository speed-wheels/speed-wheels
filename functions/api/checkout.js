// POST /api/checkout  { items:[{id,colour,qty}], customer:{...} }
// Prices the cart on the server, creates a Razorpay order and saves a pending order.
import { json, bad, loadCatalog, priceCart, cleanCustomer, newOrderId, razorpayCreateOrder, razorpayNotes, db, now } from "../../lib/shop.js";

export async function onRequestPost({ request, env }) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return bad("Online payments are not switched on yet. Please try again later.", 503);
  let body;
  try { body = await request.json(); } catch { return bad("Invalid request."); }
  let cust, priced;
  try {
    cust = cleanCustomer(body.customer);
    const catalog = await loadCatalog(request, env);
    priced = priceCart(catalog, body.items, cust.state);
  } catch (e) { return bad(e.message); }
  if (priced.total < 1) return bad("Order total is invalid.");

  const id = newOrderId();
  let rzp;
  try {
    rzp = await razorpayCreateOrder(env, { amountPaise: priced.total * 100, receipt: id, notes: razorpayNotes(id, cust, priced) });
  } catch (e) { return bad(e.message, 502); }

  try {
    const DB = await db(env);
    const t = now();
    await DB.prepare(`INSERT INTO orders (id, created_at, updated_at, status, rzp_order_id, name, phone, email, address, city, state, pincode, items_json, subtotal, shipping, total)
      VALUES (?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, t, t, rzp.id, cust.name, cust.phone, cust.email, cust.address, cust.city, cust.state, cust.pincode,
        JSON.stringify(priced.lines), priced.subtotal, priced.shipping, priced.total).run();
  } catch (e) {
    // Payment can still go through; details are also stored in Razorpay order notes.
    console.error("DB insert failed", e);
  }

  return json({
    ok: true, orderId: id, razorpayOrderId: rzp.id, keyId: env.RAZORPAY_KEY_ID,
    amount: priced.total * 100, subtotal: priced.subtotal, shipping: priced.shipping, total: priced.total,
    customer: { name: cust.name, email: cust.email, phone: cust.phone },
  });
}
