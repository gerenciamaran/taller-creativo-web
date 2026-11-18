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

    if (quizEl && quiz.done) renderQuiz();

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


  // ---------- buscador «tu taller a la medida» ------------------------------
  // 3 preguntas → recomienda una guía o un paquete. Los textos de cada guía son los reales de la página.
  var QUIZ_STEPS = [
    { id: "interes", q: "¿Qué te gustaría crear?", opts: [
      ["dibujo",   "Dibujar",          "Formas, proporción, luz y sombra"],
      ["pintura",  "Pintar",           "Color y mezcla en acrílico"],
      ["jabones",  "Jabones",          "De glicerina, aptos para principiantes"],
      ["velas",    "Velas",            "Aromáticas, de cera de soja"],
      ["explorar", "Aún no lo sé",     "Quiero explorar y decidir"]
    ] },
    { id: "nivel", q: "¿Cuánta experiencia tienes?", opts: [
      ["cero", "Voy desde cero",           "Nunca lo he intentado"],
      ["poco", "He practicado un poco",    "Ya probé por mi cuenta"],
      ["ya",   "Ya lo hago",               "Quiero mejorar y ordenar lo que sé"]
    ] },
    { id: "meta", q: "¿Para qué lo quieres?", opts: [
      ["hobby",   "Disfrutar y relajarme", "Un tiempo para mí"],
      ["regalar", "Hacer regalos únicos",  "Detalles hechos por mí"],
      ["vender",  "Vender y generar ingresos", "Un ingreso extra"]
    ] }
  ];
  var quiz = { step: 0, answers: {}, done: false };
  var quizEl = document.getElementById("quiz");

  function quizRecommend(a) {
    var keys;
    if (a.interes === "explorar") keys = a.meta === "hobby" ? ["dibujo", "pintura"] : ["jabones", "velas"];
    else keys = [a.interes];
    if ((a.interes === "jabones" || a.interes === "velas") && (a.meta === "vender" || a.meta === "regalar")) keys = ["jabones", "velas"];
    keys.sort();
    var pair = keys.length === 2;
    var title = pair ? keys.map(function (k) { return GUIDES[k].replace(" Desde Cero", "").replace(" Artesanales", ""); }).join(" + ") : GUIDES[keys[0]];

    var why = [];
    var about = {
      dibujo:  "Dibujo Desde Cero va de las formas básicas y la proporción hasta tu primer dibujo terminado, con rostro incluido.",
      pintura: "Pintura Desde Cero enseña teoría del color y mezcla en acrílico, de paisajes a tu primer cuadro terminado.",
      jabones: "Jabones Artesanales usa base de glicerina, sin soda cáustica, así que es apta para principiantes.",
      velas:   "Velas Artesanales usa cera de soja natural en envase de vidrio, sin parafina."
    };
    keys.forEach(function (k) { why.push(about[k]); });
    if (a.nivel === "cero") why.push("Está pensada para empezar desde cero, sin experiencia previa.");
    else if (a.nivel === "poco") why.push("Con lo que ya practicaste, avanzas módulo a módulo; cada uno termina con un ejercicio.");
    else why.push("Como ya tienes práctica, ve al ritmo que quieras: cada módulo tiene su propio ejercicio.");
    var soap = keys.indexOf("jabones") >= 0 || keys.indexOf("velas") >= 0;
    if (a.meta === "vender") why.push(soap ? "Incluye plantillas de costos, etiquetas y catálogo, y tus primeros pasos para vender." : "Incluye una guía de costos y precio de venta para que le pongas precio a lo que creas.");
    else if (a.meta === "regalar") why.push(soap ? "Creas regalos artesanales con diseño y presentación." : "Lo que aprendas lo puedes convertir en regalos hechos por ti.");
    else why.push("Practicas a tu ritmo, con ejercicios cortos y sin presión.");
    return { keys: keys, title: title, why: why, pair: pair };
  }

  function quizHtml(inner) { quizEl.innerHTML = inner; }
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function renderQuiz() {
    if (!quizEl) return;
    var total = QUIZ_STEPS.length;
    if (!quiz.done) {
      var st = QUIZ_STEPS[quiz.step];
      var html = '<div class="quiz-top"><span class="quiz-step">Pregunta ' + (quiz.step + 1) + ' de ' + total + '</span>' +
        '<div class="quiz-track" aria-hidden="true"><i style="width:' + Math.round((quiz.step / total) * 100) + '%"></i></div></div>' +
        '<h3 class="quiz-q">' + esc(st.q) + '</h3><div class="quiz-opts">';
      st.opts.forEach(function (o) {
        html += '<button type="button" class="quiz-opt" data-q-opt="' + o[0] + '"><b>' + esc(o[1]) + '</b><span>' + esc(o[2]) + '</span></button>';
      });
      html += '</div>';
      if (quiz.step > 0) html += '<button type="button" class="quiz-link" data-q-back>← Volver</button>';
      quizHtml(html);
      return;
    }
    var r = quizRecommend(quiz.answers);
    var n = r.keys.length;
    var one = CONFIG.prices[currency].one;
    var tot = totalFor(n, r.keys, currency);
    var saving = one * n - tot;
    var allIn = r.keys.every(function (k) { return cart.indexOf(k) >= 0; });
    var detail = r.pair ? "#paquetes" : "/guias/" + r.keys[0];
    var h = '<div class="quiz-top"><span class="quiz-step">Tu recomendación</span><div class="quiz-track" aria-hidden="true"><i style="width:100%"></i></div></div>' +
      '<div class="quiz-result"><p class="quiz-kicker">' + (r.pair ? "Tu paquete a la medida" : "Tu taller a la medida") + '</p>' +
      '<h3 class="quiz-title">' + esc(r.title) + '</h3><ul class="quiz-why">';
    r.why.forEach(function (w) { h += "<li>" + esc(w) + "</li>"; });
    h += '</ul><p class="quiz-price"><b>' + money(tot) + '</b>' + (saving > 0 ? ' <span>Ahorras ' + money(saving) + '</span>' : '') + '</p>' +
      '<div class="quiz-cta"><button type="button" class="btn" data-q-add>' + (allIn ? "Ya está en tu carrito" : "Agregar al carrito") + '</button>' +
      '<a class="btn btn-ghost" href="' + detail + '">' + (r.pair ? "Ver paquetes" : "Ver la guía") + '</a></div>' +
      '<p class="quiz-alt">¿Prefieres llevarte todo? <a href="#" data-add-pack="dibujo,pintura,jabones,velas">Paquete completo · ' + money(CONFIG.prices[currency].four) + '</a></p></div>' +
      '<button type="button" class="quiz-link" data-q-restart>↺ Volver a empezar</button>';
    quizHtml(h);
  }

  function quizClick(e) {
    var t = e.target.closest ? e.target : e.target.parentNode;
    var opt = t.closest("[data-q-opt]");
    if (opt) {
      quiz.answers[QUIZ_STEPS[quiz.step].id] = opt.getAttribute("data-q-opt");
      if (quiz.step < QUIZ_STEPS.length - 1) quiz.step += 1; else quiz.done = true;
      renderQuiz();
      var focus = quizEl.querySelector(".quiz-opt, .quiz-result .btn"); if (focus) focus.focus({ preventScroll: true });
      return true;
    }
    if (t.closest("[data-q-back]")) { quiz.step = Math.max(0, quiz.step - 1); renderQuiz(); return true; }
    if (t.closest("[data-q-restart]")) { quiz = { step: 0, answers: {}, done: false }; renderQuiz(); return true; }
    if (t.closest("[data-q-add]")) {
      var r = quizRecommend(quiz.answers);
      if (r.keys.every(function (k) { return cart.indexOf(k) >= 0; })) openCart(); else add(r.keys);
      return true;
    }
    return false;
  }

  // ---------- eventos ------------------------------------------------------
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentNode;
    if (quizEl && quizEl.contains(t) && quizClick(e)) { e.preventDefault(); return; }
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
  renderQuiz();
  render();
})();
