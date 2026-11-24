/* Speed Wheels storefront: cart, checkout, Razorpay, order tracking. No framework, ~small. */
(function () {
  "use strict";
  var KEY = "sw_cart_v1";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var inr = function (n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  // ---- cart storage (works even if storage is blocked)
  var memory = [];
  function read() { try { var v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return memory; } }
  function write(c) { memory = c; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} badge(); }
  function count() { return read().reduce(function (a, l) { return a + (l.qty || 0); }, 0); }
  function badge() {
    var n = count();
    document.querySelectorAll("[data-cart-count]").forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
  }
  function add(id, colour, qty) {
    var c = read(), line = c.find(function (l) { return l.id === id && (l.colour || "") === (colour || ""); });
    if (line) line.qty = Math.min(20, line.qty + qty); else c.push({ id: id, colour: colour || "", qty: qty });
    write(c);
  }

  var catalogP;
  function catalog() {
    if (!catalogP) catalogP = fetch("/catalog.json", { cache: "no-cache" }).then(function (r) { return r.json(); });
    return catalogP;
  }
  function shippingFor(s, subtotal, state) {
    s = s || {};
    var z = (s.zones || []).find(function (z) { return (z.states || []).some(function (x) { return x.toLowerCase() === String(state || "").toLowerCase(); }); });
    var free = z && z.freeAbove != null && z.freeAbove !== "" ? Number(z.freeAbove) : Number(s.freeAbove || 0);
    if (free > 0 && subtotal >= free) return 0;
    return Number(z ? z.rate : s.defaultRate) || 0;
  }
  // Join cart with catalog, dropping products that no longer exist
  function lines(cat) {
    var by = {}; cat.products.forEach(function (p) { by[p.id] = p; });
    var c = read().filter(function (l) { return by[l.id]; });
    return c.map(function (l) { var p = by[l.id]; return { l: l, p: p, total: p.price * l.qty }; });
  }

  function toast(html) {
    var t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.innerHTML = html; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 3500);
  }

  // ---- product page: add to cart
  var form = $("#add-to-cart");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var qty = Math.max(1, Math.min(20, parseInt(form.qty.value, 10) || 1));
      add(form.dataset.id, form.colour ? form.colour.value : "", qty);
      toast("Added to cart ✓ <a href=\"/cart/\">View cart</a>");
      if (e.submitter && e.submitter.value === "buy") location.href = "/checkout/";
    });
  }
  document.querySelectorAll("[data-qty-step]").forEach(function (b) {
    b.addEventListener("click", function () {
      var i = b.parentNode.querySelector("input"); var v = (parseInt(i.value, 10) || 1) + Number(b.dataset.qtyStep);
      i.value = Math.max(1, Math.min(20, v)); i.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  // ---- cart page
  var cartEl = $("#cart");
  function renderCart() {
    catalog().then(function (cat) {
      var ls = lines(cat);
      if (!ls.length) {
        cartEl.innerHTML = '<div class="empty"><p>Your cart is empty.</p><a class="btn btn-pay" href="/shop/">Start shopping</a></div>';
        return;
      }
      var sub = ls.reduce(function (a, x) { return a + x.total; }, 0);
      var s = cat.shipping || {};
      var rows = ls.map(function (x, i) {
        var out = !x.p.inStock;
        return '<li class="cart-line"><a href="' + x.p.url + '"><img src="' + x.p.image + '" alt="" width="80" height="80" loading="lazy"></a>' +
          '<div class="cl-main"><a href="' + x.p.url + '" class="cl-title">' + esc(x.p.title) + '</a>' +
          (x.l.colour ? '<span class="muted small">Colour: ' + esc(x.l.colour) + "</span>" : "") +
          (out ? '<span class="stock out small">Sold out, please remove</span>' : '<span class="small">' + inr(x.p.price) + " each</span>") +
          '<div class="qty-row"><div class="qty"><button type="button" data-i="' + i + '" data-d="-1" aria-label="Decrease">−</button><span>' + x.l.qty +
          '</span><button type="button" data-i="' + i + '" data-d="1" aria-label="Increase">+</button></div><button type="button" class="link-btn" data-rm="' + i + '">Remove</button></div></div>' +
          '<strong class="cl-total">' + inr(x.total) + "</strong></li>";
      }).join("");
      var freeNote = s.freeAbove > 0 && sub < s.freeAbove ? '<p class="note">Add ' + inr(s.freeAbove - sub) + " more for free shipping.</p>" : "";
      cartEl.innerHTML = '<ul class="cart-lines">' + rows + "</ul>" +
        '<div class="summary"><div class="row"><span>Subtotal</span><strong>' + inr(sub) + "</strong></div>" +
        '<div class="row muted small"><span>Shipping</span><span>' + (s.freeAbove > 0 && sub >= s.freeAbove ? "Free" : "Calculated at checkout") + "</span></div>" + freeNote +
        '<a class="btn btn-pay btn-block" href="/checkout/">Checkout</a><a class="btn btn-ghost btn-block" href="/shop/">Continue shopping</a></div>';
      var all = ls.map(function (x) { return x.l; });
      cartEl.querySelectorAll("[data-d]").forEach(function (b) {
        b.onclick = function () { var l = all[b.dataset.i]; l.qty = Math.max(1, Math.min(20, l.qty + Number(b.dataset.d))); write(all); renderCart(); };
      });
      cartEl.querySelectorAll("[data-rm]").forEach(function (b) {
        b.onclick = function () { all.splice(b.dataset.rm, 1); write(all); renderCart(); };
      });
    }).catch(function () { cartEl.innerHTML = "<p>Couldn't load your cart. Please refresh.</p>"; });
  }
  if (cartEl) renderCart();

  // ---- checkout page
  var co = $("#checkout");
  if (co) {
    var sumEl = $("#co-summary"), msg = $("#co-msg"), payBtn = $("#co-pay");
    var saved = {}; try { saved = JSON.parse(localStorage.getItem("sw_addr") || "{}"); } catch (e) {}
    ["name", "phone", "email", "address", "city", "state", "pincode"].forEach(function (k) { if (saved[k] && co[k]) co[k].value = saved[k]; });
    function renderSummary() {
      catalog().then(function (cat) {
        var ls = lines(cat);
        if (!ls.length) { location.href = "/cart/"; return; }
        var sub = ls.reduce(function (a, x) { return a + x.total; }, 0);
        var ship = co.state.value ? shippingFor(cat.shipping, sub, co.state.value) : null;
        sumEl.innerHTML = ls.map(function (x) {
          return '<div class="row"><span>' + x.l.qty + " × " + esc(x.p.title) + (x.l.colour ? ' <span class="muted">(' + esc(x.l.colour) + ")</span>" : "") + "</span><span>" + inr(x.total) + "</span></div>";
        }).join("") + '<div class="row sep"><span>Subtotal</span><span>' + inr(sub) + "</span></div>" +
          '<div class="row"><span>Shipping</span><span>' + (ship === null ? "Choose state" : ship === 0 ? "Free" : inr(ship)) + "</span></div>" +
          '<div class="row total"><span>Total</span><strong>' + inr(sub + (ship || 0)) + "</strong></div>";
        payBtn.textContent = "Pay " + inr(sub + (ship || 0)) + " securely";
      });
    }
    co.state.addEventListener("change", renderSummary);
    renderSummary();

    var rzpLoaded;
    function loadRzp() {
      if (!rzpLoaded) rzpLoaded = new Promise(function (res, rej) {
        var s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = res; s.onerror = function () { rzpLoaded = null; rej(new Error("Couldn't load the payment window. Check your internet and try again.")); };
        document.head.appendChild(s);
      });
      return rzpLoaded;
    }
    function busy(on, text) { payBtn.disabled = on; if (text) payBtn.textContent = text; }
    function err(t) { msg.textContent = t; msg.hidden = !t; if (t) msg.scrollIntoView({ block: "center", behavior: "smooth" }); }

    co.addEventListener("submit", function (e) {
      e.preventDefault(); err("");
      if (!co.reportValidity()) return;
      var customer = {}; ["name", "phone", "email", "address", "city", "state", "pincode"].forEach(function (k) { customer[k] = co[k].value.trim(); });
      try { localStorage.setItem("sw_addr", JSON.stringify(customer)); } catch (x) {}
      busy(true, "Please wait…");
      Promise.all([loadRzp(), fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: read(), customer: customer }) })
        .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Server error (" + r.status + ")" }; }); })])
        .then(function (res) {
          var o = res[1];
          if (!o.ok) throw new Error(o.error || "Something went wrong.");
          var rz = new window.Razorpay({
            key: o.keyId, order_id: o.razorpayOrderId, amount: o.amount, currency: "INR",
            name: "Speed Wheels", description: "Order " + o.orderId,
            prefill: { name: o.customer.name, email: o.customer.email, contact: "+91" + o.customer.phone },
            notes: { order_id: o.orderId }, theme: { color: "#ff6a13" },
            handler: function (p) {
              busy(true, "Confirming payment…");
              fetch("/api/verify-payment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) })
                .then(function (r) { return r.json(); })
                .then(function (v) {
                  if (!v.ok) throw new Error(v.error);
                  write([]);
                  location.href = "/order-success/?order=" + encodeURIComponent(o.orderId);
                })
                .catch(function (x) { busy(false); err((x && x.message) || "We couldn't confirm your payment. If money was deducted, contact us with order " + o.orderId + "."); });
            },
            modal: { ondismiss: function () { busy(false); renderSummary(); } },
          });
          rz.on("payment.failed", function (r) { err("Payment failed: " + ((r && r.error && r.error.description) || "please try again.")); });
          rz.open();
        })
        .catch(function (x) { busy(false); renderSummary(); err(x.message); });
    });
  }

  // ---- order success
  var ok = $("#order-ok");
  if (ok) {
    var id = new URLSearchParams(location.search).get("order") || "";
    ok.textContent = id;
    var tl = $("#order-ok-track"); if (tl && id) tl.href = "/track/?order=" + encodeURIComponent(id);
    write([]);
  }

  // ---- tracking page
  var tf = $("#track-form");
  if (tf) {
    var out = $("#track-result");
    var q = new URLSearchParams(location.search);
    if (q.get("order")) tf.order.value = q.get("order");
    var STEPS = [["paid", "Order placed"], ["packed", "Packed"], ["shipped", "Shipped"], ["delivered", "Delivered"]];
    tf.addEventListener("submit", function (e) {
      e.preventDefault();
      out.innerHTML = '<p class="muted">Looking up your order…</p>';
      fetch("/api/track?order=" + encodeURIComponent(tf.order.value.trim()) + "&contact=" + encodeURIComponent(tf.contact.value.trim()))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) { out.innerHTML = '<p class="error">' + esc(d.error) + "</p>"; return; }
          var o = d.order, idx = STEPS.findIndex(function (s) { return s[0] === o.status; });
          var special = { cancelled: "This order was cancelled.", refunded: "This order was refunded." }[o.status];
          var steps = special ? '<p class="error">' + special + "</p>" : '<ol class="steps">' + STEPS.map(function (s, i) {
            return '<li class="' + (i <= idx ? "done" : "") + '">' + s[1] + "</li>";
          }).join("") + "</ol>";
          var ship = o.tracking_no || o.courier ? '<div class="ship-box"><p><strong>' + esc(o.courier || "Courier") + "</strong>" + (o.tracking_no ? "<br>Tracking number: <strong>" + esc(o.tracking_no) + "</strong>" : "") + "</p>" +
            (o.tracking_url ? '<a class="btn btn-pay" target="_blank" rel="noopener" href="' + esc(o.tracking_url) + '">Track with courier</a>' : "") + "</div>" : "";
          out.innerHTML = '<div class="track-card"><h2>Order ' + esc(o.id) + "</h2>" + steps + ship +
            '<div class="summary">' + o.items.map(function (l) { return '<div class="row"><span>' + l.qty + " × " + esc(l.title) + (l.colour ? " (" + esc(l.colour) + ")" : "") + "</span><span>" + inr(l.lineTotal) + "</span></div>"; }).join("") +
            '<div class="row total"><span>Total paid</span><strong>' + inr(o.total) + "</strong></div></div>" +
            '<p class="muted small">Delivering to ' + esc(o.name) + ", " + esc(o.city) + ", " + esc(o.state) + " " + esc(o.pincode) + "</p></div>";
        })
        .catch(function () { out.innerHTML = '<p class="error">Tracking is temporarily unavailable. Please try again.</p>'; });
    });
    if (q.get("order") && tf.contact.value) tf.requestSubmit();
  }

  badge();
})();
