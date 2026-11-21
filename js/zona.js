/* Academia Taller Creativo — zona de alumnos.
   Páginas: /entrar (código al correo), /mis-cursos, /curso?g=<guía> (lector y progreso) y /admin (dar acceso).
   Todo se protege en la base de datos (Supabase): aquí solo se muestra lo que la base deja leer.
   La URL y la clave «anon» son públicas por diseño; lo que protege los datos son las reglas de la base. */
(function () {
  "use strict";

  var SUPABASE_URL = "https://kpseadjekdezqwjjflfg.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtwc2VhZGpla2RlenF3ampmbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyMjAyNjYsImV4cCI6MjExMDc5NjI2Nn0.TG164PGiIUeUWEtUT6wLJbpDPwWI1yeqB9toYwmAayc";
  var COURSES = window.TC_COURSES || {};
  var SLUGS = Object.keys(COURSES);

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
  function waLink(text) { return "https://wa.me/573102454446?text=" + encodeURIComponent(text); }

  // ---------- /entrar ----------
  function initLogin() {
    var next = safeNext(new URLSearchParams(location.search).get("next"));
    var emailForm = $("form-email"), codeForm = $("form-code");
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
        sb.from("enrollments").select("course_slug,created_at").eq("email", email).order("created_at"),
        sb.from("lesson_progress").select("course_slug,lesson_key")
      ]).then(function (res) {
        show($("loading"), false);
        if (res[0].error) return setMsg("No se pudieron cargar tus guías. Recarga la página.", "err");
        var mine = (res[0].data || []).filter(function (e) { return COURSES[e.course_slug]; });
        var done = {};
        (res[1].data || []).forEach(function (p) { done[p.course_slug] = (done[p.course_slug] || 0) + 1; });
        if (mine.length === 0) return show($("empty"), true);
        var list = $("courses");
        mine.forEach(function (e) {
          var slug = e.course_slug, c = COURSES[slug], total = totalLessons(slug), d = Math.min(done[slug] || 0, total);
          var cover = el("div", { class: "mc-cover " + c.grad });
          cover.innerHTML = c.icon;
          var pdfBtn = el("button", { class: "btn btn-sm btn-ghost", type: "button", text: "Descargar PDF" });
          pdfBtn.addEventListener("click", function () {
            pdfBtn.disabled = true;
            openPdf(slug, true).catch(function (err) { setMsg(err.message, "err"); }).then(function () { pdfBtn.disabled = false; });
          });
          list.appendChild(el("article", { class: "mc" }, [
            cover,
            el("div", { class: "mc-body" }, [
              el("h2", { text: c.title }),
              el("p", { class: "muted", text: d + " de " + total + " lecciones" + (d === total && total ? " · ¡completada!" : "") }),
              bar(d, total),
              el("div", { class: "mc-actions" }, [
                el("a", { class: "btn btn-sm", href: "/curso?g=" + slug, text: d ? "Continuar" : "Empezar" }),
                pdfBtn
              ])
            ])
          ]));
        });
      });
    });
  }

  // ---------- /curso?g=<guía> ----------
  function initCourse() {
    var slug = new URLSearchParams(location.search).get("g");
    requireSession().then(function (session) {
      var email = myEmail(session);
      $("logout").addEventListener("click", logout);
      if (!COURSES[slug]) { show($("loading"), false); return show($("denied"), true); }
      var c = COURSES[slug];
      $("crumb").textContent = c.title;
      document.title = c.title + " · Mi curso · Academia Taller Creativo";

      Promise.all([
        sb.from("enrollments").select("course_slug").eq("email", email).eq("course_slug", slug).maybeSingle(),
        sb.from("lesson_progress").select("lesson_key").eq("course_slug", slug)
      ]).then(function (res) {
        show($("loading"), false);
        if (res[0].error || !res[0].data) return show($("denied"), true);
        var done = {};
        (res[1].data || []).forEach(function (p) { done[p.lesson_key] = true; });
        var total = totalLessons(slug);
        $("c-title").textContent = c.title;
        $("c-cover").className = "mc-cover " + c.grad;
        $("c-cover").innerHTML = c.icon;
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
            var key = (mi + 1) + "." + (li + 1);
            var input = el("input", { type: "checkbox", id: "l-" + key.replace(".", "-") });
            input.checked = !!done[key];
            if (!input.checked && !firstPending) firstPending = det;
            input.addEventListener("change", function () {
              var wantDone = input.checked;
              input.disabled = true;
              var req = wantDone
                ? sb.from("lesson_progress").insert({ course_slug: slug, lesson_key: key })
                : sb.from("lesson_progress").delete().eq("course_slug", slug).eq("lesson_key", key);
              req.then(function (r) {
                input.disabled = false;
                if (r.error && !(wantDone && r.error.code === "23505")) {
                  input.checked = !wantDone;
                  return setMsg("No se pudo guardar tu avance. Revisa tu conexión.", "err");
                }
                setMsg("");
                if (wantDone) done[key] = true; else delete done[key];
                paint();
              });
            });
            ul.appendChild(el("li", {}, [
              el("label", { for: input.id }, [
                input,
                el("span", { class: "les-main" }, [
                  el("span", { class: "les-name", text: l.t }),
                  el("span", { class: "les-do" }, [el("b", { text: "Ejercicio: " }), l.e])
                ])
              ])
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
    });
  }

  // ---------- /admin ----------
  function initAdmin() {
    requireSession().then(function (session) {
      $("logout").addEventListener("click", logout);
      sb.rpc("is_academy_admin").then(function (r) {
        show($("loading"), false);
        if (r.data !== true) return show($("denied"), true);
        show($("admin"), true);

        var checks = $("slugs");
        SLUGS.forEach(function (s) {
          checks.appendChild(el("label", { class: "chk" }, [el("input", { type: "checkbox", value: s, name: "slug" }), " " + courseTitle(s)]));
        });
        $("all4").addEventListener("click", function () {
          Array.prototype.forEach.call(checks.querySelectorAll("input"), function (i) { i.checked = true; });
        });

        var rows = [];
        function render() {
          var q = $("filter").value.trim().toLowerCase();
          var by = {};
          rows.forEach(function (e) { (by[e.email] = by[e.email] || []).push(e); });
          var host = $("list");
          host.textContent = "";
          var emails = Object.keys(by).filter(function (m) { return !q || m.indexOf(q) !== -1; }).sort(function (a, b) {
            return by[b][0].created_at < by[a][0].created_at ? -1 : 1;
          });
          $("count").textContent = emails.length + " correo(s)";
          if (!emails.length) host.appendChild(el("p", { class: "muted", text: "Todavía no hay accesos." }));
          emails.forEach(function (m) {
            var chips = by[m].map(function (e) {
              var x = el("button", { class: "chip-x", type: "button", title: "Quitar el acceso a esta guía", "aria-label": "Quitar " + courseTitle(e.course_slug), text: "×" });
              x.addEventListener("click", function () {
                if (!window.confirm("¿Quitar «" + courseTitle(e.course_slug) + "» a " + m + "?")) return;
                sb.rpc("revoke_access", { p_email: m, p_slug: e.course_slug }).then(function (r) {
                  if (r.error) return setMsg(r.error.message, "err");
                  load();
                });
              });
              return el("span", { class: "chip" }, [courseTitle(e.course_slug), " ", x]);
            });
            var when = new Date(by[m][0].created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
            host.appendChild(el("div", { class: "arow" }, [
              el("div", { class: "arow-top" }, [el("b", { text: m }), el("span", { class: "muted", text: when + " · " + by[m][0].source })]),
              el("div", { class: "chips" }, chips)
            ]));
          });
        }
        function load() {
          sb.from("enrollments").select("email,course_slug,source,created_at").order("created_at", { ascending: false }).limit(1000).then(function (r) {
            if (r.error) return setMsg(r.error.message, "err");
            rows = r.data || [];
            render();
          });
        }
        $("filter").addEventListener("input", render);
        $("form-grant").addEventListener("submit", function (ev) {
          ev.preventDefault();
          var email = $("g-email").value.trim().toLowerCase();
          var slugs = Array.prototype.map.call(checks.querySelectorAll("input:checked"), function (i) { return i.value; });
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg("Escribe un correo válido.", "err");
          if (!slugs.length) return setMsg("Elige al menos una guía.", "err");
          var btn = $("form-grant").querySelector("button[type=submit]");
          btn.disabled = true;
          sb.rpc("grant_access", { p_email: email, p_slugs: slugs, p_source: $("g-source").value, p_note: $("g-note").value.trim() || null }).then(function (r) {
            btn.disabled = false;
            if (r.error) return setMsg(r.error.message, "err");
            setMsg(r.data > 0 ? "Listo: " + r.data + " guía(s) nueva(s) para " + email + "." : email + " ya tenía esas guías.", "ok");
            $("g-email").value = "";
            $("g-note").value = "";
            Array.prototype.forEach.call(checks.querySelectorAll("input"), function (i) { i.checked = false; });
            load();
          });
        });
        load();
      });
    });
  }

  if (page === "entrar") initLogin();
  else if (page === "mis-cursos") initMyCourses();
  else if (page === "curso") initCourse();
  else if (page === "admin") initAdmin();
})();
