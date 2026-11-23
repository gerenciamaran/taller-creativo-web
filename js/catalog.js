/* Academia Taller Creativo — catálogo en vivo.
   Lee de Supabase (solo lo publicado, lectura pública) los cursos, los descuentos por cantidad y los paquetes, calcula
   los precios del carrito y dibuja el catálogo, los paquetes y la página de cada curso.
   Lo que se crea o se cambia en /admin aparece aquí sin tocar el sitio. La URL y la clave «anon» son públicas por
   diseño; lo protege la base de datos (RLS). */
(function () {
  "use strict";

  var URL_BASE = "https://kpseadjekdezqwjjflfg.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtwc2VhZGpla2RlenF3ampmbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyMjAyNjYsImV4cCI6MjExMDc5NjI2Nn0.TG164PGiIUeUWEtUT6wLJbpDPwWI1yeqB9toYwmAayc";
  var CACHE_KEY = "tc_catalog_v2";
  var CACHE_MS = 60 * 1000;

  var TC = (window.TC = { courses: [], bundles: [], tiers: [], loaded: false });
  var esc = function (s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };
  TC.esc = esc;
  // Llamadas públicas (clave anon): funciones de la base (RPC) y funciones de borde. Responden { ok, data }.
  function call(url, body) {
    return fetch(url, { method: "POST", headers: { apikey: ANON, Authorization: "Bearer " + ANON, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (data) { return { ok: r.ok, data: data }; }); });
  }
  TC.rpc = function (name, args) { return call(URL_BASE + "/rest/v1/rpc/" + name, args); };
  TC.fn = function (name, body) { return call(URL_BASE + "/functions/v1/" + name, body); };

  // ---------- datos ----------
  function rest(path) {
    return fetch(URL_BASE + "/rest/v1/" + path, { headers: { apikey: ANON, Authorization: "Bearer " + ANON } }).then(function (r) {
      if (!r.ok) throw new Error("catalogo " + r.status);
      return r.json();
    });
  }
  function normalize(raw) {
    TC.courses = (raw.courses || []).map(function (c) {
      c.modules = (c.course_modules || []).slice().sort(function (a, b) { return a.position - b.position; }).map(function (m) {
        return { id: m.id, title: m.title, lessons: (m.course_lessons || []).slice().sort(function (a, b) { return a.position - b.position; }) };
      });
      delete c.course_modules;
      c.n_mod = c.modules.length;
      c.n_les = c.modules.reduce(function (t, m) { return t + m.lessons.length; }, 0);
      return c;
    });
    TC.tiers = (raw.tiers || []).slice().sort(function (a, b) { return a.min_qty - b.min_qty; });
    TC.bundles = (raw.bundles || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
    TC.loaded = true;
  }
  function fetchCatalog() {
    return Promise.all([
      rest("courses?select=slug,title,category,short,promise,who,bullets,learn,extras,kit,grad,cover_path,price_cop,price_usd,sort_order,course_modules(id,position,title,course_lessons(id,position,title,exercise))&status=eq.publicado&order=sort_order.asc"),
      rest("pricing_tiers?select=min_qty,percent_off&order=min_qty.asc"),
      rest("bundles?select=id,code,name,description,slugs,price_cop,price_usd,featured,sort_order&active=eq.true&order=sort_order.asc")
    ]).then(function (r) { return { courses: r[0], tiers: r[1], bundles: r[2], at: Date.now() }; });
  }
  function readCache() {
    try { var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null"); return c && c.courses ? c : null; } catch (e) { return null; }
  }

  TC.ready = new Promise(function (resolve) {
    var cached = readCache();
    if (cached) normalize(cached);
    // En la página de un curso, si el catálogo guardado no lo trae (recién publicado), se vuelve a pedir.
    var onCourse = document.getElementById("course-root"), want = onCourse ? decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "").replace(/\.html$/, "") : "";
    var known = !want || (cached && cached.courses.some(function (c) { return c.slug === want; }));
    if (cached && known && Date.now() - cached.at < CACHE_MS) return resolve(TC);
    fetchCatalog().then(function (raw) {
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(raw)); } catch (e) {}
      normalize(raw);
      resolve(TC);
    }).catch(function () { resolve(TC); });
  });

  // ---------- utilidades ----------
  TC.course = function (slug) { for (var i = 0; i < TC.courses.length; i++) if (TC.courses[i].slug === slug) return TC.courses[i]; return null; };
  TC.coverUrl = function (c) { return c && c.cover_path ? URL_BASE + "/storage/v1/object/public/covers/" + encodeURI(c.cover_path) : ""; };
  TC.icon = function (slug) { return window.TC_ICON ? window.TC_ICON(slug) : ""; };
  TC.money = function (n, cur) {
    if (cur === "usd") return "US$" + (n % 1 ? Number(n).toFixed(2).replace(".", ",") : n);
    return "COP $" + Math.round(n).toLocaleString("es-CO");
  };
  TC.unit = function (c, cur) { return cur === "usd" ? Number(c.price_usd) : Number(c.price_cop); };
  TC.minPrice = function (cur) {
    var v = TC.courses.map(function (c) { return TC.unit(c, cur); }).filter(function (x) { return x > 0; });
    return v.length ? Math.min.apply(null, v) : 0;
  };

  // ---------- precios del carrito ----------
  // Paquete con precio fijo si el carrito tiene exactamente esas guías; si no, descuento por cantidad (el de la
  // mayor cantidad que se cumple). Se redondea a 100 pesos o a 0,50 dólares.
  function roundTo(n, cur) { return cur === "usd" ? Math.round(n * 2) / 2 : Math.round(n / 100) * 100; }
  TC.price = function (slugs, cur) {
    var keys = slugs.slice().sort();
    var base = 0;
    keys.forEach(function (k) { var c = TC.course(k); if (c) base += TC.unit(c, cur); });
    var res = { total: base, base: base, saving: 0, bundle: null, sku: keys.length === 1 ? keys[0] : "" };
    if (keys.length < 2) return res;
    var pct = 0;
    TC.tiers.forEach(function (t) { if (keys.length >= t.min_qty) pct = Number(t.percent_off); });
    var tierTotal = pct > 0 ? roundTo(base * (1 - pct / 100), cur) : base;
    var best = tierTotal;
    TC.bundles.forEach(function (b) {
      var s = b.slugs.slice().sort();
      if (s.length === keys.length && s.every(function (x, i) { return x === keys[i]; })) {
        var bp = cur === "usd" ? Number(b.price_usd) : Number(b.price_cop);
        if (bp <= best) { best = bp; res.bundle = b; res.sku = b.code; }
      }
    });
    res.total = Math.min(best, base);
    res.saving = Math.max(0, base - res.total);
    return res;
  };
  TC.nextTier = function (n) {
    for (var i = 0; i < TC.tiers.length; i++) if (TC.tiers[i].min_qty > n) return TC.tiers[i];
    return null;
  };
  // Atributos de un precio que cambia con la moneda (los reemplaza app.js).
  TC.priceAttrs = function (cop, usd) {
    return 'data-cop="' + esc(TC.money(cop, "cop")) + '" data-usd="' + esc(TC.money(usd, "usd")) + '"';
  };
  TC.priceEl = function (cop, usd, tag, cls) {
    tag = tag || "span";
    return "<" + tag + ' class="' + (cls || "price") + '" ' + TC.priceAttrs(cop, usd) + ">" + esc(TC.money(cop, "cop")) + "</" + tag + ">";
  };

  // ---------- dibujo: tarjetas del catálogo ----------
  function topHtml(c, cls, href, label) {
    var cover = TC.coverUrl(c);
    var inner = cover ? '<img src="' + esc(cover) + '" alt="Portada de la guía ' + esc(c.title) + '" loading="lazy" width="960" height="504">' : TC.icon(c.slug);
    return '<a class="' + cls + (cover ? " has-cover" : " " + esc(c.grad)) + '" href="' + href + '" aria-label="' + esc(label) + '">' + inner + "</a>";
  }
  // Íconos: etiqueta de categoría sobre la portada (según el color del curso) y botón de reproducir.
  var CAT_ICON = { "g-draw": "M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.9 1.4-1.9-.4-1 .3-2.1 1.4-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10zM7.5 12a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm3-4a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z", "g-paint": "M20.7 3.3a2 2 0 0 0-2.8 0L9 12.2l2.8 2.8 8.9-8.9a2 2 0 0 0 0-2.8zM7.5 13.5C5.6 13.5 4 15 4 17c0 1.4-.8 2.5-2 3 3.5 1 8 .5 8-3.5a3.5 3.5 0 0 0-2.5-3z", "g-soap": "M12 2 3 7v10l9 5 9-5V7l-9-5zm0 2.3 6.4 3.6L12 11.5 5.6 7.9 12 4.3zM5 9.6l6 3.4v6.4l-6-3.3V9.6zm8 9.8V13l6-3.4v6.5l-6 3.3z", "g-candle": "M12 2c1.2 1.8 1.8 3 1.8 4.2A1.8 1.8 0 0 1 12 8a1.8 1.8 0 0 1-1.8-1.8C10.2 5 10.8 3.8 12 2zM8 10h8a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a1 1 0 0 1 1-1z" };
  var PLAY = "M8 5v14l11-7z";
  function svg(d) { return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  function courseCard(c) {
    var href = "/guias/" + encodeURIComponent(c.slug);
    var cover = TC.coverUrl(c);
    var inner = cover ? '<img src="' + esc(cover) + '" alt="Portada de la guía ' + esc(c.title) + '" loading="lazy" width="960" height="504">' : TC.icon(c.slug);
    var top = '<a class="guia-top ' + (cover ? "has-cover" : esc(c.grad)) + '" href="' + href + '" aria-label="Ver ' + esc(c.title) + '">' + inner +
      '<span class="g-play">' + svg(PLAY) + '</span><span class="g-cat">' + svg(CAT_ICON[c.grad] || CAT_ICON["g-draw"]) + esc(c.category || "Guía") + "</span></a>";
    return '<article class="guia ' + esc(String(c.grad).replace("g-", "gc-")) + '">' + top +
      '<div class="guia-body"><h3><a href="' + href + '">' + esc(c.title) + '</a></h3><p class="g-short">' + esc(c.short) + "</p>" +
      '<p class="g-meta"><i>' + svg(PLAY) + "</i>" + c.n_mod + " módulos · " + c.n_les + " lecciones</p>" +
      '<div class="guia-foot">' + TC.priceEl(c.price_cop, c.price_usd, "b", "price big") +
      '<button type="button" class="btn btn-sm btn-ghost" data-add="' + esc(c.slug) + '" data-label="Agregar"><span class="lbl">Agregar</span></button></div>' +
      '<a class="g-cta" href="' + href + '"><span class="g-cta-l">' + svg(PLAY) + "Ver curso</span><span aria-hidden=\"true\">›</span></a></div></article>";
  }
  function packCard(b) {
    var cop = 0, usd = 0, icons = "";
    b.slugs.forEach(function (s) {
      var c = TC.course(s);
      if (c) { cop += Number(c.price_cop); usd += Number(c.price_usd); }
      icons += '<span class="cat-ico mini">' + TC.icon(s) + "</span>";
    });
    var saveCop = Math.max(0, cop - b.price_cop), saveUsd = Math.max(0, usd - Number(b.price_usd));
    return '<article class="pack' + (b.featured ? " featured" : "") + '">' + (b.featured ? '<span class="badge-top">MEJOR PRECIO</span>' : "") +
      '<div class="pack-ico">' + icons + "</div><h3>" + esc(b.name) + '</h3><p class="pack-desc">' + esc(b.description) + "</p>" +
      '<div class="pack-price">' + TC.priceEl(b.price_cop, b.price_usd, "b") + (cop > b.price_cop ? TC.priceEl(cop, usd, "s") : "") + "</div>" +
      (saveCop > 0 ? '<p class="pack-save">Ahorras ' + TC.priceEl(saveCop, saveUsd) + "</p>" : "") +
      '<button type="button" class="btn btn-block" data-add-pack="' + esc(b.slugs.join(",")) + '">Agregar al carrito</button></article>';
  }

  // ---------- dibujo: página de un curso ----------
  function setMeta(sel, attr, val) { var el = document.querySelector(sel); if (el) el.setAttribute(attr, val); }
  function renderCoursePage() {
    var root = document.getElementById("course-root");
    if (!root) return;
    var slug = decodeURIComponent((location.pathname.split("/").filter(Boolean).pop() || "")).replace(/\.html$/, "");
    var c = TC.course(slug);
    if (!c) {
      root.innerHTML = '<section class="section"><div class="wrap"><h1>No encontramos esa guía</h1><p class="lead">Puede que ya no esté disponible. Mira todas las guías del catálogo.</p><p><a class="btn" href="/#guias">Ver las guías</a></p></div></section>';
      document.title = "Guía no encontrada · Academia Taller Creativo";
      return;
    }
    var others = TC.courses.filter(function (o) { return o.slug !== c.slug; });
    var cover = TC.coverUrl(c);
    var mods = c.modules.map(function (m, i) {
      return '<details class="mod"' + (i === 0 ? " open" : "") + '><summary><span class="mod-num">' + (i + 1) + '</span><span class="mod-title">' + esc(m.title) +
        '</span><span class="mod-count">' + m.lessons.length + ' lecciones</span></summary><ul class="lessons">' +
        m.lessons.map(function (l) { return '<li><span class="les-name">' + esc(l.title) + "</span>" + (l.exercise ? '<span class="les-do"><b>Ejercicio:</b> ' + esc(l.exercise) + "</span>" : "") + "</li>"; }).join("") +
        "</ul></details>";
    }).join("");
    var more = others.map(function (o) {
      return '<a class="more-card" href="/guias/' + encodeURIComponent(o.slug) + '">' + topHtml(o, "more-top", "/guias/" + encodeURIComponent(o.slug), o.title).replace(/^<a /, "<span ").replace(/<\/a>$/, "</span>") +
        '<span class="more-body"><b>' + esc(o.title) + "</b>" + TC.priceEl(o.price_cop, o.price_usd) + "</span></a>";
    }).join("");
    var buy = '<button type="button" class="btn btn-block" data-add="' + esc(c.slug) + '" data-label="Agregar al carrito"><span class="lbl">Agregar al carrito</span></button>';
    var ul = function (arr) { return (arr || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join(""); };
    root.innerHTML =
      '<section class="chero"><div class="wrap chero-in"><div class="chero-copy">' +
      '<p class="crumbs"><a href="/">Inicio</a> › <a href="/#guias">Guías</a> › ' + esc(c.category || "Guía") + "</p>" +
      '<span class="pill">Guía en PDF · ' + c.n_mod + " módulos · " + c.n_les + " lecciones</span>" +
      "<h1>" + esc(c.title) + '</h1><p class="lead">' + esc(c.promise) + "</p>" +
      (c.who ? '<p class="who"><b>¿Para quién es?</b> ' + esc(c.who) + "</p>" : "") +
      '<ul class="ticks"><li>Paso a paso, sin experiencia previa</li><li>Ejercicio práctico al final de cada lección</li><li>Acceso inmediato tras el pago · Garantía de 7 días</li></ul></div>' +
      '<aside class="buybox"><div class="buybox-cover ' + (cover ? "has-cover" : esc(c.grad)) + '">' + (cover ? '<img src="' + esc(cover) + '" alt="Portada de la guía ' + esc(c.title) + '">' : TC.icon(c.slug)) + "</div>" +
      '<div class="currency small" role="group" aria-label="Moneda"><button type="button" data-cur="cop" aria-pressed="true">COP Pesos</button><button type="button" data-cur="usd" aria-pressed="false">US$ Dólares</button></div>' +
      '<div class="buybox-price">' + TC.priceEl(c.price_cop, c.price_usd, "b") + "<span>Acceso de por vida</span></div>" + buy +
      '<p class="buybox-deal">Con 2 o más guías pagas menos por cada una. <a href="/#paquetes">Ver paquetes</a></p>' +
      '<ul class="buybox-list"><li>Guía completa en PDF</li><li>Plantillas y ejercicios extra</li><li>Certificado digital</li><li>Garantía de 7 días</li></ul></aside></div></section>' +
      '<section class="section"><div class="wrap two-col"><div>' +
      (c.learn && c.learn.length ? '<h2 class="left">Lo que aprenderás</h2><ul class="learn">' + ul(c.learn) + "</ul>" : "") +
      '<h2 class="left">Contenido de la guía</h2><p class="sub left">' + c.n_mod + " módulos · " + c.n_les + " lecciones, cada una con su ejercicio.</p><div class=\"mods\">" + mods + "</div></div>" +
      '<div class="side">' +
      (c.extras && c.extras.length ? '<div class="side-card"><h3>Qué incluye</h3><ul class="checks-sm">' + ul(c.extras) + "</ul></div>" : "") +
      (c.kit && c.kit.length ? '<div class="side-card"><h3>Para empezar necesitas</h3><ul class="checks-sm">' + ul(c.kit) + '</ul><p class="mini">La guía te dice qué comprar según tu presupuesto. No necesitas experiencia previa.</p></div>' : "") +
      '<div class="side-card soft"><h3>Entrega</h3><p>Apenas se confirma el pago recibes acceso a la guía en PDF y a sus lecciones en tu zona de alumnos. Si hay videos, los ves ahí mismo.</p></div></div></div></section>' +
      (document.getElementById("course-static") ? document.getElementById("course-static").innerHTML : "") +
      (others.length ? '<section class="section"><div class="wrap"><h2>También te puede interesar</h2><div class="more">' + more + "</div></div></section>" : "") +
      '<div class="buybar"><div class="buybar-in"><div class="buybar-price"><small>' + esc(c.title) + "</small>" + TC.priceEl(c.price_cop, c.price_usd, "b") +
      '</div><button type="button" class="btn" data-add="' + esc(c.slug) + '" data-label="Agregar"><span class="lbl">Agregar</span></button></div></div>';

    var title = c.title + ": guía en PDF paso a paso | Taller Creativo";
    var desc = ((c.promise || c.short || "") + " " + c.n_mod + " módulos, " + c.n_les + " lecciones. Acceso inmediato y garantía de 7 días.").trim();
    document.title = title;
    setMeta('meta[name="description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", desc);
    setMeta('link[rel="canonical"]', "href", "https://tallercreativo.com.co/guias/" + c.slug);
    setMeta('meta[property="og:url"]', "content", "https://tallercreativo.com.co/guias/" + c.slug);
    var url = "https://tallercreativo.com.co/guias/" + c.slug;
    var img = cover || "https://tallercreativo.com.co/img/og-taller-creativo.jpg";
    setMeta('meta[property="og:image"]', "content", img);
    setMeta('meta[name="twitter:image"]', "content", img);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", desc);
    // Las páginas fijas (generadas con build.py) ya traen sus datos estructurados; solo se crean para cursos nuevos.
    var old = document.getElementById("ld-course");
    if (!old || !String(old.textContent).includes('"' + url + '"')) {
      if (old) old.remove();
      var offer = { "@type": "Offer", url: url, priceCurrency: "COP", price: String(Math.round(c.price_cop)), availability: "https://schema.org/InStock", category: "Paid",
        hasMerchantReturnPolicy: { "@type": "MerchantReturnPolicy", applicableCountry: "CO", returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow", merchantReturnDays: 7, returnFees: "https://schema.org/FreeReturn", refundType: "https://schema.org/FullRefund" },
        shippingDetails: { "@type": "OfferShippingDetails", shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "COP" }, shippingDestination: { "@type": "DefinedRegion", addressCountry: "CO" },
          deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0, unitCode: "DAY" }, transitTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0, unitCode: "DAY" } } } };
      var ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = "ld-course";
      ld.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": [
        { "@type": "Course", name: c.title, description: c.promise || c.short || "", url: url, image: img, inLanguage: "es", educationalLevel: "Principiante", courseMode: "online", isAccessibleForFree: false,
          provider: { "@type": "Organization", name: "Academia Taller Creativo", url: "https://tallercreativo.com.co" }, teaches: c.learn || [], offers: offer },
        { "@type": "Product", name: c.title + " (guía en PDF)", description: c.promise || c.short || "", image: img, brand: { "@type": "Brand", name: "Academia Taller Creativo" }, offers: offer },
        { "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: "https://tallercreativo.com.co/" },
          { "@type": "ListItem", position: 2, name: "Guías", item: "https://tallercreativo.com.co/#guias" },
          { "@type": "ListItem", position: 3, name: c.title, item: url }] }] });
      document.head.appendChild(ld);
    }
  }

  // ---------- dibujo: portada ----------
  function renderHome() {
    var grid = document.getElementById("guias-grid");
    if (grid) grid.innerHTML = TC.courses.length ? TC.courses.map(courseCard).join("") : '<p class="note">Muy pronto publicaremos nuevas guías.</p>';
    var packs = document.getElementById("packs-grid");
    if (packs) {
      packs.innerHTML = TC.bundles.map(packCard).join("");
      var sec = document.getElementById("paquetes");
      if (sec) sec.hidden = TC.bundles.length === 0;
    }
    var min = TC.minPrice("cop"), minUsd = TC.minPrice("usd");
    document.querySelectorAll("[data-min-price]").forEach(function (el) {
      el.setAttribute("data-cop", "Desde " + TC.money(min, "cop"));
      el.setAttribute("data-usd", "Desde " + TC.money(minUsd, "usd"));
      el.textContent = el.getAttribute("data-cop");
    });
    document.querySelectorAll("[data-course-count]").forEach(function (el) { el.textContent = String(TC.courses.length); });
  }

  TC.renderAll = function () { renderHome(); renderCoursePage(); };
})();
