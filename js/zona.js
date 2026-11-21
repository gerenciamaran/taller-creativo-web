/* Academia Taller Creativo — zona de alumnos.
   Páginas: /entrar (código al correo), /mis-cursos, /curso?g=<guía> (lector y progreso) y /admin (dar acceso).
   Todo se protege en la base de datos (Supabase): aquí solo se muestra lo que la base deja leer.
   La URL y la clave «anon» son públicas por diseño; lo que protege los datos son las reglas de la base. */
(function () {
  "use strict";

  var SUPABASE_URL = "https://kpseadjekdezqwjjflfg.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtwc2VhZGpla2RlenF3ampmbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyMjAyNjYsImV4cCI6MjExMDc5NjI2Nn0.TG164PGiIUeUWEtUT6wLJbpDPwWI1yeqB9toYwmAayc";
  var COURSES = {};
  var SLUGS = [];

  if (!window.supabase || !window.supabase.createClient) return;
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  var page = document.body.getAttribute("data-page");
  var $ = function (id) { return document.getElementById(id); };

  // ---------- utilidades ----------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function show(node, on) { if (node) node.hidden = !on; }
  function setMsg(text, kind) {
    var m = $("msg");
    if (!m) return;
    m.textContent = text || "";
    m.className = "msg" + (kind ? " " + kind : "");
    m.hidden = !text;
  }
  function friendly(err) {
    var t = ((err && (err.message || err.error_description)) || "").toLowerCase();
    var status = err && err.status;
    if (status === 429 || t.indexOf("rate limit") !== -1 || t.indexOf("security purposes") !== -1)
      return "Pediste muchos códigos seguidos. Espera unos minutos e inténtalo de nuevo, o escríbenos por WhatsApp.";
    if (t.indexOf("not authorized") !== -1 || t.indexOf("not allowed") !== -1)
      return "Por ahora no podemos enviar el código a ese correo. Escríbenos por WhatsApp y te ayudamos a entrar.";
    if (t.indexOf("expired") !== -1 || t.indexOf("invalid") !== -1) return "El código no es correcto o ya venció. Revisa el correo o pide uno nuevo.";
    if (t.indexOf("network") !== -1 || t.indexOf("fetch") !== -1) return "No hay conexión. Revisa tu internet e inténtalo de nuevo.";
    return (err && err.message) || "Algo salió mal. Inténtalo de nuevo.";
  }
  function safeNext(v) {
    return v && v.charAt(0) === "/" && v.charAt(1) !== "/" && v.indexOf("\\") === -1 ? v : "/mis-cursos";
  }
  function getSession() { return sb.auth.getSession().then(function (r) { return r.data.session; }); }
  function requireSession() {
    return getSession().then(function (s) {
      if (!s) {
        location.replace("/entrar?next=" + encodeURIComponent(location.pathname + location.search));
        return new Promise(function () {});
      }
      return s;
    });
  }
  function myEmail(session) { return String(session.user.email || "").toLowerCase(); }
  function logout() { return sb.auth.signOut({ scope: "local" }).then(function () { location.replace("/entrar"); }); }
  function courseTitle(slug) { return COURSES[slug] ? COURSES[slug].title : slug; }
  function totalLessons(slug) {
    var c = COURSES[slug];
    return c ? c.modules.reduce(function (t, m) { return t + m.lessons.length; }, 0) : 0;
  }
  function fileName(slug) { return courseTitle(slug).replace(/[^\w]+/g, "-") + ".pdf"; }
  function openPdf(slug, download) {
    return sb.storage.from("guides").createSignedUrl(slug + ".pdf", 300, download ? { download: fileName(slug) } : undefined).then(function (r) {
      if (r.error || !r.data) throw new Error("No se pudo abrir el PDF. Inténtalo de nuevo.");
      if (download) location.href = r.data.signedUrl;
      else window.open(r.data.signedUrl, "_blank", "noopener");
    });
  }
  function bar(done, total) {
    var pct = total ? Math.round((done * 100) / total) : 0;
    var fill = el("span", { class: "bar-fill" });
    fill.style.width = pct + "%";
    return el("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) }, [fill]);
  }
  function human(bytes) {
    if (!bytes) return "";
    return bytes >= 1048576 ? (bytes / 1048576).toFixed(bytes >= 1073741824 ? 0 : 1) + " MB" : Math.round(bytes / 1024) + " KB";
  }
  function signedVideo(path, seconds) {
    return sb.storage.from("videos").createSignedUrl(path, seconds || 7200).then(function (r) {
      if (r.error || !r.data) throw new Error("No se pudo abrir el video. Inténtalo de nuevo.");
      return r.data.signedUrl;
    });
  }
  function waLink(text) { return "https://wa.me/573102454446?text=" + encodeURIComponent(text); }
  function coverUrl(path) { return path ? SUPABASE_URL + "/storage/v1/object/public/covers/" + encodeURI(path) : ""; }
  function byPos(a, b) { return a.position - b.position; }
  // Cursos que el usuario puede ver: los suyos y, si es administrador, todos (también los borradores).
  function loadCourses() {
    return sb.from("courses")
      .select("slug,title,category,grad,cover_path,status,sort_order,price_cop,price_usd,short,promise,who,bullets,learn,extras,kit,course_modules(id,position,title,course_lessons(id,position,title,exercise))")
      .order("sort_order").then(function (r) {
        if (r.error) throw r.error;
        COURSES = {};
        (r.data || []).forEach(function (c) {
          c.modules = (c.course_modules || []).slice().sort(byPos).map(function (m) {
            return { id: m.id, title: m.title, lessons: (m.course_lessons || []).slice().sort(byPos) };
          });
          c.cat = c.category || "Guía";
          c.cover = coverUrl(c.cover_path);
          c.icon = window.TC_ICON ? window.TC_ICON(c.slug) : "";
          COURSES[c.slug] = c;
        });
        SLUGS = Object.keys(COURSES);
        return COURSES;
      });
  }
  function lessonIds(slug) {
    var c = COURSES[slug], ids = [];
    if (c) c.modules.forEach(function (m) { m.lessons.forEach(function (l) { ids.push(l.id); }); });
    return ids;
  }

  // ---------- /entrar ----------
  function initLogin() {
    var qs = new URLSearchParams(location.search);
    var next = safeNext(qs.get("next"));
    var emailForm = $("form-email"), codeForm = $("form-code");
    if (qs.get("registro")) {
      $("auth-title").textContent = "Únete gratis";
      $("auth-lead").textContent = "Crea tu cuenta con tu correo: te enviamos un código de 6 dígitos y entras sin contraseña. Después ves tus cursos en «Mis cursos».";
      emailForm.querySelector("button[type=submit]").textContent = "Crear mi cuenta gratis";
      $("auth-switch").innerHTML = '¿Ya tienes cuenta? <a href="/entrar">Entra aquí</a>.';
      document.title = "Únete gratis · Academia Taller Creativo";
    } else {
      $("auth-switch").innerHTML = '¿Primera vez? <a href="/entrar?registro=1">Únete gratis</a>.';
    }
    var email = "", cooldown = 0, timer = null;
    getSession().then(function (s) { if (s) location.replace(next); });

    function startCooldown() {
      cooldown = 60;
      var b = $("resend");
      clearInterval(timer);
      timer = setInterval(function () {
        cooldown -= 1;
        b.disabled = cooldown > 0;
        b.textContent = cooldown > 0 ? "Reenviar código (" + cooldown + " s)" : "Reenviar código";
        if (cooldown <= 0) clearInterval(timer);
      }, 1000);
      b.disabled = true;
    }
    function sendCode() {
      setMsg("");
      return sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } }).then(function (r) {
        if (r.error) { setMsg(friendly(r.error), "err"); return false; }
        return true;
      });
    }
    emailForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      email = $("email").value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg("Escribe un correo válido.", "err");
      var btn = emailForm.querySelector("button[type=submit]");
      btn.disabled = true;
      sendCode().then(function (ok) {
        btn.disabled = false;
        if (!ok) return;
        $("sent-to").textContent = email;
        show(emailForm, false);
        show(codeForm, true);
        $("code").focus();
        startCooldown();
      });
    });
    codeForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var token = $("code").value.replace(/\D/g, "");
      if (token.length < 6) return setMsg("Escribe el código de 6 dígitos que te llegó al correo.", "err");
      var btn = codeForm.querySelector("button[type=submit]");
      btn.disabled = true;
      setMsg("");
      sb.auth.verifyOtp({ email: email, token: token, type: "email" }).then(function (r) {
        if (r.error) { btn.disabled = false; return setMsg(friendly(r.error), "err"); }
        location.replace(next);
      });
    });
    $("resend").addEventListener("click", function () {
      if (cooldown > 0) return;
      sendCode().then(function (ok) { if (ok) { setMsg("Te enviamos un código nuevo.", "ok"); startCooldown(); } });
    });
    $("change-email").addEventListener("click", function () {
      show(codeForm, false);
      show(emailForm, true);
      setMsg("");
      $("code").value = "";
    });
  }

  // ---------- /mis-cursos ----------
  function initMyCourses() {
    requireSession().then(function (session) {
      var email = myEmail(session);
      $("who").textContent = email;
      $("logout").addEventListener("click", logout);
      sb.rpc("is_academy_admin").then(function (r) { if (r.data === true) show($("admin-link"), true); });

      Promise.all([
        loadCourses(),
        sb.from("enrollments").select("course_slug,created_at").eq("email", email).order("created_at"),
        sb.from("lesson_progress").select("lesson_id")
      ]).then(function (res) {
        show($("loading"), false);
        if (res[1].error) return setMsg("No se pudieron cargar tus guías. Recarga la página.", "err");
        var mine = (res[1].data || []).filter(function (e) { return COURSES[e.course_slug]; });
        var doneIds = {};
        (res[2].data || []).forEach(function (p) { doneIds[p.lesson_id] = true; });
        if (mine.length === 0) return show($("empty"), true);
        var list = $("courses");
        var cards = [];
        function status(d, total) { return d === 0 ? "sin-empezar" : (d >= total && total ? "completados" : "en-curso"); }
        function progressText(d, total) {
          if (d === 0) return "No has completado ninguna lección de la guía";
          if (d >= total && total) return "¡Has completado la guía! Felicitaciones";
          if (d === 1) return "¡Has completado tu primera lección! Continúa tu aprendizaje";
          return "Llevas " + d + " de " + total + " lecciones. ¡Sigue así!";
        }
        mine.forEach(function (e) {
          var slug = e.course_slug, c = COURSES[slug], total = totalLessons(slug);
          var d = lessonIds(slug).filter(function (id) { return doneIds[id]; }).length;
          var href = "/curso?g=" + encodeURIComponent(slug);
          var cover = el("a", { class: "dm-cover " + (c.cover ? "" : c.grad), href: href, "aria-label": "Abrir " + c.title });
          if (c.cover) cover.appendChild(el("img", { src: c.cover, alt: "", loading: "lazy", width: "960", height: "504" }));
          else cover.innerHTML = c.icon;
          var line = el("span", {});
          line.style.width = (total ? Math.round((d * 100) / total) : 0) + "%";
          var pdfBtn = el("button", { class: "dm-link", type: "button", text: "Descargar PDF" });
          pdfBtn.addEventListener("click", function () {
            pdfBtn.disabled = true;
            openPdf(slug, true).catch(function (err) { setMsg(err.message, "err"); }).then(function () { pdfBtn.disabled = false; });
          });
          var card = el("article", { class: "dm-card" }, [
            cover,
            el("div", { class: "dm-body" }, [
              el("span", { class: "dm-tag", text: c.cat }),
              el("h2", {}, [el("a", { href: href, text: c.title })]),
              el("p", { class: "dm-by", text: "Una guía de Academia Taller Creativo" }),
              el("div", { class: "dm-progress" }, [
                el("div", { class: "dm-line", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(total ? Math.round((d * 100) / total) : 0) }, [line]),
                el("p", { class: "dm-ptext", text: progressText(d, total) })
              ]),
              el("div", { class: "dm-actions" }, [
                el("a", { class: "btn dm-start", href: href, text: d >= total && total ? "Repasar →" : d ? "Continuar →" : "Empezar →" }),
                pdfBtn,
                el("span", { class: "dm-link soon", title: "Muy pronto", text: "Certificado · pronto" })
              ])
            ])
          ]);
          card.setAttribute("data-status", status(d, total));
          cards.push(card);
          list.appendChild(card);
        });
        var empty = el("p", { class: "muted", hidden: "", text: "No tienes guías en esta categoría." });
        list.appendChild(empty);
        $("course-filter").addEventListener("change", function () {
          var f = $("course-filter").value, n = 0;
          cards.forEach(function (card) {
            var on = f === "todos" || card.getAttribute("data-status") === f;
            card.hidden = !on;
            if (on) n += 1;
          });
          empty.hidden = n > 0;
        });
      }).catch(function () { show($("loading"), false); setMsg("No se pudieron cargar tus guías. Recarga la página.", "err"); });
    });
  }

  // ---------- /curso?g=<guía> ----------
  function initCourse() {
    var slug = new URLSearchParams(location.search).get("g");
    requireSession().then(function (session) {
      var email = myEmail(session);
      $("logout").addEventListener("click", logout);
      loadCourses().then(function () {
        var c = COURSES[slug];
        if (!c) { show($("loading"), false); return show($("denied"), true); }
        $("crumb").textContent = c.title;
        document.title = c.title + " · Mi curso · Academia Taller Creativo";
        var ids = lessonIds(slug);

        Promise.all([
          sb.from("enrollments").select("course_slug").eq("email", email).eq("course_slug", slug).maybeSingle(),
          ids.length ? sb.from("lesson_progress").select("lesson_id").in("lesson_id", ids) : Promise.resolve({ data: [] }),
          ids.length ? sb.from("lesson_videos").select("lesson_id,video_path").in("lesson_id", ids) : Promise.resolve({ data: [] })
        ]).then(function (res) {
          show($("loading"), false);
          if (res[0].error || !res[0].data) return show($("denied"), true);
          var done = {};
          (res[1].data || []).forEach(function (p) { done[p.lesson_id] = true; });
          var videos = {};
          (res[2].data || []).forEach(function (v) { videos[v.lesson_id] = v.video_path; });
          var total = totalLessons(slug);
          $("c-title").textContent = c.title;
          $("c-cover").className = "mc-cover " + (c.cover ? "" : c.grad);
          if (c.cover) { $("c-cover").textContent = ""; $("c-cover").appendChild(el("img", { src: c.cover, alt: "" })); $("c-cover").classList.add("has-cover"); }
          else $("c-cover").innerHTML = c.icon;
          show($("reader"), true);

          function count() { return Object.keys(done).length; }
          function paint() {
            var n = Math.min(count(), total);
            $("c-count").textContent = n + " de " + total + " lecciones hechas";
            var pb = $("c-bar");
            pb.firstChild.style.width = (total ? Math.round((n * 100) / total) : 0) + "%";
            pb.setAttribute("aria-valuenow", String(total ? Math.round((n * 100) / total) : 0));
            show($("c-done"), n >= total && total > 0);
            Array.prototype.forEach.call(document.querySelectorAll(".mod"), function (d) {
              var cnt = d.querySelectorAll("input:checked").length, all = d.querySelectorAll("input").length;
              d.querySelector(".mod-count").textContent = cnt + "/" + all;
            });
          }

          var firstPending = null;
          var host = $("modules");
          c.modules.forEach(function (m, mi) {
            var det = el("details", { class: "mod" });
            det.appendChild(el("summary", {}, [
              el("span", { class: "mod-num", text: String(mi + 1) }),
              el("span", { class: "mod-title", text: m.title }),
              el("span", { class: "mod-count", text: "" })
            ]));
            var ul = el("ul", { class: "lessons lessons-check" });
            m.lessons.forEach(function (l, li) {
              var lid = l.id;
              var input = el("input", { type: "checkbox", id: "l-" + lid });
              input.checked = !!done[lid];
              if (!input.checked && !firstPending) firstPending = det;
              input.addEventListener("change", function () {
                var wantDone = input.checked;
                input.disabled = true;
                var req = wantDone
                  ? sb.from("lesson_progress").insert({ lesson_id: lid })
                  : sb.from("lesson_progress").delete().eq("lesson_id", lid);
                req.then(function (r) {
                  input.disabled = false;
                  if (r.error && !(wantDone && r.error.code === "23505")) {
                    input.checked = !wantDone;
                    return setMsg("No se pudo guardar tu avance. Revisa tu conexión.", "err");
                  }
                  setMsg("");
                  if (wantDone) done[lid] = true; else delete done[lid];
                  paint();
                });
              });
              var slot = el("div", { class: "video-slot" });
              if (videos[lid]) {
                var play = el("button", { class: "btn btn-sm btn-ghost", type: "button", text: "▶ Ver el video de esta lección" });
                play.addEventListener("click", function () {
                  play.disabled = true;
                  play.textContent = "Cargando video…";
                  signedVideo(videos[lid]).then(function (url) {
                    var v = el("video", { controls: "", playsinline: "", preload: "metadata", controlsList: "nodownload", disablepictureinpicture: "", src: url });
                    v.addEventListener("contextmenu", function (e) { e.preventDefault(); });
                    v.addEventListener("ended", function () { if (!input.checked) input.click(); });
                    slot.textContent = "";
                    slot.appendChild(v);
                    v.play().catch(function () {});
                  }).catch(function (e) { play.disabled = false; play.textContent = "▶ Ver el video de esta lección"; setMsg(e.message, "err"); });
                });
                slot.appendChild(play);
              }
              ul.appendChild(el("li", {}, [
                el("label", { for: input.id }, [
                  input,
                  el("span", { class: "les-main" }, [
                    el("span", { class: "les-name", text: l.title + (videos[lid] ? "  🎬" : "") }),
                    l.exercise ? el("span", { class: "les-do" }, [el("b", { text: "Ejercicio: " }), l.exercise]) : null
                  ])
                ]),
                slot
              ]));
            });
            det.appendChild(ul);
            host.appendChild(det);
          });
          if (firstPending) firstPending.open = true; else if (host.firstChild) host.firstChild.open = true;
          $("c-resume").addEventListener("click", function () {
            var pending = Array.prototype.filter.call(document.querySelectorAll(".mod input"), function (i) { return !i.checked; });
            var target = pending[0];
            if (!target) return;
            var d = target.closest("details");
            d.open = true;
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          });
          $("c-pdf-dl").addEventListener("click", function () { openPdf(slug, true).catch(function (e) { setMsg(e.message, "err"); }); });
          $("c-pdf-open").addEventListener("click", function () { openPdf(slug, false).catch(function (e) { setMsg(e.message, "err"); }); });
          paint();
        });
      }).catch(function () { show($("loading"), false); show($("denied"), true); });
    });
  }

  // Lo que comparte el panel de administración (js/admin.js).
  window.TC_ZONA = {
    sb: sb, el: el, $: $, show: show, setMsg: setMsg, requireSession: requireSession, logout: logout, human: human, signedVideo: signedVideo,
    loadCourses: loadCourses, courses: function () { return COURSES; }, coverUrl: coverUrl, url: SUPABASE_URL
  };

  if (page === "entrar") initLogin();
  else if (page === "mis-cursos") initMyCourses();
  else if (page === "curso") initCourse();
  // /admin lo maneja js/admin.js
})();
