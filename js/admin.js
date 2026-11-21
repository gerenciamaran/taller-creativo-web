/* Academia Taller Creativo — panel de administración (/admin).
   Cursos (crear, editar, portada, PDF, módulos, lecciones, videos, publicar), precios y paquetes, y accesos de alumnos.
   Solo funciona para los correos de la lista de administradores; la base de datos lo exige (RLS y funciones). */
(function () {
  "use strict";
  if (document.body.getAttribute("data-page") !== "admin" || !window.TC_ZONA) return;

  var Z = window.TC_ZONA, sb = Z.sb, el = Z.el, $ = Z.$, show = Z.show, setMsg = Z.setMsg, human = Z.human;
  var GRADS = [["g-draw", "Azul (dibujo)"], ["g-paint", "Amarillo (pintura)"], ["g-soap", "Verde azulado (jabones)"], ["g-candle", "Naranja (velas)"]];
  var MAX_VIDEO = 2 * 1024 * 1024 * 1024, VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
  var IMG_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  var courses = [];          // lista para el panel (incluye borradores)
  var videoCount = {};       // curso → videos subidos
  var ed = null;             // curso que se está editando
  var dirty = false;         // hubo cambios de cursos desde la última «Actualizar sitio»

  // ---------- utilidades ----------
  function slugify(t) {
    return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }
  function field(label, control, hint) {
    return el("div", { class: "ffield" }, [el("label", {}, [label]), control, hint ? el("p", { class: "fhint", text: hint }) : null]);
  }
  function input(value, attrs) {
    var i = el("input", Object.assign({ type: "text", class: "fin" }, attrs || {}));
    i.value = value == null ? "" : value;
    return i;
  }
  function area(value, rows, attrs) {
    var a = el("textarea", Object.assign({ class: "fin", rows: String(rows || 3) }, attrs || {}));
    a.value = value == null ? "" : value;
    return a;
  }
  function lines(v) { return (v || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean); }
  function btn(text, cls, fn) { var b = el("button", { type: "button", class: "btn btn-sm " + (cls || ""), text: text }); if (fn) b.addEventListener("click", fn); return b; }
  function money(n) { return "$" + Math.round(n || 0).toLocaleString("es-CO"); }
  function err(e) { setMsg((e && e.message) || "Algo salió mal.", "err"); }
  function validSlug(s) { return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 60; }

  function loadAll() {
    return Z.loadCourses().then(function (c) {
      courses = Object.keys(c).map(function (k) { return c[k]; }).sort(function (a, b) { return a.sort_order - b.sort_order; });
      return sb.from("lesson_videos").select("lesson_id").then(function (r) {
        videoCount = {};
        var byLesson = {};
        (r.data || []).forEach(function (v) { byLesson[v.lesson_id] = true; });
        courses.forEach(function (cc) {
          var n = 0;
          cc.modules.forEach(function (m) { m.lessons.forEach(function (l) { if (byLesson[l.id]) n += 1; }); });
          videoCount[cc.slug] = n;
        });
      });
    });
  }

  // ---------- pestañas ----------
  function initTabs() {
    var tabs = document.querySelectorAll(".tab");
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener("click", function () {
        Array.prototype.forEach.call(tabs, function (x) { var on = x === t; x.classList.toggle("on", on); x.setAttribute("aria-selected", String(on)); });
        ["cursos", "precios", "alumnos"].forEach(function (n) { show($("tab-" + n), n === t.getAttribute("data-tab")); });
        setMsg("");
        var which = t.getAttribute("data-tab");
        if (which === "precios") renderPricing();
        else if (which === "alumnos") renderStudents();
        else renderList();
      });
    });
  }

  // =====================================================================
  //  CURSOS: lista
  // =====================================================================
  function renderList() {
    show($("course-editor"), false);
    var host = $("course-list");
    show(host, true);
    host.textContent = "";
    host.appendChild(el("div", { class: "panel-head" }, [
      el("div", {}, [el("h2", { text: "Cursos" }), el("p", { class: "muted", text: "Lo que publiques aparece en la página y se puede vender. Los borradores solo los ves tú." })]),
      btn("+ Nuevo curso", "", function () { openEditor(null); })
    ]));
    host.appendChild(siteCard());
    if (!courses.length) host.appendChild(el("div", { class: "empty" }, [el("h2", { text: "Todavía no hay cursos" }), el("p", { text: "Crea el primero con «Nuevo curso»." })]));
    courses.forEach(function (c) {
      var lessons = c.modules.reduce(function (t, m) { return t + m.lessons.length; }, 0);
      var thumb = el("div", { class: "ac-thumb " + (c.cover ? "" : c.grad) });
      if (c.cover) thumb.appendChild(el("img", { src: c.cover, alt: "" })); else thumb.innerHTML = c.icon;
      var pub = c.status === "publicado";
      var toggle = btn(pub ? "Ocultar" : "Publicar", "btn-ghost", function () {
        sb.rpc("set_course_status", { p_slug: c.slug, p_status: pub ? "borrador" : "publicado" }).then(function (r) {
          if (r.error) return err(r.error);
          dirty = true;
          setMsg(pub ? "«" + c.title + "» ya no se ve en la página." : "«" + c.title + "» ya está publicado en la página.", "ok");
          loadAll().then(renderList);
        });
      });
      var actions = [btn("Editar", "", function () { openEditor(c.slug); }), toggle];
      if (pub) actions.push(el("a", { class: "btn btn-sm btn-ghost", href: "/guias/" + encodeURIComponent(c.slug), target: "_blank", rel: "noopener", text: "Ver en la página" }));
      host.appendChild(el("article", { class: "ac" }, [
        thumb,
        el("div", { class: "ac-body" }, [
          el("div", { class: "ac-top" }, [el("h3", { text: c.title }), el("span", { class: "chip2 " + (pub ? "pub" : "draft"), text: pub ? "Publicado" : "Borrador" })]),
          el("p", { class: "muted", text: "/guias/" + c.slug + " · " + c.modules.length + " módulos · " + lessons + " lecciones · " + (videoCount[c.slug] || 0) + " con video · " + money(c.price_cop) + " COP / US$" + Number(c.price_usd) }),
          el("div", { class: "vactions" }, actions)
        ])
      ]));
    });
  }

  // ---------- «Actualizar sitio» (regenera las páginas fijas que lee Google) ----------
  function siteCard() {
    var status = el("p", { class: "muted site-status", text: "Revisando…" });
    var note = el("p", { class: "site-note" });
    var b = btn("Actualizar sitio", "", null);
    function paint() {
      note.textContent = dirty ? "Hay cambios que todavía no están en las páginas fijas de Google. Pulsa «Actualizar sitio»." : "";
      note.hidden = !dirty;
    }
    var built = el("p", { class: "muted site-status" });
    function loadBuilt() {
      fetch("/build-info.json?_=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!j || !j.built_at) return;
        built.textContent = "Páginas fijas generadas: " + new Date(j.built_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) + " · " + j.courses + " cursos publicados.";
      }).catch(function () {});
    }
    function loadStatus() {
      loadBuilt();
      sb.rpc("site_rebuild_status").then(function (r) {
        var s = r.data;
        if (r.error || !s) { status.textContent = ""; return; }
        if (!s.configured) { status.textContent = "Todavía no está conectado el despliegue de Vercel: el botón no funcionará hasta guardar el enlace (ver el README)."; return; }
        if (!s.requested_at) { status.textContent = "Todavía no se ha pedido ninguna actualización."; return; }
        var when = new Date(s.requested_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
        var ok = s.status === null || (s.status >= 200 && s.status < 300);
        status.textContent = "Última actualización pedida: " + when + (s.requested_by ? " (" + s.requested_by + ")" : "") + (ok ? "." : ". Vercel respondió con un error (" + s.status + "): revisa el enlace de despliegue.");
      });
    }
    b.addEventListener("click", function () {
      b.disabled = true; b.textContent = "Pidiendo…";
      sb.rpc("request_site_rebuild").then(function (r) {
        b.disabled = false; b.textContent = "Actualizar sitio";
        if (r.error) return err(r.error);
        dirty = false; paint();
        setMsg("Listo: el sitio se está actualizando. En 1 o 2 minutos las páginas de los cursos ya estarán al día para Google.", "ok");
        loadStatus();
      });
    });
    paint();
    loadStatus();
    return el("section", { class: "panel inner site-card" }, [
      el("div", { class: "panel-head" }, [
        el("div", {}, [el("h3", { text: "Páginas para buscadores" }), el("p", { class: "muted", text: "Los cursos nuevos o cambiados ya se ven al instante en la página. Este botón además regenera las páginas fijas que lee Google (tarda 1 o 2 minutos). Úsalo después de publicar, ocultar o cambiar cursos." })]),
        b
      ]),
      note, built, status
    ]);
  }

  // =====================================================================
  //  CURSOS: editor
  // =====================================================================
  function openEditor(slug) {
    var host = $("course-editor");
    show($("course-list"), false);
    show(host, true);
    setMsg("");
    host.textContent = "Cargando…";
    var base = slug ? courses.filter(function (c) { return c.slug === slug; })[0] : null;
    var lessonIds = [];
    if (base) base.modules.forEach(function (m) { m.lessons.forEach(function (l) { lessonIds.push(l.id); }); });
    var videosReq = lessonIds.length ? sb.from("lesson_videos").select("lesson_id,video_path,file_name,size_bytes").in("lesson_id", lessonIds) : Promise.resolve({ data: [] });
    var pdfReq = slug ? sb.storage.from("guides").list("", { search: slug + ".pdf", limit: 5 }) : Promise.resolve({ data: [] });
    Promise.all([videosReq, pdfReq]).then(function (res) {
      var vids = {};
      (res[0].data || []).forEach(function (v) { vids[v.lesson_id] = v; });
      var pdf = ((res[1].data) || []).filter(function (f) { return f.name === slug + ".pdf"; })[0];
      ed = {
        isNew: !base,
        slug: base ? base.slug : "",
        slugTouched: !!base,
        title: base ? base.title : "",
        category: base ? base.category : "",
        short: base ? base.short || "" : "",
        promise: base ? base.promise || "" : "",
        who: base ? base.who || "" : "",
        bullets: base ? (base.bullets || []).join("\n") : "",
        learn: base ? (base.learn || []).join("\n") : "",
        extras: base ? (base.extras || []).join("\n") : "",
        kit: base ? (base.kit || []).join("\n") : "",
        grad: base ? base.grad : "g-draw",
        coverPath: base ? base.cover_path || "" : "",
        oldCover: "",
        price_cop: base ? base.price_cop : 24000,
        price_usd: base ? Number(base.price_usd) : 6,
        status: base ? base.status : "borrador",
        sort_order: base ? base.sort_order : (courses.length + 1) * 10,
        pdf: pdf ? { size: pdf.metadata && pdf.metadata.size } : null,
        modules: base ? base.modules.map(function (m) {
          return { id: m.id, title: m.title, lessons: m.lessons.map(function (l) { return { id: l.id, title: l.title, exercise: l.exercise || "", video: vids[l.id] || null }; }) };
        }) : [{ id: "", title: "Módulo 1", lessons: [{ id: "", title: "", exercise: "", video: null }] }],
        originalLessons: lessonIds.map(function (id) { return { id: id, video: vids[id] || null }; })
      };
      renderEditor();
    }).catch(err);
  }

  function renderEditor() {
    var host = $("course-editor");
    host.textContent = "";
    var back = btn("← Volver a los cursos", "btn-ghost", function () { loadAll().then(renderList); });
    host.appendChild(el("div", { class: "panel-head" }, [el("h2", { text: ed.isNew ? "Nuevo curso" : "Editar curso" }), back]));

    // --- datos básicos ---
    var title = input(ed.title, { maxlength: "120", placeholder: "Ej. Acuarela para principiantes" });
    var slug = input(ed.slug, { maxlength: "60", placeholder: "acuarela-principiantes" });
    if (!ed.isNew) { slug.disabled = true; }
    title.addEventListener("input", function () {
      ed.title = title.value;
      if (ed.isNew && !ed.slugTouched) { ed.slug = slugify(title.value); slug.value = ed.slug; }
    });
    slug.addEventListener("input", function () { ed.slugTouched = true; ed.slug = slug.value.trim(); });
    var category = input(ed.category, { maxlength: "40", placeholder: "Ej. Pintura" });
    category.addEventListener("input", function () { ed.category = category.value; });
    var grad = el("select", { class: "fin" }, GRADS.map(function (g) { return el("option", { value: g[0], text: g[1] }); }));
    grad.value = ed.grad;
    grad.addEventListener("change", function () { ed.grad = grad.value; });
    var short = area(ed.short, 2, { maxlength: "400" }); short.addEventListener("input", function () { ed.short = short.value; });
    var promise = area(ed.promise, 3, { maxlength: "800" }); promise.addEventListener("input", function () { ed.promise = promise.value; });
    var who = area(ed.who, 2, { maxlength: "500" }); who.addEventListener("input", function () { ed.who = who.value; });
    var bullets = area(ed.bullets, 3); bullets.addEventListener("input", function () { ed.bullets = bullets.value; });
    var learn = area(ed.learn, 5); learn.addEventListener("input", function () { ed.learn = learn.value; });
    var extras = area(ed.extras, 4); extras.addEventListener("input", function () { ed.extras = extras.value; });
    var kit = area(ed.kit, 3); kit.addEventListener("input", function () { ed.kit = kit.value; });
    var pc = input(ed.price_cop, { type: "number", min: "0", step: "100" }); pc.addEventListener("input", function () { ed.price_cop = pc.value; });
    var pu = input(ed.price_usd, { type: "number", min: "0", step: "0.5" }); pu.addEventListener("input", function () { ed.price_usd = pu.value; });
    var order = input(ed.sort_order, { type: "number", step: "10" }); order.addEventListener("input", function () { ed.sort_order = order.value; });

    host.appendChild(el("section", { class: "panel" }, [
      el("h3", { text: "Datos del curso" }),
      el("div", { class: "grid2" }, [
        field("Título *", title), field("Dirección web *", slug, ed.isNew ? "Así queda el enlace: tallercreativo.com.co/guias/" + (ed.slug || "…") + ". No se puede cambiar después." : "tallercreativo.com.co/guias/" + ed.slug),
        field("Categoría", category, "Sale en la etiqueta de la tarjeta (Dibujo, Pintura…)."), field("Color de la tarjeta (si no hay portada)", grad)
      ]),
      field("Resumen corto (para la tarjeta del catálogo)", short),
      field("Promesa del curso (arriba de la página del curso)", promise),
      field("¿Para quién es?", who),
      el("div", { class: "grid2" }, [
        field("3 ideas para la tarjeta (una por línea)", bullets), field("Lo que aprenderás (una idea por línea)", learn),
        field("Qué incluye (una por línea)", extras), field("Para empezar necesitas (una por línea)", kit)
      ]),
      el("div", { class: "grid3" }, [
        field("Precio en pesos (COP) *", pc), field("Precio en dólares (US$) *", pu), field("Orden en el catálogo", order, "Los números más bajos salen primero.")
      ])
    ]));

    // --- portada y PDF ---
    var coverBox = el("div", { class: "cover-box" });
    function paintCover() {
      coverBox.textContent = "";
      var url = Z.coverUrl(ed.coverPath);
      coverBox.appendChild(url ? el("img", { src: url, alt: "Portada" }) : el("div", { class: "cover-empty", text: "Sin portada" }));
    }
    paintCover();
    var coverFile = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: "" });
    coverFile.addEventListener("change", function () {
      var f = coverFile.files && coverFile.files[0];
      coverFile.value = "";
      if (!f) return;
      if (!IMG_TYPES[f.type]) return setMsg("La portada debe ser JPG, PNG o WebP.", "err");
      if (f.size > 5 * 1024 * 1024) return setMsg("La portada pesa más de 5 MB.", "err");
      if (!validSlug(ed.slug)) return setMsg("Primero escribe el título (y la dirección web) del curso.", "err");
      var path = ed.slug + "-" + Date.now() + "." + IMG_TYPES[f.type];
      setMsg("Subiendo la portada…");
      sb.storage.from("covers").upload(path, f, { contentType: f.type, upsert: false }).then(function (r) {
        if (r.error) return err(r.error);
        if (ed.coverPath && !ed.oldCover) ed.oldCover = ed.coverPath;
        ed.coverPath = path;
        paintCover();
        setMsg("Portada subida. Se aplica al guardar el curso.", "ok");
      });
    });
    var pdfInfo = el("span", { class: "vstatus" + (ed.pdf ? " has" : ""), text: ed.pdf ? "PDF subido" + (ed.pdf.size ? " · " + human(ed.pdf.size) : "") : "Sin PDF" });
    var pdfFile = el("input", { type: "file", accept: "application/pdf,.pdf", hidden: "" });
    pdfFile.addEventListener("change", function () {
      var f = pdfFile.files && pdfFile.files[0];
      pdfFile.value = "";
      if (!f) return;
      if (f.type !== "application/pdf") return setMsg("El archivo debe ser un PDF.", "err");
      if (f.size > 20 * 1024 * 1024) return setMsg("El PDF pesa más de 20 MB.", "err");
      if (!validSlug(ed.slug)) return setMsg("Primero escribe el título (y la dirección web) del curso.", "err");
      setMsg("Subiendo el PDF…");
      sb.storage.from("guides").upload(ed.slug + ".pdf", f, { contentType: "application/pdf", upsert: true }).then(function (r) {
        if (r.error) return err(r.error);
        ed.pdf = { size: f.size };
        pdfInfo.textContent = "PDF subido · " + human(f.size);
        pdfInfo.className = "vstatus has";
        setMsg("PDF subido.", "ok");
      });
    });
    var pdfView = btn("Ver PDF", "btn-ghost", function () {
      sb.storage.from("guides").createSignedUrl(ed.slug + ".pdf", 300).then(function (r) { if (r.error || !r.data) return setMsg("No hay PDF para abrir.", "err"); window.open(r.data.signedUrl, "_blank", "noopener"); });
    });
    host.appendChild(el("section", { class: "panel" }, [
      el("h3", { text: "Portada y guía en PDF" }),
      el("div", { class: "grid2" }, [
        el("div", {}, [el("label", { class: "flabel", text: "Portada (JPG, PNG o WebP; mejor 960×504)" }), coverBox,
          el("div", { class: "vactions" }, [btn("Subir portada", "", function () { coverFile.click(); }), btn("Quitar", "btn-ghost", function () { if (ed.coverPath && !ed.oldCover) ed.oldCover = ed.coverPath; ed.coverPath = ""; paintCover(); }), coverFile])]),
        el("div", {}, [el("label", { class: "flabel", text: "Guía en PDF (la ven solo quienes compraron)" }), pdfInfo,
          el("div", { class: "vactions" }, [btn("Subir PDF", "", function () { pdfFile.click(); }), pdfView, pdfFile])])
      ])
    ]));

    // --- módulos y lecciones ---
    var modsHost = el("div", { class: "mods-ed" });
    function moveItem(arr, i, d) { var j = i + d; if (j < 0 || j >= arr.length) return; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; renderMods(); }
    function renderMods() {
      modsHost.textContent = "";
      ed.modules.forEach(function (m, mi) {
        var mt = input(m.title, { placeholder: "Nombre del módulo", maxlength: "200" });
        mt.addEventListener("input", function () { m.title = mt.value; });
        var box = el("div", { class: "med" }, [
          el("div", { class: "med-head" }, [
            el("span", { class: "mod-num", text: String(mi + 1) }), mt,
            btn("↑", "btn-ghost", function () { moveItem(ed.modules, mi, -1); }), btn("↓", "btn-ghost", function () { moveItem(ed.modules, mi, 1); }),
            btn("Quitar módulo", "btn-ghost danger", function () {
              if (m.lessons.length && !window.confirm("Se quitarán el módulo y sus " + m.lessons.length + " lecciones (con su video y el avance de los alumnos) al guardar. ¿Seguir?")) return;
              ed.modules.splice(mi, 1); renderMods();
            })
          ])
        ]);
        m.lessons.forEach(function (l, li) {
          var lt = input(l.title, { placeholder: "Título de la lección", maxlength: "200" });
          lt.addEventListener("input", function () { l.title = lt.value; });
          var le = area(l.exercise, 2, { placeholder: "Ejercicio de la lección (opcional)", maxlength: "1000" });
          le.addEventListener("input", function () { l.exercise = le.value; });
          box.appendChild(el("div", { class: "led" }, [
            el("div", { class: "led-row" }, [
              el("span", { class: "led-n", text: (mi + 1) + "." + (li + 1) }), lt,
              btn("↑", "btn-ghost", function () { moveItem(m.lessons, li, -1); }), btn("↓", "btn-ghost", function () { moveItem(m.lessons, li, 1); }),
              btn("✕", "btn-ghost danger", function () {
                if (l.id && !window.confirm("Se quitará la lección (con su video y el avance de los alumnos) al guardar. ¿Seguir?")) return;
                m.lessons.splice(li, 1); renderMods();
              })
            ]),
            le,
            videoControls(l)
          ]));
        });
        box.appendChild(btn("+ Lección", "btn-ghost", function () { m.lessons.push({ id: "", title: "", exercise: "", video: null }); renderMods(); }));
        modsHost.appendChild(box);
      });
    }
    function videoControls(l) {
      var wrap = el("div", { class: "vctl" });
      if (!l.id) { wrap.appendChild(el("span", { class: "vstatus", text: "Guarda el curso para poder subir el video de esta lección." })); return wrap; }
      var status = el("span", { class: "vstatus" + (l.video ? " has" : ""), text: l.video ? "🎬 " + (l.video.file_name || "Con video") + (l.video.size_bytes ? " · " + human(l.video.size_bytes) : "") : "Sin video" });
      var file = el("input", { type: "file", accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov", hidden: "" });
      var up = btn(l.video ? "Reemplazar video" : "Subir video", "", function () { file.click(); });
      file.addEventListener("change", function () {
        var f = file.files && file.files[0];
        file.value = "";
        if (!f) return;
        var ext = VIDEO_TYPES[f.type] || (f.name.split(".").pop() || "").toLowerCase();
        if (!VIDEO_TYPES[f.type] && ["mp4", "webm", "mov"].indexOf(ext) === -1) return setMsg("El video debe ser MP4, WebM o MOV.", "err");
        if (f.size > MAX_VIDEO) return setMsg("El video pesa más de 2 GB.", "err");
        var path = ed.slug + "/" + l.id + "-" + Date.now() + "." + ext;
        up.disabled = true; up.textContent = "Subiendo… no cierres la página";
        setMsg("");
        sb.storage.from("videos").upload(path, f, { contentType: f.type || "video/" + (ext === "mov" ? "quicktime" : ext), upsert: false }).then(function (u) {
          if (u.error) throw u.error;
          return sb.from("lesson_videos").upsert({ lesson_id: l.id, video_path: path, file_name: f.name.slice(0, 200), size_bytes: f.size });
        }).then(function (w) {
          if (w.error) { sb.storage.from("videos").remove([path]); throw w.error; }
          if (l.video && l.video.video_path && l.video.video_path !== path) sb.storage.from("videos").remove([l.video.video_path]);
          l.video = { lesson_id: l.id, video_path: path, file_name: f.name, size_bytes: f.size };
          setMsg("Video guardado en la lección.", "ok");
          renderMods();
        }).catch(function (e) { up.disabled = false; up.textContent = l.video ? "Reemplazar video" : "Subir video"; err(e); });
      });
      wrap.appendChild(status);
      var acts = el("div", { class: "vactions" }, [up, file]);
      if (l.video) {
        acts.appendChild(btn("Ver", "btn-ghost", function () { Z.signedVideo(l.video.video_path, 600).then(function (u) { window.open(u, "_blank", "noopener"); }).catch(err); }));
        acts.appendChild(btn("Quitar video", "btn-ghost danger", function () {
          if (!window.confirm("¿Quitar el video de esta lección? Los alumnos dejarán de verlo.")) return;
          sb.from("lesson_videos").delete().eq("lesson_id", l.id).then(function (d) {
            if (d.error) return err(d.error);
            sb.storage.from("videos").remove([l.video.video_path]);
            l.video = null; renderMods();
          });
        }));
      }
      wrap.appendChild(acts);
      return wrap;
    }
    renderMods();
    host.appendChild(el("section", { class: "panel" }, [
      el("h3", { text: "Módulos y lecciones" }),
      el("p", { class: "muted", text: "Cada lección puede tener un ejercicio y un video. Cambia el orden con las flechas." }),
      modsHost,
      btn("+ Módulo", "btn-ghost", function () { ed.modules.push({ id: "", title: "Módulo " + (ed.modules.length + 1), lessons: [{ id: "", title: "", exercise: "", video: null }] }); renderMods(); })
    ]));

    // --- guardar ---
    var statusSel = el("select", { class: "fin" }, [el("option", { value: "borrador", text: "Borrador (solo lo ves tú)" }), el("option", { value: "publicado", text: "Publicado (se ve y se vende)" })]);
    statusSel.value = ed.status;
    statusSel.addEventListener("change", function () { ed.status = statusSel.value; });
    var saveBtn = btn("Guardar curso", "", function () { save(saveBtn); });
    var actions = el("div", { class: "save-bar" }, [el("div", { class: "ffield" }, [el("label", { text: "Estado" }), statusSel]), saveBtn]);
    host.appendChild(el("section", { class: "panel" }, [actions]));
    if (!ed.isNew) {
      host.appendChild(el("p", { class: "muted" }, [btn("Borrar este curso", "btn-ghost danger", function () {
        if (!window.confirm("¿Borrar «" + ed.title + "»? Solo se puede si nadie lo ha comprado. No se puede deshacer.")) return;
        sb.rpc("delete_course", { p_slug: ed.slug }).then(function (r) {
          if (r.error) return err(r.error);
          sb.storage.from("guides").remove([ed.slug + ".pdf"]);
          var vp = ed.originalLessons.filter(function (x) { return x.video; }).map(function (x) { return x.video.video_path; });
          if (vp.length) sb.storage.from("videos").remove(vp);
          if (ed.coverPath) sb.storage.from("covers").remove([ed.coverPath]);
          dirty = true;
          setMsg("Curso borrado.", "ok");
          loadAll().then(renderList);
        });
      })]));
    }
  }

  function save(button) {
    var problems = [];
    if (!ed.title.trim()) problems.push("Escribe el título del curso.");
    if (!validSlug(ed.slug)) problems.push("La dirección web solo puede tener letras minúsculas sin tildes, números y guiones (por ejemplo: acuarela-principiantes).");
    if (ed.isNew && courses.some(function (c) { return c.slug === ed.slug; })) problems.push("Ya existe un curso con esa dirección web.");
    if (!(Number(ed.price_cop) >= 0) || ed.price_cop === "") problems.push("Escribe el precio en pesos.");
    if (!(Number(ed.price_usd) >= 0) || ed.price_usd === "") problems.push("Escribe el precio en dólares.");
    ed.modules.forEach(function (m, i) {
      if (!m.title.trim()) problems.push("El módulo " + (i + 1) + " necesita nombre.");
      m.lessons.forEach(function (l, j) { if (!l.title.trim()) problems.push("La lección " + (i + 1) + "." + (j + 1) + " necesita título."); });
    });
    if (ed.status === "publicado") {
      var n = ed.modules.reduce(function (t, m) { return t + m.lessons.length; }, 0);
      if (!n) problems.push("Para publicar, agrega al menos una lección.");
      if (!(Number(ed.price_cop) > 0)) problems.push("Para publicar, el precio en pesos debe ser mayor que cero.");
    }
    if (problems.length) return setMsg(problems[0], "err");
    var payload = {
      slug: ed.slug, title: ed.title.trim(), category: ed.category.trim(), short: ed.short.trim(), promise: ed.promise.trim(), who: ed.who.trim(),
      bullets: lines(ed.bullets), learn: lines(ed.learn), extras: lines(ed.extras), kit: lines(ed.kit), grad: ed.grad, cover_path: ed.coverPath || "",
      price_cop: Math.round(Number(ed.price_cop)), price_usd: Number(ed.price_usd), status: ed.status, sort_order: Math.round(Number(ed.sort_order) || 100),
      modules: ed.modules.map(function (m) { return { id: m.id || "", title: m.title.trim(), lessons: m.lessons.map(function (l) { return { id: l.id || "", title: l.title.trim(), exercise: l.exercise.trim() }; }) }; })
    };
    var keep = {};
    ed.modules.forEach(function (m) { m.lessons.forEach(function (l) { if (l.id) keep[l.id] = true; }); });
    var orphanVideos = ed.originalLessons.filter(function (x) { return !keep[x.id] && x.video; }).map(function (x) { return x.video.video_path; });
    button.disabled = true; button.textContent = "Guardando…";
    sb.rpc("save_course", { p: payload }).then(function (r) {
      button.disabled = false; button.textContent = "Guardar curso";
      if (r.error) return err(r.error);
      if (orphanVideos.length) sb.storage.from("videos").remove(orphanVideos);
      if (ed.oldCover && ed.oldCover !== ed.coverPath) sb.storage.from("covers").remove([ed.oldCover]);
      dirty = true;
      setMsg(ed.status === "publicado" ? "Curso guardado y publicado. Ya se ve en la página." : "Curso guardado como borrador.", "ok");
      var slug = ed.slug;
      loadAll().then(function () { openEditor(slug); });
    });
  }

  // =====================================================================
  //  PRECIOS Y PAQUETES
  // =====================================================================
  function renderPricing() {
    var host = $("tab-precios");
    host.textContent = "Cargando…";
    Promise.all([sb.from("pricing_tiers").select("*").order("min_qty"), sb.from("bundles").select("*").order("sort_order")]).then(function (res) {
      host.textContent = "";
      var tiers = (res[0].data || []).map(function (t) { return { min_qty: t.min_qty, percent_off: Number(t.percent_off) }; });
      var bundles = (res[1].data || []).map(function (b) { return Object.assign({}, b, { isNew: false }); });

      // descuentos por cantidad
      var tiersHost = el("div", {});
      function paintTiers() {
        tiersHost.textContent = "";
        tiers.forEach(function (t, i) {
          var q = input(t.min_qty, { type: "number", min: "2", step: "1" }); q.addEventListener("input", function () { t.min_qty = q.value; });
          var p = input(t.percent_off, { type: "number", min: "0", max: "90", step: "0.5" }); p.addEventListener("input", function () { t.percent_off = p.value; });
          tiersHost.appendChild(el("div", { class: "trow" }, [el("span", { text: "Desde" }), q, el("span", { text: "cursos en el carrito:" }), p, el("span", { text: "% de descuento" }),
            btn("✕", "btn-ghost danger", function () { tiers.splice(i, 1); paintTiers(); })]));
        });
      }
      paintTiers();
      var saveTiers = btn("Guardar descuentos", "", function () {
        var rows = tiers.map(function (t) { return { min_qty: Math.round(Number(t.min_qty)), percent_off: Number(t.percent_off) }; });
        if (rows.some(function (r) { return !(r.min_qty >= 2) || !(r.percent_off >= 0 && r.percent_off <= 90); })) return setMsg("Revisa los descuentos: desde 2 cursos y entre 0 y 90 %.", "err");
        var qs = rows.map(function (r) { return r.min_qty; });
        if (qs.some(function (x, i) { return qs.indexOf(x) !== i; })) return setMsg("Hay dos descuentos para la misma cantidad.", "err");
        var del = qs.length ? sb.from("pricing_tiers").delete().not("min_qty", "in", "(" + qs.join(",") + ")") : sb.from("pricing_tiers").delete().gte("min_qty", 0);
        del.then(function (d) {
          if (d.error) return err(d.error);
          return rows.length ? sb.from("pricing_tiers").upsert(rows) : { error: null };
        }).then(function (u) { if (u && u.error) return err(u.error); setMsg("Descuentos guardados.", "ok"); });
      });
      host.appendChild(el("section", { class: "panel" }, [
        el("h2", { text: "Descuentos por cantidad" }),
        el("p", { class: "muted", text: "Si alguien lleva varios cursos, el precio baja ese porcentaje sobre la suma. Se aplica el descuento de la mayor cantidad que se cumpla." }),
        tiersHost,
        el("div", { class: "vactions" }, [btn("+ Añadir descuento", "btn-ghost", function () { tiers.push({ min_qty: (tiers.length ? Number(tiers[tiers.length - 1].min_qty) + 1 : 2), percent_off: 10 }); paintTiers(); }), saveTiers])
      ]));

      // paquetes con precio fijo
      var bundlesHost = el("div", {});
      function paintBundles() {
        bundlesHost.textContent = "";
        bundles.forEach(function (b, bi) {
          var name = input(b.name, { maxlength: "120" }); name.addEventListener("input", function () { b.name = name.value; if (b.isNew && !b.codeTouched) { b.code = slugify(b.name); code.value = b.code; } });
          var code = input(b.code, { maxlength: "60" }); code.disabled = !b.isNew; code.addEventListener("input", function () { b.codeTouched = true; b.code = code.value.trim(); });
          var desc = input(b.description || "", { maxlength: "300" }); desc.addEventListener("input", function () { b.description = desc.value; });
          var pc = input(b.price_cop, { type: "number", min: "0", step: "100" }); pc.addEventListener("input", function () { b.price_cop = pc.value; });
          var pu = input(b.price_usd, { type: "number", min: "0", step: "0.5" }); pu.addEventListener("input", function () { b.price_usd = pu.value; });
          var checks = el("div", { class: "chks" }, courses.map(function (c) {
            var cb = el("input", { type: "checkbox" }); cb.checked = b.slugs.indexOf(c.slug) >= 0;
            cb.addEventListener("change", function () { b.slugs = b.slugs.filter(function (x) { return x !== c.slug; }); if (cb.checked) b.slugs.push(c.slug); });
            return el("label", { class: "chk" }, [cb, " " + c.title]);
          }));
          var feat = el("input", { type: "checkbox" }); feat.checked = !!b.featured; feat.addEventListener("change", function () { b.featured = feat.checked; });
          var act = el("input", { type: "checkbox" }); act.checked = b.active !== false; act.addEventListener("change", function () { b.active = act.checked; });
          var sum = b.slugs.reduce(function (t, s) { var c = courses.filter(function (x) { return x.slug === s; })[0]; return t + (c ? c.price_cop : 0); }, 0);
          var saveB = btn("Guardar paquete", "", function () {
            if (!b.name.trim()) return setMsg("El paquete necesita nombre.", "err");
            if (!validSlug(b.code)) return setMsg("El código del paquete solo puede tener minúsculas, números y guiones.", "err");
            if (b.slugs.length < 2) return setMsg("Elige al menos 2 cursos para el paquete.", "err");
            var row = { code: b.code, name: b.name.trim(), description: (b.description || "").trim() || null, slugs: b.slugs, price_cop: Math.round(Number(b.price_cop) || 0), price_usd: Number(b.price_usd) || 0, featured: !!b.featured, active: b.active !== false, sort_order: (bi + 1) * 10 };
            var req = b.isNew ? sb.from("bundles").insert(row) : sb.from("bundles").update(row).eq("id", b.id);
            req.then(function (r) { if (r.error) return err(r.error); setMsg("Paquete guardado.", "ok"); renderPricing(); });
          });
          var delB = btn("Borrar paquete", "btn-ghost danger", function () {
            if (b.isNew) { bundles.splice(bi, 1); return paintBundles(); }
            if (!window.confirm("¿Borrar el paquete «" + b.name + "»?")) return;
            sb.from("bundles").delete().eq("id", b.id).then(function (r) { if (r.error) return err(r.error); setMsg("Paquete borrado.", "ok"); renderPricing(); });
          });
          bundlesHost.appendChild(el("div", { class: "panel inner" }, [
            el("div", { class: "grid2" }, [field("Nombre", name), field("Código (para pagos)", code)]),
            field("Descripción", desc), field("Cursos que incluye", checks),
            el("div", { class: "grid3" }, [field("Precio del paquete (COP)", pc, "Suma de los cursos sueltos: " + money(sum)), field("Precio del paquete (US$)", pu), el("div", { class: "ffield" }, [
              el("label", { class: "chk" }, [feat, " Destacado (insignia «Mejor precio»)"]), el("label", { class: "chk" }, [act, " Activo (visible en la página)"])])]),
            el("div", { class: "vactions" }, [saveB, delB])
          ]));
        });
        if (!bundles.length) bundlesHost.appendChild(el("p", { class: "muted", text: "Todavía no hay paquetes." }));
      }
      paintBundles();
      host.appendChild(el("section", { class: "panel" }, [
        el("h2", { text: "Paquetes con precio fijo" }),
        el("p", { class: "muted", text: "Si el carrito tiene exactamente esos cursos, se cobra el precio del paquete (si es más barato que el descuento por cantidad). Aparecen en la sección «Paquetes» de la página." }),
        bundlesHost,
        btn("+ Nuevo paquete", "btn-ghost", function () { bundles.push({ isNew: true, name: "", code: "", description: "", slugs: [], price_cop: 0, price_usd: 0, featured: false, active: true }); paintBundles(); })
      ]));
    }).catch(err);
  }

  // =====================================================================
  //  ALUMNOS Y ACCESOS
  // =====================================================================
  function renderStudents() {
    var host = $("tab-alumnos");
    host.textContent = "";
    var emailI = input("", { type: "email", inputmode: "email", placeholder: "alumno@ejemplo.com" });
    var checks = el("div", { class: "chks" });
    courses.forEach(function (c) { checks.appendChild(el("label", { class: "chk" }, [el("input", { type: "checkbox", value: c.slug }), " " + c.title + (c.status === "publicado" ? "" : " (borrador)")])); });
    var all = btn("Marcar todas", "btn-ghost", function () { Array.prototype.forEach.call(checks.querySelectorAll("input"), function (i) { i.checked = true; }); });
    var source = el("select", { class: "fin" }, [el("option", { value: "whatsapp", text: "WhatsApp" }), el("option", { value: "manual", text: "Otro medio" })]);
    var note = input("", { maxlength: "300", placeholder: "Ej. Nequi, 24 nov" });
    var grantBtn = btn("Dar acceso", "", function () {
      var email = emailI.value.trim().toLowerCase();
      var slugs = Array.prototype.map.call(checks.querySelectorAll("input:checked"), function (i) { return i.value; });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg("Escribe un correo válido.", "err");
      if (!slugs.length) return setMsg("Elige al menos una guía.", "err");
      grantBtn.disabled = true;
      sb.rpc("grant_access", { p_email: email, p_slugs: slugs, p_source: source.value, p_note: note.value.trim() || null }).then(function (r) {
        grantBtn.disabled = false;
        if (r.error) return err(r.error);
        setMsg(r.data > 0 ? "Listo: " + r.data + " guía(s) nueva(s) para " + email + "." : email + " ya tenía esas guías.", "ok");
        emailI.value = ""; note.value = "";
        Array.prototype.forEach.call(checks.querySelectorAll("input"), function (i) { i.checked = false; });
        loadList();
      });
    });
    host.appendChild(el("section", { class: "panel" }, [
      el("h2", { text: "Dar acceso a una guía" }),
      el("p", { class: "muted", text: "Úsalo cuando alguien pague por WhatsApp u otro medio. Entra con ese correo y verá sus guías al instante." }),
      field("Correo del alumno", emailI), el("div", { class: "ffield" }, [el("label", { class: "flabel" }, ["Guías ", all]), checks]),
      el("div", { class: "grid2" }, [field("¿Cómo pagó?", source), field("Nota (opcional)", note)]), grantBtn
    ]));
    var filter = input("", { type: "search", placeholder: "Buscar por correo" });
    var count = el("span", { class: "muted" });
    var list = el("div", {});
    host.appendChild(el("section", { class: "panel" }, [el("div", { class: "panel-head" }, [el("h2", {}, ["Alumnos con acceso ", count]), filter]), list]));
    var rows = [];
    function paint() {
      var q = filter.value.trim().toLowerCase(), by = {};
      rows.forEach(function (e) { (by[e.email] = by[e.email] || []).push(e); });
      list.textContent = "";
      var emails = Object.keys(by).filter(function (m) { return !q || m.indexOf(q) !== -1; }).sort(function (a, b) { return by[b][0].created_at < by[a][0].created_at ? -1 : 1; });
      count.textContent = "· " + emails.length + " correo(s)";
      if (!emails.length) list.appendChild(el("p", { class: "muted", text: "Todavía no hay accesos." }));
      emails.forEach(function (m) {
        var chips = by[m].map(function (e) {
          var c = Z.courses()[e.course_slug];
          var x = el("button", { class: "chip-x", type: "button", title: "Quitar el acceso a esta guía", text: "×" });
          x.addEventListener("click", function () {
            if (!window.confirm("¿Quitar «" + (c ? c.title : e.course_slug) + "» a " + m + "?")) return;
            sb.rpc("revoke_access", { p_email: m, p_slug: e.course_slug }).then(function (r) { if (r.error) return err(r.error); loadList(); });
          });
          return el("span", { class: "chip" }, [c ? c.title : e.course_slug, " ", x]);
        });
        var when = new Date(by[m][0].created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
        list.appendChild(el("div", { class: "arow" }, [el("div", { class: "arow-top" }, [el("b", { text: m }), el("span", { class: "muted", text: when + " · " + by[m][0].source })]), el("div", { class: "chips" }, chips)]));
      });
    }
    function loadList() {
      sb.from("enrollments").select("email,course_slug,source,created_at").order("created_at", { ascending: false }).limit(1000).then(function (r) {
        if (r.error) return err(r.error);
        rows = r.data || [];
        paint();
      });
    }
    filter.addEventListener("input", paint);
    loadList();
  }

  // ---------- arranque ----------
  Z.requireSession().then(function () {
    Z.$("logout").addEventListener("click", Z.logout);
    sb.rpc("is_academy_admin").then(function (r) {
      show($("loading"), false);
      if (r.data !== true) return show($("denied"), true);
      show($("admin"), true);
      initTabs();
      loadAll().then(renderList).catch(err);
    });
  });
})();
