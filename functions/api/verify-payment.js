// POST /api/verify-payment { razorpay_order_id, razorpay_payment_id, razorpay_signature }
import { json, bad, hmacHex, safeEqual, markPaid, notifyPaid, siteOrigin } from "../../lib/shop.js";

export async function onRequestPost({ request, env, waitUntil }) {
  let b;
  try { b = await request.json(); } catch { return bad("Invalid request."); }
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = b || {};
  if (!oid || !pid || !sig) return bad("Missing payment details.");
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET || "", `${oid}|${pid}`);
  if (!safeEqual(expected, sig)) return bad("Payment could not be verified. If money was deducted, please contact us.", 400);
  try {
    const { order, changed } = await markPaid(env, oid, pid);
    if (order && changed) waitUntil(notifyPaid(env, siteOrigin(request), order));
    return json({ ok: true, orderId: order ? order.id : null });
  } catch (e) {
    console.error(e);
    return json({ ok: true, orderId: null }); // paid & verified; details remain in Razorpay
  }
}
