/* Academia Taller Creativo — /gracias: a donde Wompi devuelve al comprador.
   Le pide a la función `wompi-confirm` que revise el pago con Wompi y muestra el resultado. */
(function () {
  "use strict";
  if (document.body.getAttribute("data-page") !== "gracias" || !window.TC || !TC.fn) return;

  var qs = new URLSearchParams(location.search);
  var ref = (qs.get("ref") || "").trim();
  var $ = function (id) { return document.getElementById(id); };
  var title = $("g-title"), lead = $("g-lead"), items = $("g-items"), actions = $("g-actions"), help = $("g-help");
  var tries = 0, MAX_TRIES = 18;   // ~90 s revisando cada 5 s

  function link(href, text, ghost) {
    var a = document.createElement("a");
    a.className = "btn btn-block" + (ghost ? " btn-ghost" : ""); a.href = href; a.textContent = text;
    return a;
  }
  function waHref(text) { return "https://wa.me/573102454446?text=" + encodeURIComponent(text); }
  function setHelp() {
    help.innerHTML = "";
    var a = document.createElement("a");
    a.href = waHref("Hola, tengo una duda con mi pago en la Academia Taller Creativo. Mi referencia es " + ref);
    a.target = "_blank"; a.rel = "noopener"; a.textContent = "Escríbenos por WhatsApp";
    help.appendChild(document.createTextNode("¿Dudas con tu pago? ")); help.appendChild(a);
    help.appendChild(document.createTextNode(" y menciona tu referencia: " + ref + "."));
    help.hidden = false;
  }
  function list(titles) {
    items.innerHTML = "";
    (titles || []).forEach(function (t) { var li = document.createElement("li"); li.textContent = t; items.appendChild(li); });
    items.hidden = !(titles && titles.length);
  }

  function show(r) {
    var st = r && r.status;
    actions.innerHTML = "";
    if (st === "APPROVED") {
      document.title = "Pago aprobado · Academia Taller Creativo";
      title.textContent = "¡Pago aprobado! Gracias por tu compra";
      lead.textContent = "Tu acceso ya está activo para " + (r.email || "tu correo") + ". Entra con ese mismo correo: te enviamos un código de 6 dígitos y ves tus guías en «Mis cursos».";
      list(r.titles);
      try { localStorage.removeItem("tc_cart"); } catch (e) {}
      document.querySelectorAll("[data-cart-count]").forEach(function (el) { el.hidden = true; });
      var em = ""; try { em = localStorage.getItem("tc_email") || ""; } catch (e) {}
      actions.appendChild(link("/entrar?next=/mis-cursos" + (em ? "&email=" + encodeURIComponent(em) : ""), "Entrar y ver mis cursos"));
      setHelp();
      return true;
    }
    if (st === "NOT_FOUND" || !st) {
      title.textContent = "No encontramos ese pedido";
      lead.textContent = "Revisa que el enlace sea el que te llevó Wompi después de pagar. Si ya pagaste, escríbenos y lo resolvemos.";
      list([]); actions.appendChild(link("/#guias", "Ver las guías", true)); setHelp();
      return true;
    }
    if (st === "DECLINED" || st === "VOIDED" || st === "ERROR") {
      title.textContent = "El pago no se completó";
      lead.textContent = "Wompi no aprobó el pago, así que no se cobró nada. Puedes intentarlo de nuevo con otro medio de pago.";
      list(r.titles); actions.appendChild(link("/#guias", "Volver a las guías")); setHelp();
      return true;
    }
    // PENDING
    list(r.titles);
    return false;
  }

  function poll() {
    tries += 1;
    TC.fn("wompi-confirm", { reference: ref }).then(function (res) {
      if (!res.ok) throw new Error("fn");
      if (show(res.data)) return;
      if (tries >= MAX_TRIES) {
        title.textContent = "Seguimos esperando la confirmación";
        lead.textContent = "Todavía no vemos tu pago confirmado. Si ya pagaste, tu acceso se activará solo en unos minutos (el banco a veces demora). No tienes que volver a pagar.";
        actions.innerHTML = ""; actions.appendChild(link("/entrar", "Entrar a mi cuenta", true)); setHelp();
        return;
      }
      setTimeout(poll, 5000);
    }).catch(function () {
      if (tries >= MAX_TRIES) {
        title.textContent = "No pudimos confirmar tu pago ahora";
        lead.textContent = "Si ya pagaste, no te preocupes: tu acceso se activará solo en unos minutos. Si pasa mucho tiempo, escríbenos.";
        setHelp();
        return;
      }
      setTimeout(poll, 5000);
    });
  }

  if (!/^TC-[A-Z0-9]{8,24}$/.test(ref)) { show({ status: "NOT_FOUND" }); return; }
  setHelp();
  poll();
})();
