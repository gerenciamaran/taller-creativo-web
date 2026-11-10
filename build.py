#!/usr/bin/env python3
"""Genera el sitio estático: index.html, guias/<guia>.html, sitemap.xml y robots.txt.

Uso:  python build.py
Los textos de cada guía viven en COURSES; los bloques de la portada, en src/.
"""
import html
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = "https://tallercreativo.com.co"
WA = "573102454446"

# ---------------------------------------------------------------- iconos ----
ICON = {
    "dibujo": '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 26l2-7L22 5l5 5L13 24z" fill="#FFC93C"/><path d="M6 26l2-7 5 5z" fill="#fff"/><path d="M22 5l5 5" stroke="#F25C9A" stroke-width="3"/></svg>',
    "pintura": '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4C8 4 3 10 3 16c0 6 5 11 11 11 3 0 3-2 3-3 0-2 1-3 3-3h4c4 0 6-3 6-6C30 9 24 4 16 4z" fill="#FFC93C"/><circle cx="10" cy="14" r="2.2" fill="#F25C9A"/><circle cx="16" cy="9" r="2.2" fill="#2F6BE0"/><circle cx="22" cy="12" r="2.2" fill="#2FA796"/></svg>',
    "jabones": '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="13" width="22" height="13" rx="5" fill="#fff" opacity=".92"/><circle cx="12" cy="9" r="3" fill="#fff" opacity=".85"/><circle cx="20" cy="7" r="2" fill="#fff" opacity=".7"/></svg>',
    "velas": '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3c3 4 3 6 0 8-3-2-3-4 0-8z" fill="#FFE27A"/><rect x="9" y="13" width="14" height="14" rx="3" fill="#fff" opacity=".92"/><path d="M16 11v3" stroke="#14285A" stroke-width="1.5" stroke-linecap="round"/></svg>',
}
CART_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 4h2.5l2.2 11h10.6l2-8H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="19.5" r="1.5" fill="currentColor"/><circle cx="17" cy="19.5" r="1.5" fill="currentColor"/></svg>'
WA_SVG = '<svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true"><path fill="#fff" d="M16 3a13 13 0 0 0-11 19.8L3 29l6.4-2A13 13 0 1 0 16 3zm0 2.4a10.6 10.6 0 1 1-5.5 19.7l-.4-.2-3.8 1.2 1.2-3.7-.3-.4A10.6 10.6 0 0 1 16 5.4zm-4 5.3c-.3 0-.7.1-1 .5-.4.4-1.3 1.3-1.3 3.1s1.3 3.6 1.5 3.8c.2.3 2.6 4.1 6.4 5.6 3.2 1.2 3.8 1 4.5.9.7-.1 2.2-.9 2.5-1.8.3-.9.3-1.6.2-1.8-.1-.2-.4-.3-.8-.5s-2.2-1.1-2.5-1.2c-.3-.1-.6-.2-.8.2-.2.4-.9 1.2-1.1 1.4-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.3-2.1-2.7-.2-.4 0-.6.2-.8l.6-.7c.2-.2.2-.4.4-.6.1-.3.1-.5 0-.7l-1.1-2.7c-.3-.7-.6-.6-.8-.6z"/></svg>'
LOGO = '<img src="/img/logo-marca.png" alt="" width="46" height="46" style="display:block">'

# ---------------------------------------------------------------- guías -----
COURSES = [
    dict(
        slug="dibujo", title="Dibujo Desde Cero", grad="g-draw", cat="Dibujo",
        short="De las formas básicas y la proporción a tu primer dibujo terminado, con rostro incluido.",
        promise="Aprende a dibujar desde cero, incluso si nunca has tomado una clase de arte, con ejercicios cortos que puedes practicar hoy mismo.",
        who="Para quien piensa «no sé dibujar» y quiere un camino claro, paso a paso, sin necesitar talento previo.",
        bullets=["Formas, proporción, luz y sombra", "Texturas, rostros y composición", "30 ejercicios y plantillas para calcar"],
        learn=["Controlar la presión y la línea del lápiz", "Reducir cualquier objeto a formas básicas", "Medir proporciones a ojo y usar ejes de simetría",
               "Dar volumen con luz, sombra y degradados", "Dibujar texturas: madera, metal, vidrio, tela, piel y cabello",
               "Construir un rostro con ojos, nariz, boca y cabello", "Planear un boceto y terminar tu primer dibujo"],
        extras=["30 ejercicios de dibujo adicionales, organizados por módulo", "Plantillas de práctica para calcar: formas básicas, proporción de rostro y escala de tonos",
                "Guía de materiales según tu presupuesto", "Banco de referencias para practicar", "Certificado digital de finalización"],
        kit=["Lápices HB, 2B y 6B", "Un borrador", "Un cuaderno o block de dibujo"],
        modules=[
            ("Bienvenida y materiales", [
                ("1.1 Bienvenida a Dibujo Desde Cero", "Escribe qué te gustaría poder dibujar en 8 semanas."),
                ("1.2 Materiales: qué comprar y qué no necesitas todavía", "Arma tu kit básico y tómale una foto."),
                ("1.3 Presión y control de línea", "Llena una hoja con 5 tipos de línea distintos.")]),
            ("Formas básicas", [
                ("2.1 El círculo y la elipse", "Dibuja 10 círculos a mano alzada, sin plantilla."),
                ("2.2 Cuadrados, cilindros y esferas", "Dibuja un cilindro y una esfera con su sombra básica."),
                ("2.3 De formas a objetos", "Elige 3 objetos de tu casa y redúcelos a formas básicas antes de dibujarlos.")]),
            ("Proporción", [
                ("3.1 Medición a ojo con el lápiz", "Mide con el lápiz la altura y el ancho de una taza antes de dibujarla."),
                ("3.2 Simetría y ejes", "Dibuja un florero usando una línea guía central."),
                ("3.3 Errores frecuentes de proporción", "Revisa un dibujo tuyo anterior y marca 3 errores que ahora puedas corregir.")]),
            ("Luz y sombra", [
                ("4.1 De dónde viene la luz", "Observa una fruta junto a una ventana 5 minutos y anota cómo cambia su sombra."),
                ("4.2 Sombra propia y sombra proyectada", "Dibuja un cubo marcando sus dos tipos de sombra."),
                ("4.3 Dar volumen con degradados", "Dibuja una esfera con tres tonos de sombra.")]),
            ("Texturas", [
                ("5.1 Madera y metal", "Dibuja un cuadro de 5×5 cm de cada textura."),
                ("5.2 Vidrio y tela", "Dibuja un vaso de vidrio y un trozo de tela con pliegues."),
                ("5.3 Piel y cabello", "Dibuja una textura de piel de animal y un mechón de cabello.")]),
            ("Rostros", [
                ("6.1 La estructura de la cabeza", "Dibuja un óvalo y traza las líneas guía de ojos, nariz y boca."),
                ("6.2 Ojos y nariz", "Dibuja 5 pares de ojos con expresiones distintas."),
                ("6.3 Boca y cabello", "Completa el rostro que empezaste en la lección 6.1.")]),
            ("Composición: planea tu dibujo final", [
                ("7.1 Cómo elegir tu tema y tu referencia", "Elige la foto u objeto que vas a dibujar en tu proyecto final."),
                ("7.2 Boceto y encuadre", "Haz 3 bocetos pequeños de tu idea antes de pasarla a limpio.")]),
            ("Tu primer dibujo terminado", [
                ("8.1 De boceto a dibujo final", "Pasa tu boceto elegido a una hoja limpia y empieza a trazar."),
                ("8.2 Últimos detalles y acabado", "Agrega texturas y sombras finales a tu dibujo."),
                ("8.3 Cómo fotografiar y compartir tu trabajo", "Fotografía tu dibujo terminado con luz natural y compártelo.")]),
        ]),
    dict(
        slug="pintura", title="Pintura Desde Cero", grad="g-paint", cat="Pintura",
        short="Teoría del color y mezcla en acrílico, de paisajes a tu primer cuadro terminado.",
        promise="Aprende a pintar en acrílico desde cero, de la teoría del color a tu primer cuadro terminado, con ejercicios cortos que puedes practicar hoy mismo.",
        who="Para quien quiere pintar pero no sabe qué materiales comprar ni cómo mezclar colores. Empezamos en acrílico por ser práctico y de secado rápido.",
        bullets=["Círculo cromático y mezcla de color", "Pinceles, técnicas, luces y sombras", "20 ejercicios, plantillas y referencias"],
        learn=["Entender el círculo cromático, los cálidos, los fríos y los complementarios", "Mezclar el tono exacto que necesitas sin ensuciar el color",
               "Elegir el pincel y la técnica para cada efecto: empaste, veladura y frotado seco", "Dar volumen con pintura: luz, sombra y reflejos",
               "Pintar paisajes con profundidad, flores y bodegones", "Planear y terminar tu primer cuadro"],
        extras=["20 ejercicios de color y pincelada adicionales", "Círculo cromático y guía de mezclas para imprimir", "Guía de materiales según tu presupuesto",
                "Referencias de paisajes, flores y bodegones para practicar", "Certificado digital de finalización"],
        kit=["Acrílicos: los 3 colores primarios, blanco y negro", "3 pinceles", "Un lienzo o cartón entelado"],
        modules=[
            ("Materiales y preparación", [
                ("1.1 Bienvenida a Pintura Desde Cero", "Escribe qué te gustaría poder pintar en 9 semanas."),
                ("1.2 Materiales: pinturas, pinceles, superficies", "Arma tu kit básico y fotografíalo."),
                ("1.3 Cómo preparar tu superficie y tu paleta", "Prepara tu paleta de mezcla y deja lista tu superficie de trabajo.")]),
            ("Teoría básica del color", [
                ("2.1 El círculo cromático: primarios, secundarios y terciarios", "Dibuja tu propio círculo cromático mezclando solo los 3 colores primarios."),
                ("2.2 Temperatura del color: cálidos y fríos", "Separa tu paleta en dos grupos, cálidos y fríos."),
                ("2.3 Colores complementarios y armonías", "Pinta 3 franjas mezclando una pareja de complementarios en distinta proporción.")]),
            ("Mezcla de colores", [
                ("3.1 Aclarar y oscurecer sin ensuciar el color", "Crea una escala de 5 tonos de un mismo color."),
                ("3.2 Mezclar el tono exacto que necesitas", "Intenta igualar el color de un objeto real que tengas en casa."),
                ("3.3 Errores comunes al mezclar (y cómo evitarlos)", "Identifica un color «sucio» en tu paleta y corrígelo.")]),
            ("Pinceles y trazos", [
                ("4.1 Qué pincel usar para cada efecto", "Prueba los 3 pinceles de tu kit sobre una misma hoja y anota qué trazo hace cada uno."),
                ("4.2 Control de la muñeca: trazos largos, cortos y de presión variable", "Llena una fila con trazos largos y otra con trazos cortos."),
                ("4.3 Técnicas básicas: empaste, veladura y frotado seco", "Haz un cuadro de cada técnica sobre la misma hoja.")]),
            ("Luces y sombras", [
                ("5.1 Aplicar volumen con pintura, no solo con lápiz", "Pinta un cubo marcando su cara clara y su cara en sombra."),
                ("5.2 Sombra propia, proyectada y reflejo de luz en color", "Pinta una esfera con degradado de tres tonos.")]),
            ("Paisajes", [
                ("6.1 Cielo y horizonte: tu primer fondo", "Pinta un cielo con degradado, de claro arriba a más oscuro en el horizonte."),
                ("6.2 Profundidad con capas de color", "Agrega una montaña de fondo, en un tono más frío y difuso."),
                ("6.3 Montañas, árboles y agua simplificados", "Completa tu paisaje con un primer plano de árboles o agua.")]),
            ("Flores y naturaleza", [
                ("7.1 Formas orgánicas y pinceladas sueltas", "Pinta 5 pétalos sueltos sin dibujarlos antes a lápiz."),
                ("7.2 Tu primera flor paso a paso", "Pinta 3 flores del mismo tipo, de memoria, sin boceto previo.")]),
            ("Objetos y composiciones", [
                ("8.1 Naturaleza muerta: cómo elegir y organizar tus objetos", "Arma un bodegón sencillo con 2 o 3 objetos de tu casa."),
                ("8.2 Componer varios elementos en un mismo cuadro", "Bosqueja tu bodegón antes de pintarlo, cuidando el espacio entre objetos.")]),
            ("Proyecto final", [
                ("9.1 Planeación de tu cuadro final", "Elige tu tema final y haz un boceto rápido de composición."),
                ("9.2 Ejecución: de la base al detalle", "Pinta las capas base de tu cuadro final antes de entrar en detalle."),
                ("9.3 Últimos retoques y cómo fotografiar tu obra", "Termina tu primer cuadro, fotografíalo con luz natural y compártelo.")]),
        ]),
    dict(
        slug="jabones", title="Jabones Artesanales", grad="g-soap", cat="Jabones",
        short="Jabones de glicerina con diseño y presentación, más tus primeros pasos para venderlos.",
        promise="Aprende a hacer jabones artesanales de glicerina, con diseño y presentación de nivel profesional, y da tus primeros pasos para venderlos.",
        who="Para quien quiere un pasatiempo o una idea de negocio con poca inversión. Usamos base de glicerina: no se manipula soda cáustica, así que es apto para principiantes.",
        bullets=["Sin soda cáustica: apto para principiantes", "Capas, inclusiones, empaque y etiquetas", "22 ejercicios, costos y catálogo"],
        learn=["Fundir la base de glicerina sin quemarla", "Agregar aromas y colorantes en la proporción correcta", "Desmoldar y cortar sin dañar el jabón",
               "Hacer capas de color, inclusiones y formas", "Empacar, etiquetar y fotografiar tu producto", "Calcular costos y definir tu precio de venta",
               "Crear una pequeña marca y dar tus primeras ventas"],
        extras=["22 ejercicios extra organizados por módulo", "Guía de materiales e ingredientes y dónde comprarlos", "Checklist de higiene y organización del espacio",
                "Plantillas de trabajo: ficha de costos, etiquetas, registro de lotes y catálogo", "Hoja de costos y precio de venta", "Certificado digital de finalización"],
        kit=["Base de glicerina", "Moldes", "Colorantes y fragancias cosméticas"],
        modules=[
            ("Introducción", [
                ("1.1 Bienvenida y tipos de jabón (glicerina vs. saponificación en frío)", "Escribe para quién te gustaría hacer tu primer jabón: para ti, para regalar o para vender."),
                ("1.2 Herramientas e ingredientes básicos", "Arma tu kit y fotografíalo."),
                ("1.3 Higiene y organización de tu espacio de trabajo", "Organiza tu mesa de trabajo siguiendo la checklist de higiene del PDF.")]),
            ("Jabones de glicerina", [
                ("2.1 Cómo fundir la base sin quemarla", "Funde 200 g de base a baño María controlando la temperatura."),
                ("2.2 Aromas y colorantes: proporciones correctas", "Agrega fragancia y color a tu base fundida siguiendo la tabla de proporciones."),
                ("2.3 Moldes y tiempos de secado", "Vierte tu mezcla en un molde y registra la hora exacta de vaciado."),
                ("2.4 Corte y desmolde sin dañar el jabón", "Desmolda y corta tu primera barra de jabón de un solo color.")]),
            ("Diseños", [
                ("3.1 Capas de color", "Haz un jabón de 2 capas, dejando enfriar la primera antes de verter la segunda."),
                ("3.2 Inclusiones: pétalos, avena, purpurina cosmética", "Agrega una inclusión a tu próxima barra antes de que endurezca del todo."),
                ("3.3 Formas y combinaciones visuales", "Combina un molde nuevo con capas o inclusiones en un mismo jabón.")]),
            ("Presentación", [
                ("4.1 Empaque: qué proteger y cómo", "Empaca uno de tus jabones ya terminados."),
                ("4.2 Etiquetas: qué información no puede faltar", "Diseña la etiqueta de tu jabón con la plantilla."),
                ("4.3 Fotografía básica de producto con el celular", "Fotografía tu jabón empacado y etiquetado con luz natural.")]),
            ("Costos", [
                ("5.1 Costo por unidad: materia prima y empaque", "Suma el costo real de materiales de tu último jabón."),
                ("5.2 Sumar tu mano de obra (sin regalarla)", "Calcula cuánto vale tu tiempo por jabón según cuánto tardaste."),
                ("5.3 Definir precio de venta y margen", "Define el precio de venta de tu jabón con la guía de costos.")]),
            ("Creación de una pequeña marca", [
                ("6.1 Nombre e identidad", "Escribe 3 posibles nombres para tu marca de jabones."),
                ("6.2 Catálogo de productos", "Arma un catálogo de 3 productos con la plantilla."),
                ("6.3 Instagram y WhatsApp para tu marca", "Crea o actualiza tu perfil con el nombre y catálogo que definiste.")]),
            ("Primeras ventas", [
                ("7.1 Venta directa y regalos", "Haz una lista de 5 personas a quienes podrías mostrarles tu primer jabón."),
                ("7.2 Mercados artesanales y ferias", "Busca una feria o mercado artesanal cerca de ti y anota los requisitos para participar."),
                ("7.3 Redes sociales y paquetes/promociones", "Publica tu primer producto en tu red social elegida.")]),
        ]),
    dict(
        slug="velas", title="Velas Artesanales", grad="g-candle", cat="Velas",
        short="Velas de soja aromáticas con diseño y presentación, más tus primeros pasos para venderlas.",
        promise="Aprende a hacer velas de soja aromáticas, con diseño y presentación de nivel profesional, y da tus primeros pasos para venderlas.",
        who="Para quien quiere un pasatiempo o una idea de negocio con poca inversión. Usamos cera de soja natural en envase de vidrio, sin parafina ni cera de abeja.",
        bullets=["Cera de soja en envase de vidrio", "Mechas, fragancia y tiempo de curado", "Etiquetas con advertencia, costos y catálogo"],
        learn=["Fundir la cera de soja sin quemarla", "Elegir y centrar la mecha correcta", "Agregar fragancia a la temperatura y proporción correctas",
               "Verter y curar tu vela", "Hacer capas, inclusiones y efecto marmoleado", "Hacer una prueba de quemado y fotografiar tu producto",
               "Calcular costos, crear tu marca y dar tus primeras ventas"],
        extras=["Guía de materiales e ingredientes y dónde comprarlos", "Checklist de seguridad y organización del espacio",
                "Plantillas de etiquetas (con advertencia) y catálogo de productos", "Hoja de costos y precio de venta", "Certificado digital de finalización"],
        kit=["Cera de soja", "Mechas", "Envases de vidrio y fragancias para velas"],
        modules=[
            ("Introducción", [
                ("1.1 Bienvenida y tipos de cera (soja vs. parafina vs. abeja)", "Escribe para quién te gustaría hacer tu primera vela: para ti, para regalar o para vender."),
                ("1.2 Herramientas e ingredientes básicos", "Arma tu kit y fotografíalo."),
                ("1.3 Seguridad y organización del espacio de trabajo", "Organiza tu mesa de trabajo siguiendo la checklist de seguridad del PDF.")]),
            ("Velas de soja", [
                ("2.1 Cómo fundir la cera sin quemarla", "Funde 200 g de cera a baño María controlando la temperatura hasta 85 °C."),
                ("2.2 Elegir y centrar la mecha correcta", "Centra una mecha en un envase vacío antes de verter."),
                ("2.3 Fragancia: temperatura y proporción correctas", "Agrega fragancia a tu cera fundida siguiendo la tabla de proporciones."),
                ("2.4 Vertido y tiempo de curado", "Vierte tu primera vela y registra la fecha para curarla 1 o 2 semanas.")]),
            ("Diseños", [
                ("3.1 Capas de color", "Haz una vela de 2 capas, dejando enfriar la primera antes de verter la segunda."),
                ("3.2 Inclusiones: flores secas, purpurina cosmética", "Pega una flor seca contra el vidrio, lejos de la mecha."),
                ("3.3 Efecto veteado o marmoleado", "Combina 2 colores a distinta temperatura en un mismo envase.")]),
            ("Presentación", [
                ("4.1 Envases: qué proteger y cómo elegirlos", "Elige y prepara el envase para tu próxima vela."),
                ("4.2 Etiquetas: qué información no puede faltar", "Diseña la etiqueta de tu vela con la plantilla, incluida la advertencia de seguridad."),
                ("4.3 Prueba de quemado y fotografía de producto", "Haz una prueba de quemado de 2 horas y fotografía tu vela encendida y apagada.")]),
            ("Costos", [
                ("5.1 Costo por unidad: materia prima y envase", "Suma el costo real de materiales de tu última vela."),
                ("5.2 Sumar tu mano de obra (sin regalarla)", "Calcula cuánto vale tu tiempo por vela según cuánto tardaste."),
                ("5.3 Definir precio de venta y margen", "Define el precio de venta de tu vela con la guía de costos.")]),
            ("Creación de una pequeña marca", [
                ("6.1 Nombre e identidad", "Escribe 3 posibles nombres para tu marca de velas."),
                ("6.2 Catálogo de productos", "Arma un catálogo de 3 productos con la plantilla."),
                ("6.3 Instagram y WhatsApp para tu marca", "Crea o actualiza tu perfil con el nombre y catálogo que definiste.")]),
            ("Primeras ventas", [
                ("7.1 Venta directa y regalos", "Haz una lista de 5 personas a quienes podrías mostrarles tu primera vela."),
                ("7.2 Mercados artesanales y ferias", "Busca una feria o mercado artesanal cerca de ti y anota los requisitos para participar."),
                ("7.3 Redes sociales y paquetes/promociones", "Publica tu primer producto en tu red social elegida.")]),
        ]),
]
for c in COURSES:
    c["n_mod"] = len(c["modules"])
    c["n_les"] = sum(len(m[1]) for m in c["modules"])

# precios mostrados (deben coincidir con CONFIG.prices de app.js)
P = {"one": ("US$6", "COP $24.000"), "preset": ("US$7,50", "COP $29.900"), "four": ("US$14", "COP $55.900"),
     "preset_old": ("US$12", "COP $48.000"), "four_old": ("US$24", "COP $96.000"),
     "preset_save": ("US$4,50", "COP $18.100"), "four_save": ("US$10", "COP $40.100")}


def price(key, tag="span", cls="price"):
    usd, cop = P[key]
    return f'<{tag} class="{cls}" data-usd="{usd}" data-cop="{cop}">{cop}</{tag}>'


e = html.escape


# ------------------------------------------------------------- parciales ----
def head(title, desc, path, extra=""):
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
  <link rel="canonical" href="{SITE}{path}">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{SITE}{path}">
  <meta property="og:image" content="{SITE}/img/logo-completo.png">
  <meta name="theme-color" content="#14285A">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="icon" type="image/png" href="/img/favicon.png">
  <link rel="stylesheet" href="/styles.css">
{extra}</head>
<body>
"""


def header(home):
    base = "" if home else "/"
    return f"""
<header class="topbar">
  <div class="wrap topbar-in">
    <a class="brand" href="/" aria-label="Academia Taller Creativo">
      {LOGO}
      <span class="brand-text"><small>Academia</small><b>Taller Creativo</b></span>
    </a>
    <nav class="nav" aria-label="Principal">
      <a href="{base}#guias">Guías</a>
      <a href="{base}#paquetes">Paquetes</a>
      <a href="{base}#preguntas">Preguntas</a>
    </nav>
    <button type="button" class="cart-btn" data-open-cart aria-label="Abrir carrito">
      {CART_SVG}<span class="cart-count" data-cart-count hidden>0</span>
    </button>
    <a class="btn btn-sm hide-sm" href="#" data-wa="Hola, quiero información de la Academia Taller Creativo">{WA_SVG}<span>Escríbenos</span></a>
  </div>
</header>
"""


CART = """
<div class="cart-overlay" id="cart-overlay"></div>
<aside class="cart" id="cart" aria-hidden="true" aria-label="Tu carrito">
  <div class="cart-head">
    <h2>Tu carrito</h2>
    <button type="button" class="cart-close" aria-label="Cerrar carrito">×</button>
  </div>
  <div class="cart-body">
    <div class="currency small" role="group" aria-label="Moneda">
      <button type="button" data-cur="cop" aria-pressed="true">COP Pesos</button>
      <button type="button" data-cur="usd" aria-pressed="false">US$ Dólares</button>
    </div>
    <p class="cart-empty">Tu carrito está vacío. Agrega una o más guías y el mejor precio se aplica solo.</p>
    <ul class="cart-items"></ul>
    <div class="cart-summary" hidden>
      <div class="cart-line"><span>Total</span><b class="cart-total"></b></div>
      <p class="cart-saving"></p>
      <p class="cart-hint"></p>
      <div class="cart-pay"></div>
      <p class="cart-note"></p>
    </div>
  </div>
</aside>
"""


def footer():
    return """
<footer class="footer">
  <div class="wrap foot-in">
    <img src="/img/logo-completo.png" alt="Academia Taller Creativo: Aprende, Crea, Emprende" width="120" height="120" loading="lazy">
    <span>© <span id="year">2026</span> Academia Taller Creativo · Todos los derechos reservados</span>
  </div>
</footer>

<a class="wa-float" href="#" data-wa="Hola, quiero información de la Academia Taller Creativo" aria-label="Escríbenos por WhatsApp">
  <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path fill="#fff" d="M16 3a13 13 0 0 0-11 19.8L3 29l6.4-2A13 13 0 1 0 16 3zm0 2.4a10.6 10.6 0 1 1-5.5 19.7l-.4-.2-3.8 1.2 1.2-3.7-.3-.4A10.6 10.6 0 0 1 16 5.4zm-4 5.3c-.3 0-.7.1-1 .5-.4.4-1.3 1.3-1.3 3.1s1.3 3.6 1.5 3.8c.2.3 2.6 4.1 6.4 5.6 3.2 1.2 3.8 1 4.5.9.7-.1 2.2-.9 2.5-1.8.3-.9.3-1.6.2-1.8-.1-.2-.4-.3-.8-.5s-2.2-1.1-2.5-1.2c-.3-.1-.6-.2-.8.2-.2.4-.9 1.2-1.1 1.4-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.3-2.1-2.7-.2-.4 0-.6.2-.8l.6-.7c.2-.2.2-.4.4-.6.1-.3.1-.5 0-.7l-1.1-2.7c-.3-.7-.6-.6-.8-.6z"/></svg>
</a>

<script src="/app.js"></script>
</body>
</html>
"""


def read(name):
    with open(os.path.join(ROOT, "src", name), encoding="utf-8") as f:
        return f.read()


def write(rel, text):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


# ---------------------------------------------------------------- portada ---
def course_card(c):
    return f"""
        <article class="guia">
          <a class="guia-top {c['grad']}" href="/guias/{c['slug']}" aria-label="Ver {e(c['title'])}">{ICON[c['slug']]}</a>
          <div class="guia-body">
            <span class="tag">{c['n_mod']} módulos · {c['n_les']} lecciones</span>
            <h3><a href="/guias/{c['slug']}">{e(c['title'])}</a></h3>
            <p>{e(c['short'])}</p>
            <ul>{''.join(f'<li>{e(b)}</li>' for b in c['bullets'])}</ul>
            <div class="guia-foot">
              {price('one', 'b', 'price big')}
              <div class="guia-actions">
                <a class="btn btn-sm btn-ghost" href="/guias/{c['slug']}">Ver guía</a>
                <button type="button" class="btn btn-sm" data-add="{c['slug']}" data-label="Agregar"><span class="lbl">Agregar</span></button>
              </div>
            </div>
          </div>
        </article>"""


def pack_card(title, desc, slugs, key, old, save, featured=False):
    icons = "".join(f'<span class="cat-ico mini">{ICON[s]}</span>' for s in slugs)
    badge = '<span class="badge-top">MEJOR PRECIO</span>' if featured else ""
    return f"""
        <article class="pack{' featured' if featured else ''}">
          {badge}
          <div class="pack-ico">{icons}</div>
          <h3>{title}</h3>
          <p class="pack-desc">{desc}</p>
          <div class="pack-price">{price(key, 'b')}{price(old, 's')}</div>
          <p class="pack-save">Ahorras {price(save)}</p>
          <button type="button" class="btn btn-block" data-add-pack="{','.join(slugs)}">Agregar al carrito</button>
        </article>"""


def build_index():
    cards = "".join(course_card(c) for c in COURSES)
    packs = (
        pack_card("Dibujo + Pintura", "Aprende a dibujar y a darle color a tus ideas.", ["dibujo", "pintura"], "preset", "preset_old", "preset_save")
        + pack_card("Jabones + Velas", "Crea productos artesanales para regalar o vender.", ["jabones", "velas"], "preset", "preset_old", "preset_save")
        + pack_card("Paquete completo: las 4 guías", "Dibujo, Pintura, Jabones y Velas, con todos los bonos y el certificado digital.",
                    ["dibujo", "pintura", "jabones", "velas"], "four", "four_old", "four_save", featured=True)
    )
    desc = "Guías digitales en PDF, paso a paso y desde cero: dibujo, pintura, jabones y velas artesanales. Desde COP $24.000. Acceso inmediato y garantía de 7 días."
    ld = json.dumps({"@context": "https://schema.org", "@type": "Organization", "name": "Academia Taller Creativo",
                     "url": SITE, "logo": SITE + "/img/logo-marca.png"}, ensure_ascii=False)
    body = f"""{head("Academia Taller Creativo · Guías de dibujo, pintura, jabones y velas", desc, "/", f'  <script type="application/ld+json">{ld}</script>\n')}
{header(True)}
<main id="inicio">

{read('hero.html')}
{read('ps.html')}
  <!-- CATALOGO -->
  <section class="section" id="guias">
    <div class="wrap">
      <h2>Nuestras guías</h2>
      <p class="sub">Guías descargables en PDF, paso a paso y con diagramas reales, para aprender rápido y, si quieres, convertirlo en un ingreso extra. Elige una o llévate varias y el mejor precio se aplica solo.</p>
      <div class="currency" role="group" aria-label="Moneda">
        <button type="button" data-cur="cop" aria-pressed="true">COP Pesos</button>
        <button type="button" data-cur="usd" aria-pressed="false">US$ Dólares</button>
      </div>
      <div class="guias">{cards}
      </div>
      <h3 class="chips-title">Cada guía incluye</h3>
      <div class="bonus-strip">
        <span>Guía de materiales</span><span>Ejercicios extra por módulo</span><span>Plantillas de trabajo imprimibles</span>
        <span>Guía de costos y precio de venta</span><span>Banco de referencias</span><span>Certificado digital</span>
      </div>
      <p class="note">Hoy las guías se entregan en PDF. Los videos todavía no están grabados; cuando existan, quien ya compró los recibe sin costo extra.</p>
    </div>
  </section>

  <!-- PAQUETES -->
  <section class="section alt" id="paquetes">
    <div class="wrap">
      <h2>Paquetes con descuento</h2>
      <p class="sub">Llévate más guías y paga menos por cada una. También puedes armar tu propio paquete: agrega al carrito las guías que quieras.</p>
      <div class="packs">{packs}
      </div>
      <p class="note">¿Quieres otra combinación? <a href="#" data-wa="Hola, quiero armar un paquete a mi medida de la Academia Taller Creativo">Escríbenos por WhatsApp</a> y te ayudamos.</p>
    </div>
  </section>

  <!-- COMO COMPRAR -->
  <section class="section">
    <div class="wrap">
      <h2>Así de fácil</h2>
      <ol class="steps">
        <li><b>Elige tus guías</b><span>Agrega al carrito una o varias. El descuento por cantidad se aplica solo.</span></li>
        <li><b>Paga como prefieras</b><span>Con tarjeta en dólares, en pesos o por WhatsApp. Pago seguro.</span></li>
        <li><b>Recibe y crea</b><span>Apenas se confirma el pago recibes tu guía en PDF para usar en el celular o impresa.</span></li>
      </ol>
    </div>
  </section>
{read('garantia.html')}
{read('faq.html')}
  <!-- CTA FINAL -->
  <section class="cta" id="contacto">
    <div class="wrap cta-in">
      <h2>Quiero aprender y crear</h2>
      <p>Tu primer dibujo, tu primer cuadro, tu primer jabón y tu primera vela están a una guía de distancia.</p>
      <a class="btn btn-light" href="#guias">Ver las guías</a>
      <p class="cta-wa"><a href="#" data-wa="Hola, quiero información de la Academia Taller Creativo">¿Dudas? Escríbenos por WhatsApp</a></p>
    </div>
  </section>
</main>
{CART}{footer()}"""
    write("index.html", body)


# ------------------------------------------------------------ página guía ---
def build_course(c):
    others = [o for o in COURSES if o["slug"] != c["slug"]]
    mods = ""
    for i, (name, lessons) in enumerate(c["modules"], 1):
        items = "".join(
            f'<li><span class="les-name">{e(t)}</span><span class="les-do"><b>Ejercicio:</b> {e(p)}</span></li>' for t, p in lessons)
        mods += f"""
        <details class="mod"{' open' if i == 1 else ''}>
          <summary><span class="mod-num">{i}</span><span class="mod-title">{e(name)}</span><span class="mod-count">{len(lessons)} lecciones</span></summary>
          <ul class="lessons">{items}</ul>
        </details>"""
    more = "".join(f"""
        <a class="more-card" href="/guias/{o['slug']}">
          <span class="more-top {o['grad']}">{ICON[o['slug']]}</span>
          <span class="more-body"><b>{e(o['title'])}</b><span class="price" data-usd="{P['one'][0]}" data-cop="{P['one'][1]}">{P['one'][1]}</span></span>
        </a>""" for o in others)
    title = f"{c['title']} · Guía en PDF · Academia Taller Creativo"
    desc = f"{c['promise']} {c['n_mod']} módulos, {c['n_les']} lecciones. Desde COP $24.000. Acceso inmediato y garantía de 7 días."
    ld = json.dumps({
        "@context": "https://schema.org", "@type": "Product", "name": f"{c['title']} · Academia Taller Creativo",
        "description": c["promise"], "brand": {"@type": "Brand", "name": "Academia Taller Creativo"},
        "image": SITE + "/img/logo-completo.png",
        "offers": {"@type": "Offer", "priceCurrency": "COP", "price": "24000", "availability": "https://schema.org/InStock",
                   "url": f"{SITE}/guias/{c['slug']}"}}, ensure_ascii=False)
    body = f"""{head(title, desc, f"/guias/{c['slug']}", f'  <script type="application/ld+json">{ld}</script>\n')}
{header(False)}
<main>
  <section class="chero">
    <div class="wrap chero-in">
      <div class="chero-copy">
        <p class="crumbs"><a href="/">Inicio</a> › <a href="/#guias">Guías</a> › {e(c['cat'])}</p>
        <span class="pill">Guía en PDF · {c['n_mod']} módulos · {c['n_les']} lecciones</span>
        <h1>{e(c['title'])}</h1>
        <p class="lead">{e(c['promise'])}</p>
        <p class="who"><b>¿Para quién es?</b> {e(c['who'])}</p>
        <ul class="ticks">
          <li>Paso a paso, sin experiencia previa</li>
          <li>Ejercicio práctico al final de cada lección</li>
          <li>Acceso inmediato tras el pago · Garantía de 7 días</li>
        </ul>
      </div>
      <aside class="buybox">
        <div class="buybox-cover {c['grad']}">{ICON[c['slug']]}</div>
        <div class="currency small" role="group" aria-label="Moneda">
          <button type="button" data-cur="cop" aria-pressed="true">COP Pesos</button>
          <button type="button" data-cur="usd" aria-pressed="false">US$ Dólares</button>
        </div>
        <div class="buybox-price">{price('one', 'b')}<span>Acceso de por vida</span></div>
        <button type="button" class="btn btn-block" data-add="{c['slug']}" data-label="Agregar al carrito"><span class="lbl">Agregar al carrito</span></button>
        <p class="buybox-deal">Con 2 guías pagas desde {price('preset')} el paquete. <a href="/#paquetes">Ver paquetes</a></p>
        <ul class="buybox-list">
          <li>Guía completa en PDF</li>
          <li>Plantillas y ejercicios extra</li>
          <li>Certificado digital</li>
          <li>Garantía de 7 días</li>
        </ul>
      </aside>
    </div>
  </section>

  <section class="section">
    <div class="wrap two-col">
      <div>
        <h2 class="left">Lo que aprenderás</h2>
        <ul class="learn">{''.join(f'<li>{e(x)}</li>' for x in c['learn'])}</ul>

        <h2 class="left">Contenido de la guía</h2>
        <p class="sub left">{c['n_mod']} módulos · {c['n_les']} lecciones, cada una con su ejercicio.</p>
        <div class="mods">{mods}
        </div>
      </div>
      <div class="side">
        <div class="side-card">
          <h3>Qué incluye</h3>
          <ul class="checks-sm">{''.join(f'<li>{e(x)}</li>' for x in c['extras'])}</ul>
        </div>
        <div class="side-card">
          <h3>Para empezar necesitas</h3>
          <ul class="checks-sm">{''.join(f'<li>{e(x)}</li>' for x in c['kit'])}</ul>
          <p class="mini">La guía te dice qué comprar según tu presupuesto. No necesitas experiencia previa.</p>
        </div>
        <div class="side-card soft">
          <h3>Entrega</h3>
          <p>Hoy la guía es un PDF que recibes apenas se confirma el pago. Los videos todavía no están grabados; cuando existan, quien ya compró los recibe sin costo extra.</p>
        </div>
      </div>
    </div>
  </section>
{read('garantia.html')}
{read('faq.html')}
  <section class="section">
    <div class="wrap">
      <h2>También te puede interesar</h2>
      <div class="more">{more}
      </div>
    </div>
  </section>
</main>

<div class="buybar">
  <div class="buybar-in">
    <div class="buybar-price"><small>{e(c['title'])}</small>{price('one', 'b')}</div>
    <button type="button" class="btn" data-add="{c['slug']}" data-label="Agregar"><span class="lbl">Agregar</span></button>
  </div>
</div>
{CART}{footer()}"""
    write(f"guias/{c['slug']}.html", body)


def build_seo():
    urls = ["/"] + [f"/guias/{c['slug']}" for c in COURSES]
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sm += "".join(f"  <url><loc>{SITE}{u}</loc></url>\n" for u in urls) + "</urlset>\n"
    write("sitemap.xml", sm)
    write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")


if __name__ == "__main__":
    build_index()
    for course in COURSES:
        build_course(course)
    build_seo()
    print("OK:", ["index.html"] + [f"guias/{c['slug']}.html" for c in COURSES])
