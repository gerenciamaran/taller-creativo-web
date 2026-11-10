/* Academia Taller Creativo — tienda: moneda, carrito y pagos.
   Todo lo que se configura está en el bloque CONFIG. */
(function () {
  "use strict";

  // ===================== CONFIG ============================================
  var CONFIG = {
    // WhatsApp de la Academia (código de país, sin signos).
    whatsapp: "573102454446",

    // Enlaces de pago por producto. Un producto sin enlace no muestra botón
    // de esa pasarela; siempre queda disponible "Pedir por WhatsApp".
    //   gumroad → cobra en dólares (US$)     hotmart → cobra en pesos (COP)
    //   wompi   → cobra en pesos (PSE, Nequi, tarjeta)
    links: {
      gumroad: { dibujo: "", pintura: "", jabones: "", velas: "", "dibujo-pintura": "", "jabones-velas": "", "paquete-completo": "" },
      hotmart: { dibujo: "", pintura: "", jabones: "", velas: "", "dibujo-pintura": "", "jabones-velas": "", "paquete-completo": "" },
      wompi:   { dibujo: "", pintura: "", jabones: "", velas: "", "dibujo-pintura": "", "jabones-velas": "", "paquete-completo": "" }
    },

    // Precios por cantidad de guías en el carrito.
    prices: {
      cop: { one: 24000, two: 36000, three: 48000, four: 55900, preset: 29900 },
      usd: { one: 6,     two: 9,     three: 12,    four: 14,    preset: 7.5 }
    }
  };
  // ==========================================================================

  var GUIDES = {
    dibujo:  "Dibujo Desde Cero",
    pintura: "Pintura Desde Cero",
    jabones: "Jabones Artesanales",
    velas:   "Velas Artesanales"
  };
  // Parejas que ya son paquete con descuento → producto propio.
  var PRESETS = { "dibujo+pintura": "dibujo-pintura", "jabones+velas": "jabones-velas" };
  var PROVIDERS = [
    { id: "gumroad", label: "Pagar con tarjeta", cur: "usd" },
    { id: "hotmart", label: "Pagar en pesos (Hotmart)", cur: "cop" },
    { id: "wompi",   label: "Pagar con PSE o Nequi", cur: "cop" }
  ];

  var currency = "cop";
  try {
    currency = Intl.DateTimeFormat().resolvedOptions().timeZone === "America/Bogota" ? "cop" : "usd";
    var savedCur = localStorage.getItem("tc_currency");
    if (savedCur === "usd" || savedCur === "cop") currency = savedCur;
  } catch (e) {}

  var cart = [];
  try {
    var raw = JSON.parse(localStorage.getItem("tc_cart") || "[]");
    cart = raw.filter(function (k, i) { return GUIDES[k] && raw.indexOf(k) === i; });
  } catch (e) {}

  function saveCart() { try { localStorage.setItem("tc_cart", JSON.stringify(cart)); } catch (e) {} }

  function money(n, cur) {
    cur = cur || currency;
    if (cur === "cop") return "COP $" + n.toLocaleString("es-CO");
    return "US$" + (n % 1 ? n.toFixed(2).replace(".", ",") : n);
  }
  function waLink(text) { return "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(text); }

  // ---------- precios del carrito ------------------------------------------
  function sortedKeys() { return cart.slice().sort(); }
  function skuOf(keys) {
    if (keys.length === 1) return keys[0];
    if (keys.length === 4) return "paquete-completo";
    if (keys.length === 2) return PRESETS[keys.join("+")] || "";
    return "";
  }
  function totalFor(n, keys, cur) {
    var p = CONFIG.prices[cur];
    if (n === 0) return 0;
    if (n === 1) return p.one;
    if (n === 2) return PRESETS[keys.join("+")] ? p.preset : p.two;
    if (n === 3) return p.three;
    return p.four;
  }
  function hintFor(n, keys) {
    var p = CONFIG.prices[currency];
    if (n === 1) return "Suma otra guía y pagas menos por cada una.";
    if (n === 2) return PRESETS[keys.join("+")]
      ? "¡Paquete con descuento aplicado!"
      : "Tip: Dibujo + Pintura y Jabones + Velas cuestan " + money(p.preset) + " cada paquete.";
    if (n === 3) return "Con las 4 guías pagas solo " + money(p.four - p.three) + " más.";
    if (n === 4) return "¡Paquete completo aplicado: el mejor precio!";
    return "";
  }

  // ---------- carrito: interfaz --------------------------------------------
  var drawer = document.getElementById("cart");
  var overlay = document.getElementById("cart-overlay");

  function openCart() {
    if (!drawer) return;
    drawer.classList.add("open"); overlay.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    var c = drawer.querySelector(".cart-close"); if (c) c.focus();
  }
  function closeCart() {
    if (!drawer) return;
    drawer.classList.remove("open"); overlay.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
  }

  function add(keys, open) {
    keys.forEach(function (k) { if (GUIDES[k] && cart.indexOf(k) < 0) cart.push(k); });
    saveCart(); render();
    if (open !== false) openCart();
  }
  function remove(key) { cart = cart.filter(function (k) { return k !== key; }); saveCart(); render(); }

  function render() {
    var n = cart.length, keys = sortedKeys();

    // Precios estáticos de la página
    document.querySelectorAll("[data-usd]").forEach(function (el) {
      el.textContent = el.getAttribute("data-" + currency);
    });
    document.querySelectorAll(".currency button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-cur") === currency));
    });

    // Insignia del carrito y botones "agregar"
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = n; el.hidden = n === 0;
    });
    document.querySelectorAll("[data-add]").forEach(function (b) {
      var inCart = cart.indexOf(b.getAttribute("data-add")) >= 0;
      b.classList.toggle("in-cart", inCart);
      var label = b.querySelector(".lbl");
      if (label) label.textContent = inCart ? "En tu carrito" : (b.getAttribute("data-label") || "Agregar al carrito");
    });

    // Enlaces de WhatsApp "sueltos"
    document.querySelectorAll("[data-wa]").forEach(function (a) {
      a.href = waLink(a.getAttribute("data-wa")); a.target = "_blank"; a.rel = "noopener";
    });

    if (!drawer) return;
    var list = drawer.querySelector(".cart-items");
    var empty = drawer.querySelector(".cart-empty");
    var summary = drawer.querySelector(".cart-summary");
    list.innerHTML = "";
    empty.hidden = n > 0; summary.hidden = n === 0;

    var one = CONFIG.prices[currency].one;
    keys.forEach(function (k) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="ci-name"></span><span class="ci-price"></span><button type="button" class="ci-x" aria-label="Quitar"></button>';
      li.querySelector(".ci-name").textContent = GUIDES[k];
      li.querySelector(".ci-price").textContent = money(one);
      li.querySelector(".ci-x").textContent = "×";
      li.querySelector(".ci-x").setAttribute("aria-label", "Quitar " + GUIDES[k]);
      li.querySelector(".ci-x").addEventListener("click", function () { remove(k); });
      list.appendChild(li);
    });
    if (n === 0) return;

    var total = totalFor(n, keys, currency);
    var saving = one * n - total;
    drawer.querySelector(".cart-total").textContent = money(total);
    var sv = drawer.querySelector(".cart-saving");
    sv.textContent = saving > 0 ? "Ahorras " + money(saving) : "";
    sv.hidden = saving <= 0;
    drawer.querySelector(".cart-hint").textContent = hintFor(n, keys);

    // Botones de pago
    var sku = skuOf(keys);
    var box = drawer.querySelector(".cart-pay");
    box.innerHTML = "";
    var titles = keys.map(function (k) { return GUIDES[k]; }).join(" + ");
    var any = false;
    PROVIDERS.forEach(function (pv) {
      var url = sku && CONFIG.links[pv.id] && CONFIG.links[pv.id][sku];
      if (!url) return;
      any = true;
      var a = document.createElement("a");
      a.className = "btn btn-block";
      a.href = url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = pv.label + " · " + money(totalFor(n, keys, pv.cur), pv.cur);
      box.appendChild(a);
    });
    var wa = document.createElement("a");
    wa.className = any ? "btn btn-block btn-ghost" : "btn btn-block";
    wa.href = waLink("Hola, quiero comprar " + titles + " (" + money(total) + ") de la Academia Taller Creativo");
    wa.target = "_blank"; wa.rel = "noopener";
    wa.textContent = any ? "Pedir por WhatsApp" : "Pedir por WhatsApp y pagar";
    box.appendChild(wa);
    drawer.querySelector(".cart-note").textContent = any
      ? "Pago seguro. Recibes tu guía apenas se confirma el pago."
      : "Te enviamos el enlace de pago por WhatsApp. Recibes tu guía apenas se confirma el pago.";
  }

  // ---------- eventos ------------------------------------------------------
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentNode;
    var addBtn = t.closest("[data-add]");
    if (addBtn) {
      e.preventDefault();
      var k = addBtn.getAttribute("data-add");
      if (cart.indexOf(k) >= 0) openCart(); else add([k]);
      return;
    }
    var pack = t.closest("[data-add-pack]");
    if (pack) { e.preventDefault(); add(pack.getAttribute("data-add-pack").split(",")); return; }
    if (t.closest("[data-open-cart]")) { e.preventDefault(); openCart(); return; }
    if (t.closest(".cart-close") || t === overlay) { closeCart(); return; }
    var cur = t.closest(".currency button");
    if (cur) {
      currency = cur.getAttribute("data-cur");
      try { localStorage.setItem("tc_currency", currency); } catch (err) {}
      render();
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCart(); });

  var y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
  render();
})();
