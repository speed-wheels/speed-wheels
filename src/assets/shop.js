/* Speed Wheels storefront: menu, search, slider, carousels, filters, cart, checkout (Razorpay), tracking. No framework. */
(function () {
  "use strict";
  var KEY = "sw_cart_v1", RECENT = "sw_recent_v1";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var inr = function (n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); };
  var num = function (n) { return Number(n || 0).toLocaleString("en-IN"); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------------- cart storage
  var memory = [];
  function read() { var v = store.get(KEY, null); if (Array.isArray(v)) return v; return memory; }
  function write(c) { memory = c; store.set(KEY, c); badge(); }
  function count() { return read().reduce(function (a, l) { return a + (l.qty || 0); }, 0); }
  function badge() { var n = count(); $$("[data-cart-count]").forEach(function (el) { el.textContent = n; }); }
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
  function byId(cat) { var m = {}; cat.products.forEach(function (p) { m[p.id] = p; }); return m; }
  function shippingFor(s, subtotal, state) {
    s = s || {};
    var z = (s.zones || []).find(function (z) { return (z.states || []).some(function (x) { return x.toLowerCase() === String(state || "").toLowerCase(); }); });
    var free = z && z.freeAbove != null && z.freeAbove !== "" ? Number(z.freeAbove) : Number(s.freeAbove || 0);
    if (free > 0 && subtotal >= free) return 0;
    return Number(z ? z.rate : s.defaultRate) || 0;
  }
  function lines(cat) {
    var by = byId(cat);
    return read().filter(function (l) { return by[l.id]; }).map(function (l) { var p = by[l.id]; return { l: l, p: p, total: p.price * l.qty }; });
  }
  function off(p) { return p.mrp && p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0; }

  // Delivery estimate from text like "1–3 working days" + "3–7 working days"
  function nums(t) { return (String(t || "").match(/\d+/g) || []).map(Number); }
  function addWorkdays(d, n) { d = new Date(d); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) n--; } return d; }
  function fmtDay(d) { return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); }
  function eta(dispatch, delivery) {
    var a = nums(dispatch), b = nums(delivery);
    if (!a.length || !b.length) return "";
    var lo = (a[0] || 0) + (b[0] || 0), hi = (a[a.length - 1] || 0) + (b[b.length - 1] || 0), now = new Date();
    return fmtDay(addWorkdays(now, lo)) + " – " + fmtDay(addWorkdays(now, hi));
  }

  function toast(html) {
    var t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.innerHTML = html; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 4000);
  }
  function addedToast(p) {
    toast((p && p.image ? '<img src="' + esc(p.image) + '" alt="">' : "") + "<div><b>✓ Added to cart</b><br><span class=\"small\">Cart: " + count() + " item" + (count() === 1 ? "" : "s") + '</span></div><a class="btn btn-cart" href="/cart/">Go to cart</a>');
  }

  // ---------------- menu drawer
  var drawer = $("#drawer"), scrim = $(".drawer-scrim");
  function menu(open) {
    if (!drawer) return;
    drawer.hidden = !open; scrim.hidden = !open; document.body.classList.toggle("lock", open);
    $$("[data-menu-open]").forEach(function (b) { b.setAttribute("aria-expanded", open); });
    if (open) { var f = drawer.querySelector("button, a"); if (f) f.focus(); }
  }
  $$("[data-menu-open]").forEach(function (b) { b.addEventListener("click", function () { menu(true); }); });
  $$("[data-menu-close]").forEach(function (b) { b.addEventListener("click", function () { menu(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { menu(false); filters(false); closeSuggest(); } });

  // ---------------- search
  function match(p, q) {
    var hay = (p.title + " " + p.brand + " " + p.collectionTitle + " " + p.summary + " " + (p.colours || []).join(" ")).toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) !== -1; });
  }
  function score(p, q) { var t = p.title.toLowerCase(), ql = q.toLowerCase(); return (t.indexOf(ql) === 0 ? 3 : t.indexOf(ql) !== -1 ? 2 : 0) + (p.inStock ? 1 : 0); }
  var sInput = $("[data-search-input]"), sBox = $("[data-suggest]"), sForm = sInput && sInput.form;
  function closeSuggest() { if (sBox) sBox.hidden = true; }
  if (sInput) {
    var qs = new URLSearchParams(location.search);
    if (location.pathname === "/search/") { sInput.value = qs.get("q") || ""; if (qs.get("c")) sForm.c.value = qs.get("c"); }
    var hi = -1;
    sInput.addEventListener("input", function () {
      var q = sInput.value.trim(); hi = -1;
      if (q.length < 2) { closeSuggest(); return; }
      catalog().then(function (cat) {
        var c = sForm.c ? sForm.c.value : "";
        var res = cat.products.filter(function (p) { return (!c || p.collection === c) && match(p, q); }).sort(function (a, b) { return score(b, q) - score(a, q); }).slice(0, 6);
        sBox.innerHTML = res.map(function (p) {
          return '<a href="' + p.url + '"><img src="' + esc(p.image) + '" alt=""><span>' + esc(p.title) + '<br><span class="sg-meta">' + inr(p.price) + (p.collectionTitle ? " · in " + esc(p.collectionTitle) : "") + "</span></span></a>";
        }).join("") + '<a class="sg-all" href="/search/?q=' + encodeURIComponent(q) + (c ? "&c=" + encodeURIComponent(c) : "") + '">See all results for "' + esc(q) + '"</a>';
        sBox.hidden = false;
      });
    });
    sInput.addEventListener("keydown", function (e) {
      if (sBox.hidden) return;
      var items = $$("a", sBox);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); hi = (hi + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach(function (a, i) { a.classList.toggle("on", i === hi); });
      } else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); location.href = items[hi].href; }
    });
    document.addEventListener("click", function (e) { if (!sForm.contains(e.target)) closeSuggest(); });
    sForm.addEventListener("submit", function (e) { if (!sInput.value.trim()) { e.preventDefault(); sInput.focus(); } });
  }

  // search results page
  var sRes = $("#search-results");
  if (sRes) {
    var p0 = new URLSearchParams(location.search), q = (p0.get("q") || "").trim(), c0 = p0.get("c") || "";
    catalog().then(function (cat) {
      var col = (cat.collections || []).find(function (x) { return x.slug === c0; });
      var res = cat.products.filter(function (p) { return (!c0 || p.collection === c0) && (!q || match(p, q)); }).sort(function (a, b) { return score(b, q) - score(a, q); });
      $("#search-head").innerHTML = "<b>" + res.length + "</b> result" + (res.length === 1 ? "" : "s") + (q ? ' for <b class="accent">"' + esc(q) + '"</b>' : "") + (col ? " in " + esc(col.title) : "");
      document.title = (q ? q + " | " : "") + "Search | Speed Wheels";
      $("#search-empty").hidden = res.length > 0;
      sRes.innerHTML = res.map(cardHTML).join("");
    });
  }
  function cardHTML(p) {
    var o = off(p);
    return '<li class="pcard"><a class="pcard-img" href="' + p.url + '" tabindex="-1" aria-hidden="true"><img src="' + esc(p.image) + '" alt="" loading="lazy">' + (o >= 10 ? '<span class="deal-tag">' + o + "% off</span>" : "") + "</a>" +
      '<div class="pcard-body">' + (p.brand ? '<span class="pcard-brand">' + esc(p.brand) + "</span>" : "") +
      '<a class="pcard-title" href="' + p.url + '">' + esc(p.title) + "</a>" +
      '<div class="pprice"><span class="pp-now"><sup>₹</sup>' + num(p.price) + "</span>" + (o ? ' <span class="pp-mrp">M.R.P: <s>' + inr(p.mrp) + '</s></span> <span class="pp-off">(' + o + "% off)</span>" : "") + "</div>" +
      (!p.inStock ? '<p class="pcard-out">Currently unavailable</p>' : (p.colours && p.colours.length > 1 ? '<a class="btn-cart" href="' + p.url + '">See options</a>' : '<button class="btn-cart" type="button" data-add="' + esc(p.id) + '" data-colour="' + esc((p.colours || [])[0] || "") + '">Add to cart</button>')) +
      "</div></li>";
  }

  // quick add buttons on cards (works for server and JS-rendered cards)
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-add]");
    if (!b) return;
    add(b.dataset.add, b.dataset.colour || "", 1);
    b.textContent = "Added ✓"; setTimeout(function () { b.textContent = "Add to cart"; }, 1500);
    catalog().then(function (cat) { addedToast(byId(cat)[b.dataset.add]); }).catch(function () { addedToast(); });
  });

  // ---------------- hero slider
  var slider = $("[data-slider]");
  if (slider) {
    var track = $(".slides", slider), dots = $$("[data-dot]", slider), n = dots.length, cur = 0, timer;
    var go = function (i) { cur = (i + n) % n; track.scrollTo({ left: track.clientWidth * cur, behavior: "smooth" }); };
    var mark = function () { cur = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); dots.forEach(function (d, i) { d.classList.toggle("on", i === cur); }); };
    var auto = function () { clearInterval(timer); if (n > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) timer = setInterval(function () { go(cur + 1); }, 6000); };
    dots.forEach(function (d) { d.addEventListener("click", function () { go(+d.dataset.dot); auto(); }); });
    $$("[data-slide]", slider).forEach(function (b) { b.addEventListener("click", function () { go(cur + Number(b.dataset.slide)); auto(); }); });
    track.addEventListener("scroll", function () { clearTimeout(track._t); track._t = setTimeout(mark, 60); }, { passive: true });
    slider.addEventListener("mouseenter", function () { clearInterval(timer); });
    slider.addEventListener("mouseleave", auto);
    if (n < 2) $$(".slide-nav, .slide-dots", slider).forEach(function (el) { el.hidden = true; });
    mark(); auto();
  }

  // ---------------- carousels
  function initCarousel(c) {
    var tr = $(".car-track", c), prev = $(".prev", c), next = $(".next", c);
    if (!tr || c._init) return; c._init = true;
    var upd = function () { prev.disabled = tr.scrollLeft < 5; next.disabled = tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 5; };
    $$("[data-car]", c).forEach(function (b) { b.addEventListener("click", function () { tr.scrollBy({ left: Number(b.dataset.car) * tr.clientWidth * 0.85, behavior: "smooth" }); }); });
    tr.addEventListener("scroll", upd, { passive: true }); window.addEventListener("resize", upd); upd();
  }

  // ---------------- recently viewed
  var pdp = $("[data-product]");
  if (pdp) {
    var rv = store.get(RECENT, []).filter(function (x) { return x !== pdp.dataset.product; });
    rv.unshift(pdp.dataset.product); store.set(RECENT, rv.slice(0, 12));
  }
  var recentBoxes = $$("[data-recent]");
  if (recentBoxes.length) {
    var ids = store.get(RECENT, []).filter(function (x) { return !pdp || x !== pdp.dataset.product; });
    if (ids.length) catalog().then(function (cat) {
      var by = byId(cat), items = ids.map(function (i) { return by[i]; }).filter(Boolean);
      if (!items.length) return;
      recentBoxes.forEach(function (box) {
        $("[data-recent-track]", box).innerHTML = items.map(function (p) {
          var o = off(p);
          return '<li class="ccard"><a href="' + p.url + '"><span class="ccard-img"><img src="' + esc(p.image) + '" alt="" loading="lazy"></span>' + (o >= 10 ? '<span class="deal-pill">' + o + "% off</span>" : "") + '<span class="ccard-price"><sup>₹</sup>' + num(p.price) + "</span><span class=\"ccard-title\">" + esc(p.title) + "</span></a></li>";
        }).join("");
        box.hidden = false; initCarousel($("[data-carousel]", box));
      });
    });
  }
  $$("[data-carousel]").forEach(function (c) { if (!c.closest("[data-recent]")) initCarousel(c); });

  // ---------------- listing: filters + sort
  var listing = $("[data-listing]");
  var fBox = $("[data-filters]");
  function filters(open) { if (fBox) { fBox.classList.toggle("open", open); document.body.classList.toggle("lock", open && innerWidth < 900); } }
  if (listing && $("[data-grid]", listing)) {
    var grid = $("[data-grid]", listing), cards = $$(".pcard", grid), sortSel = $("[data-sort]", listing), cnt = $("[data-count]", listing), none = $("[data-noresults]", listing);
    var q1 = new URLSearchParams(location.search);
    if (q1.get("sort") && sortSel.querySelector('option[value="' + q1.get("sort") + '"]')) sortSel.value = q1.get("sort");
    if (q1.get("sort") === "deals") fBox.deal.checked = true;
    var apply = function () {
      var pr = (fBox.querySelector('input[name="price"]:checked') || {}).value || "", lo = 0, hi = Infinity;
      if (pr) { var a = pr.split("-"); lo = +a[0]; hi = +a[1]; }
      var deal = fBox.querySelector('input[name="deal"]').checked, inst = fBox.querySelector('input[name="instock"]').checked, shown = 0;
      cards.forEach(function (c) {
        var ok = +c.dataset.price >= lo && +c.dataset.price < hi && (!deal || +c.dataset.off >= 10) && (!inst || c.dataset.stock === "1");
        c.hidden = !ok; if (ok) shown++;
      });
      var s = sortSel.value, key = {
        featured: function (c) { return [1 - +c.dataset.stock, +c.dataset.order]; },
        "price-asc": function (c) { return [+c.dataset.price]; },
        "price-desc": function (c) { return [-c.dataset.price]; },
        "new": function (c) { return [-Date.parse(c.dataset.date || 0), +c.dataset.order]; },
        deals: function (c) { return [-c.dataset.off, +c.dataset.order]; },
      }[s] || function () { return [0]; };
      cards.slice().sort(function (a, b) { var x = key(a), y = key(b); for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; }).forEach(function (c) { grid.appendChild(c); });
      cnt.textContent = shown; none.hidden = shown > 0;
    };
    fBox.addEventListener("change", apply); sortSel.addEventListener("change", apply);
    var reset = $("[data-filter-reset]", listing);
    if (reset) reset.addEventListener("click", function () { fBox.querySelector('input[name="price"]').checked = true; $$('input[type="checkbox"]', fBox).forEach(function (i) { i.checked = false; }); apply(); });
    apply();
  }
  $$("[data-filter-open]").forEach(function (b) { b.addEventListener("click", function () { filters(true); }); });
  $$("[data-filter-close]").forEach(function (b) { b.addEventListener("click", function () { filters(false); }); });

  // ---------------- product page
  var gal = $("[data-gallery]");
  if (gal) $$("[data-thumb]", gal).forEach(function (b) {
    var show = function () { $$("[data-thumb]", gal).forEach(function (x) { x.classList.toggle("on", x === b); }); $$("[data-pic]", gal).forEach(function (p) { p.classList.toggle("on", p.dataset.pic === b.dataset.thumb); }); };
    b.addEventListener("click", show); b.addEventListener("mouseenter", show);
  });
  $$("[data-eta]").forEach(function (el) { var p = el.dataset.eta.split("|"), t = eta(p[0], p[1]); if (t) el.innerHTML = "<br>Delivery <b>" + t + "</b>"; });
  var form = $("#add-to-cart");
  if (form) {
    var cn = $("[data-colour-name]", form);
    if (cn) form.addEventListener("change", function (e) { if (e.target.name === "colour") cn.textContent = e.target.value; });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var qty = Math.max(1, Math.min(20, parseInt(form.qty.value, 10) || 1));
      var colour = form.colour ? form.colour.value : "";
      add(form.dataset.id, colour, qty);
      if (e.submitter && e.submitter.value === "buy") { location.href = "/checkout/"; return; }
      catalog().then(function (cat) { addedToast(byId(cat)[form.dataset.id]); }).catch(function () { addedToast(); });
    });
  }

  // ---------------- cart page
  var cartEl = $("#cart");
  function renderCart() {
    catalog().then(function (cat) {
      var ls = lines(cat);
      if (!ls.length) {
        cartEl.innerHTML = '<div class="cart-empty"><svg viewBox="0 0 32 32" width="110" height="110" aria-hidden="true"><path d="M2 5h4l3.2 14.2a1.5 1.5 0 0 0 1.5 1.2h13.6a1.5 1.5 0 0 0 1.5-1.1L28 10H8" fill="none" stroke="#c9cccc" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="26" r="2" fill="#c9cccc"/><circle cx="23" cy="26" r="2" fill="#c9cccc"/></svg><div><h1>Your Speed Wheels cart is empty</h1><p><a href="/shop/?sort=deals">Shop today\'s deals</a></p><a class="btn btn-pay" href="/shop/">Continue shopping</a></div></div>';
        return;
      }
      var sub = ls.reduce(function (a, x) { return a + x.total; }, 0), items = ls.reduce(function (a, x) { return a + x.l.qty; }, 0);
      var s = cat.shipping || {}, freeAt = Number(s.freeAbove || 0);
      var opts = function (q) { var o = ""; for (var i = 1; i <= Math.max(10, q); i++) o += "<option" + (i === q ? " selected" : "") + ">" + i + "</option>"; return o; };
      var rows = ls.map(function (x, i) {
        var o = off(x.p);
        return '<li class="cart-line"><a href="' + x.p.url + '"><img src="' + esc(x.p.image) + '" alt="" loading="lazy"></a>' +
          '<div class="cl-main"><a href="' + x.p.url + '" class="cl-title">' + esc(x.p.title) + "</a>" +
          (x.p.inStock ? '<span class="stock in small">In stock</span>' : '<span class="stock out small">Currently unavailable, please delete</span>') +
          (freeAt && x.p.price >= freeAt ? '<span class="small muted">Eligible for FREE shipping</span>' : "") +
          (x.l.colour ? '<span class="small"><b>Colour:</b> ' + esc(x.l.colour) + "</span>" : "") +
          (o ? '<span class="small"><span class="deal-pill">' + o + '% off</span> <span class="muted">M.R.P. <s>' + inr(x.p.mrp) + "</s></span></span>" : "") +
          '<div class="cl-tools"><label class="cl-qty">Qty: <select data-q="' + i + '">' + opts(x.l.qty) + '</select></label><span class="sep"></span><button type="button" class="link-btn" data-rm="' + i + '">Delete</button><span class="sep"></span><a class="link-btn" href="' + x.p.url + '">See more like this</a></div></div>' +
          '<strong class="cl-total">' + inr(x.total) + "</strong></li>";
      }).join("");
      var pct = freeAt ? Math.min(100, Math.round(sub / freeAt * 100)) : 100;
      var shipMsg = !freeAt ? "" : sub >= freeAt ? '<p class="ship-ok">✓ Your order is eligible for <b>FREE delivery</b>.</p><div class="ship-bar"><span style="width:100%"></span></div>'
        : '<p class="small">Add <b>' + inr(freeAt - sub) + "</b> more for <b>FREE delivery</b>.</p><div class=\"ship-bar\"><span style=\"width:" + pct + '%"></span></div>';
      var subLine = "Subtotal (" + items + " item" + (items === 1 ? "" : "s") + "): <b>" + inr(sub) + "</b>";
      cartEl.innerHTML = '<div class="cart-main"><h1>Shopping Cart</h1><p class="price-label">Price</p><ul class="cart-lines">' + rows + '</ul><p class="cart-sub">' + subLine + "</p></div>" +
        '<aside class="cart-side"><div class="panel">' + shipMsg + '<p class="sub">' + subLine + '</p><p class="small muted">Shipping is calculated at checkout from your state.</p><a class="btn btn-cart btn-block" href="/checkout/">Proceed to Buy</a></div>' +
        '<div class="panel small"><b>Secure checkout</b><br><span class="muted">Pay with UPI, cards, netbanking or wallets through Razorpay.</span></div></aside>';
      var all = ls.map(function (x) { return x.l; });
      $$("[data-q]", cartEl).forEach(function (sel) { sel.onchange = function () { all[sel.dataset.q].qty = Math.max(1, Math.min(20, +sel.value)); write(all); renderCart(); }; });
      $$("[data-rm]", cartEl).forEach(function (b) { b.onclick = function () { all.splice(b.dataset.rm, 1); write(all); renderCart(); }; });
    }).catch(function () { cartEl.innerHTML = '<div class="panel">Couldn\'t load your cart. Please refresh.</div>'; });
  }
  if (cartEl) renderCart();

  // ---------------- checkout page
  var co = $("#checkout");
  if (co) {
    var sumEl = $("#co-summary"), itemsEl = $("#co-items"), msg = $("#co-msg"), payBtn = $("#co-pay");
    var saved = store.get("sw_addr", {}) || {};
    ["name", "phone", "email", "address", "city", "state", "pincode"].forEach(function (k) { if (saved[k] && co[k]) co[k].value = saved[k]; });
    var payLabel = "Place order and pay";
    function renderSummary() {
      catalog().then(function (cat) {
        var ls = lines(cat);
        if (!ls.length) { location.href = "/cart/"; return; }
        var sub = ls.reduce(function (a, x) { return a + x.total; }, 0), n = ls.reduce(function (a, x) { return a + x.l.qty; }, 0);
        var ship = co.state.value ? shippingFor(cat.shipping, sub, co.state.value) : null;
        var when = eta((cat.shipping || {}).dispatchDays, (cat.shipping || {}).deliveryDays);
        var cEl = $("[data-co-count]"); if (cEl) cEl.textContent = "(" + n + " item" + (n === 1 ? "" : "s") + ")";
        itemsEl.innerHTML = (when ? '<p class="small">Estimated delivery: <b class="eta" style="color:var(--ok)">' + when + "</b></p>" : "") + ls.map(function (x) {
          return '<div class="co-item"><img src="' + esc(x.p.image) + '" alt=""><div><b>' + esc(x.p.title) + "</b>" + (x.l.colour ? '<br><span class="small muted">Colour: ' + esc(x.l.colour) + "</span>" : "") + '<br><span class="small">Qty: ' + x.l.qty + " × " + inr(x.p.price) + "</span></div><b>" + inr(x.total) + "</b></div>";
        }).join("");
        sumEl.innerHTML = '<div class="row"><span>Items (' + n + "):</span><span>" + inr(sub) + "</span></div>" +
          '<div class="row"><span>Delivery:</span><span>' + (ship === null ? "Choose your state" : ship === 0 ? "FREE" : inr(ship)) + "</span></div>" +
          '<div class="row total"><span>Order Total:</span><span>' + inr(sub + (ship || 0)) + "</span></div>";
        payLabel = "Place order and pay " + inr(sub + (ship || 0));
        if (!payBtn.disabled) payBtn.textContent = payLabel;
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
    function busy(on, text) { payBtn.disabled = on; payBtn.textContent = text || payLabel; }
    function err(t) { msg.textContent = t; msg.hidden = !t; if (t) msg.scrollIntoView({ block: "center", behavior: "smooth" }); }

    co.addEventListener("submit", function (e) {
      e.preventDefault(); err("");
      if (!co.reportValidity()) return;
      var customer = {}; ["name", "phone", "email", "address", "city", "state", "pincode"].forEach(function (k) { customer[k] = co[k].value.trim(); });
      store.set("sw_addr", customer);
      busy(true, "Please wait…");
      Promise.all([loadRzp(), fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: read(), customer: customer }) })
        .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Server error (" + r.status + ")" }; }); })])
        .then(function (res) {
          var o = res[1];
          if (!o.ok) throw new Error(o.error || "Something went wrong.");
          var rz = new window.Razorpay({
            key: o.keyId, order_id: o.razorpayOrderId, amount: o.amount, currency: "INR",
            name: "Speed Wheels", description: "Order " + o.orderId, image: location.origin + "/assets/logo.png",
            prefill: { name: o.customer.name, email: o.customer.email, contact: "+91" + o.customer.phone },
            notes: { order_id: o.orderId }, theme: { color: "#d7141a" },
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

  // ---------------- order success
  var ok = $("#order-ok");
  if (ok) {
    var id = new URLSearchParams(location.search).get("order") || "";
    ok.textContent = id;
    var tl = $("#order-ok-track"); if (tl && id) tl.href = "/track/?order=" + encodeURIComponent(id);
    write([]);
  }

  // ---------------- tracking page
  var tf = $("#track-form");
  if (tf) {
    var out = $("#track-result");
    var tq = new URLSearchParams(location.search);
    if (tq.get("order")) tf.order.value = tq.get("order");
    var STEPS = [["paid", "Ordered"], ["packed", "Packed"], ["shipped", "Shipped"], ["delivered", "Delivered"]];
    tf.addEventListener("submit", function (e) {
      e.preventDefault();
      out.innerHTML = '<div class="track-card muted">Looking up your order…</div>';
      fetch("/api/track?order=" + encodeURIComponent(tf.order.value.trim()) + "&contact=" + encodeURIComponent(tf.contact.value.trim()))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) { out.innerHTML = '<p class="error">' + esc(d.error) + "</p>"; return; }
          var o = d.order, idx = STEPS.findIndex(function (s) { return s[0] === o.status; });
          var special = { cancelled: "This order was cancelled.", refunded: "This order was refunded." }[o.status];
          var steps = special ? '<p class="error">' + special + "</p>" : '<ol class="steps">' + STEPS.map(function (s, i) { return '<li class="' + (i <= idx ? "done" : "") + '">' + s[1] + "</li>"; }).join("") + "</ol>";
          var ship = o.tracking_no || o.courier ? '<div class="ship-box"><p><strong>' + esc(o.courier || "Courier") + "</strong>" + (o.tracking_no ? "<br>Tracking number: <strong>" + esc(o.tracking_no) + "</strong>" : "") + "</p>" +
            (o.tracking_url ? '<a class="btn btn-pay" target="_blank" rel="noopener" href="' + esc(o.tracking_url) + '">Track with courier</a>' : "") + "</div>" : "";
          out.innerHTML = '<div class="track-card"><h2>Order ' + esc(o.id) + "</h2>" + steps + ship +
            '<div class="summary">' + o.items.map(function (l) { return '<div class="row"><span>' + l.qty + " × " + esc(l.title) + (l.colour ? " (" + esc(l.colour) + ")" : "") + "</span><span>" + inr(l.lineTotal) + "</span></div>"; }).join("") +
            '<div class="row total"><span>Total paid</span><span>' + inr(o.total) + "</span></div></div>" +
            '<p class="muted small">Delivering to ' + esc(o.name) + ", " + esc(o.city) + ", " + esc(o.state) + " " + esc(o.pincode) + "</p></div>";
        })
        .catch(function () { out.innerHTML = '<p class="error">Tracking is temporarily unavailable. Please try again.</p>'; });
    });
  }

  badge();
})();
