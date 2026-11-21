#!/usr/bin/env python3
"""Genera el sitio estático: index.html, guias/<guia>.html, sitemap.xml y robots.txt.

Uso:  python build.py
Los textos de cada guía viven en COURSES; los bloques de la portada, en src/.
"""
import html
import json
import os
import re

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
# Botones «Únete gratis», «Entrar» y «Mis cursos» del menú. Se muestran al público cuando el envío de correos con el
# código sale por un SMTP propio en Supabase (el de fábrica solo envía a miembros de la organización y ~2 correos por
# hora, así que los compradores no recibirían su código). Mientras tanto se entra por /entrar y /entrar?registro=1.
# Cambia SHOW_JOIN a True y ejecuta `python build.py` para mostrarlos.
SHOW_JOIN = False
AUTH_BTNS = """<a class="btn btn-sm acct-join" href="/entrar?registro=1" data-auth="out">Únete gratis</a>
    <a class="acct-link" href="/entrar" data-auth="out">Entrar</a>
    <a class="btn btn-sm btn-ghost acct-my" href="/mis-cursos" data-auth="in" hidden>Mis cursos</a>"""
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
def head(title, desc, path, extra="", image=None, keywords=""):
    """<head> común: título, descripción, canónica, Open Graph, Twitter y robots (salvo páginas noindex)."""
    img = image or f"{SITE}/img/og-taller-creativo.jpg"
    dims = '  <meta property="og:image:width" content="1200">\n  <meta property="og:image:height" content="630">\n' if not image else ""
    kw = f'  <meta name="keywords" content="{e(keywords)}">\n' if keywords else ""
    robots = "" if "noindex" in extra else '  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">\n'
    alt = "Academia Taller Creativo: guías de dibujo, pintura, jabones y velas artesanales" if not image else title
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
{kw}{robots}  <meta name="author" content="Academia Taller Creativo">
  <link rel="canonical" href="{SITE}{path}">
  <meta property="og:site_name" content="Academia Taller Creativo">
  <meta property="og:locale" content="es_CO">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{SITE}{path}">
  <meta property="og:image" content="{e(img)}">
{dims}  <meta property="og:image:alt" content="{e(alt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(title)}">
  <meta name="twitter:description" content="{e(desc)}">
  <meta name="twitter:image" content="{e(img)}">
  <meta name="theme-color" content="#14285A">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="icon" type="image/png" href="/img/favicon.png">
  <link rel="apple-touch-icon" href="/img/logo-marca.png">
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
      <a href="{base}#medida">Tu taller</a>
      <a href="{base}#guias">Guías</a>
      <a href="{base}#paquetes">Paquetes</a>
      <a href="{base}#preguntas">Preguntas</a>
    </nav>
    {AUTH_BTNS if SHOW_JOIN else ""}
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

<script src="/js/icons.js"></script>
<script src="/js/catalog.js"></script>
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



# ------------------------------------------------- catálogo (para el HTML) ---
# Al construir el sitio se lee lo publicado en Supabase (lectura pública) y se deja ya escrito en el HTML: tarjetas,
# paquetes, una página por curso y datos estructurados. Así Google ve el contenido sin ejecutar JavaScript. En el
# navegador js/catalog.js lo vuelve a pintar con lo último de la base. Un curso nuevo funciona al instante por la
# plantilla guia.html; al volver a ejecutar `python build.py` y subirlo, también queda como página fija.
CAT_SELECT = ("courses?select=slug,title,category,short,promise,who,bullets,learn,extras,kit,grad,cover_path,price_cop,price_usd,"
              "sort_order,updated_at,course_modules(id,position,title,course_lessons(id,position,title,exercise))"
              "&status=eq.publicado&order=sort_order.asc")
_CAT = None


def fetch_catalog():
    global _CAT
    if _CAT is not None:
        return _CAT
    _CAT = {"ok": False, "courses": [], "bundles": [], "url": ""}
    import urllib.request
    try:
        src = open(os.path.join(ROOT, "js", "catalog.js"), encoding="utf-8").read()
        url = re.search(r'URL_BASE = "([^"]+)"', src).group(1)
        key = re.search(r'ANON = "([^"]+)"', src).group(1)

        def get(path):
            req = urllib.request.Request(url + "/rest/v1/" + path, headers={"apikey": key, "Authorization": "Bearer " + key})
            return json.loads(urllib.request.urlopen(req, timeout=20).read())

        courses = get(CAT_SELECT)
        bundles = get("bundles?select=id,code,name,description,slugs,price_cop,price_usd,featured,sort_order&active=eq.true&order=sort_order.asc")
        for c in courses:
            c["modules"] = [{"title": m["title"], "lessons": sorted(m["course_lessons"], key=lambda x: x["position"])}
                            for m in sorted(c.pop("course_modules"), key=lambda x: x["position"])]
            c["n_mod"] = len(c["modules"])
            c["n_les"] = sum(len(m["lessons"]) for m in c["modules"])
        _CAT.update(ok=bool(courses), courses=courses, bundles=bundles, url=url)
    except Exception as ex:
        print("AVISO: no se pudo leer el catálogo de la base; se deja el HTML sin pre-render (", ex, ")")
    return _CAT


def money(n, cur):
    n = float(n)
    if cur == "usd":
        return f"US${int(n)}" if n == int(n) else f"US${n:.2f}".replace(".", ",")
    return "COP $" + f"{round(n):,}".replace(",", ".")


def price_el(cop, usd, tag="span", cls="price"):
    return f'<{tag} class="{cls}" data-cop="{e(money(cop, "cop"))}" data-usd="{e(money(usd, "usd"))}">{e(money(cop, "cop"))}</{tag}>'


def cover_url(c):
    if not c.get("cover_path"):
        return ""
    from urllib.parse import quote
    return f"{_CAT['url']}/storage/v1/object/public/covers/{quote(c['cover_path'])}"


def course_icon(slug):
    return ICON.get(slug) or '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4l3.5 7.5L28 12.6l-6 5.7 1.5 8.4L16 22.6 8.5 26.7 10 18.3 4 12.6l8.5-1.1z" fill="#FFC93C"/></svg>'


def card_html(c):
    href = f"/guias/{c['slug']}"
    cover = cover_url(c)
    inner = (f'<img src="{e(cover)}" alt="Portada de la guía {e(c["title"])}" loading="lazy" width="960" height="504">' if cover else course_icon(c["slug"]))
    top = f'<a class="guia-top {"has-cover" if cover else e(c["grad"])}" href="{href}" aria-label="Ver {e(c["title"])}">{inner}</a>'
    lis = "".join(f"<li>{e(b)}</li>" for b in (c.get("bullets") or []))
    return (f'<article class="guia">{top}<div class="guia-body"><span class="tag">{c["n_mod"]} módulos · {c["n_les"]} lecciones</span>'
            f'<h3><a href="{href}">{e(c["title"])}</a></h3><p>{e(c["short"] or "")}</p><ul>{lis}</ul>'
            f'<div class="guia-foot">{price_el(c["price_cop"], c["price_usd"], "b", "price big")}'
            f'<div class="guia-actions"><a class="btn btn-sm btn-ghost" href="{href}">Ver guía</a>'
            f'<button type="button" class="btn btn-sm" data-add="{e(c["slug"])}" data-label="Agregar"><span class="lbl">Agregar</span></button></div></div></div></article>')


def pack_html(b, by_slug):
    cop = usd = 0
    icons = ""
    for sl in b["slugs"]:
        c = by_slug.get(sl)
        if c:
            cop += float(c["price_cop"])
            usd += float(c["price_usd"])
        icons += f'<span class="cat-ico mini">{course_icon(sl)}</span>'
    save_cop = max(0, cop - float(b["price_cop"]))
    save_usd = max(0, usd - float(b["price_usd"]))
    out = f'<article class="pack{" featured" if b["featured"] else ""}">'
    out += '<span class="badge-top">MEJOR PRECIO</span>' if b["featured"] else ""
    out += f'<div class="pack-ico">{icons}</div><h3>{e(b["name"])}</h3><p class="pack-desc">{e(b["description"] or "")}</p>'
    out += f'<div class="pack-price">{price_el(b["price_cop"], b["price_usd"], "b")}' + (price_el(cop, usd, "s") if cop > float(b["price_cop"]) else "") + "</div>"
    out += f'<p class="pack-save">Ahorras {price_el(save_cop, save_usd)}</p>' if save_cop > 0 else ""
    out += f'<button type="button" class="btn btn-block" data-add-pack="{e(",".join(b["slugs"]))}">Agregar al carrito</button></article>'
    return out


def course_title(c):
    return f'{c["title"]}: guía en PDF paso a paso | Taller Creativo'


def course_desc(c):
    return f'{(c.get("promise") or c.get("short") or "").strip()} {c["n_mod"]} módulos, {c["n_les"]} lecciones. Acceso inmediato y garantía de 7 días.'.strip()


def course_keywords(c):
    cat = (c.get("category") or c["title"]).lower()
    return f'{c["title"]}, guía de {cat} en PDF, curso de {cat} desde cero, aprender {cat} paso a paso, {cat} para principiantes, Taller Creativo'


def course_body(c, others):
    """Misma estructura que pinta js/catalog.js, para que Google lea el contenido sin JavaScript."""
    cover = cover_url(c)
    ul = lambda arr: "".join(f"<li>{e(x)}</li>" for x in (arr or []))
    mods = ""
    for i, m in enumerate(c["modules"]):
        lessons = "".join(f'<li><span class="les-name">{e(l["title"])}</span>' + (f'<span class="les-do"><b>Ejercicio:</b> {e(l["exercise"])}</span>' if l.get("exercise") else "") + "</li>" for l in m["lessons"])
        mods += (f'<details class="mod"{" open" if i == 0 else ""}><summary><span class="mod-num">{i + 1}</span><span class="mod-title">{e(m["title"])}</span>'
                 f'<span class="mod-count">{len(m["lessons"])} lecciones</span></summary><ul class="lessons">{lessons}</ul></details>')
    more = ""
    for o in others:
        oc = cover_url(o)
        top = f'<span class="more-top {"has-cover" if oc else e(o["grad"])}">' + (f'<img src="{e(oc)}" alt="Portada de la guía {e(o["title"])}">' if oc else course_icon(o["slug"])) + "</span>"
        more += f'<a class="more-card" href="/guias/{e(o["slug"])}">{top}<span class="more-body"><b>{e(o["title"])}</b>{price_el(o["price_cop"], o["price_usd"])}</span></a>'
    buy = f'<button type="button" class="btn btn-block" data-add="{e(c["slug"])}" data-label="Agregar al carrito"><span class="lbl">Agregar al carrito</span></button>'
    cover_html = f'<img src="{e(cover)}" alt="Portada de la guía {e(c["title"])}">' if cover else course_icon(c["slug"])
    out = ('<section class="chero"><div class="wrap chero-in"><div class="chero-copy">'
           f'<p class="crumbs"><a href="/">Inicio</a> › <a href="/#guias">Guías</a> › {e(c.get("category") or "Guía")}</p>'
           f'<span class="pill">Guía en PDF · {c["n_mod"]} módulos · {c["n_les"]} lecciones</span>'
           f'<h1>{e(c["title"])}</h1><p class="lead">{e(c.get("promise") or "")}</p>'
           + (f'<p class="who"><b>¿Para quién es?</b> {e(c["who"])}</p>' if c.get("who") else "")
           + '<ul class="ticks"><li>Paso a paso, sin experiencia previa</li><li>Ejercicio práctico al final de cada lección</li><li>Acceso inmediato tras el pago · Garantía de 7 días</li></ul></div>'
           f'<aside class="buybox"><div class="buybox-cover {"has-cover" if cover else e(c["grad"])}">{cover_html}</div>'
           '<div class="currency small" role="group" aria-label="Moneda"><button type="button" data-cur="cop" aria-pressed="true">COP Pesos</button><button type="button" data-cur="usd" aria-pressed="false">US$ Dólares</button></div>'
           f'<div class="buybox-price">{price_el(c["price_cop"], c["price_usd"], "b")}<span>Acceso de por vida</span></div>{buy}'
           '<p class="buybox-deal">Con 2 o más guías pagas menos por cada una. <a href="/#paquetes">Ver paquetes</a></p>'
           '<ul class="buybox-list"><li>Guía completa en PDF</li><li>Plantillas y ejercicios extra</li><li>Certificado digital</li><li>Garantía de 7 días</li></ul></aside></div></section>'
           '<section class="section"><div class="wrap two-col"><div>'
           + (f'<h2 class="left">Lo que aprenderás</h2><ul class="learn">{ul(c.get("learn"))}</ul>' if c.get("learn") else "")
           + f'<h2 class="left">Contenido de la guía</h2><p class="sub left">{c["n_mod"]} módulos · {c["n_les"]} lecciones, cada una con su ejercicio.</p><div class="mods">{mods}</div></div><div class="side">'
           + (f'<div class="side-card"><h3>Qué incluye</h3><ul class="checks-sm">{ul(c.get("extras"))}</ul></div>' if c.get("extras") else "")
           + (f'<div class="side-card"><h3>Para empezar necesitas</h3><ul class="checks-sm">{ul(c.get("kit"))}</ul><p class="mini">La guía te dice qué comprar según tu presupuesto. No necesitas experiencia previa.</p></div>' if c.get("kit") else "")
           + '<div class="side-card soft"><h3>Entrega</h3><p>Apenas se confirma el pago recibes acceso a la guía en PDF y a sus lecciones en tu zona de alumnos. Si hay videos, los ves ahí mismo.</p></div></div></div></section>'
           + read("garantia.html") + read("faq.html")
           + (f'<section class="section"><div class="wrap"><h2>También te puede interesar</h2><div class="more">{more}</div></div></section>' if others else "")
           + f'<div class="buybar"><div class="buybar-in"><div class="buybar-price"><small>{e(c["title"])}</small>{price_el(c["price_cop"], c["price_usd"], "b")}</div>'
           '<button type="button" class="btn" data-add="' + e(c["slug"]) + '" data-label="Agregar"><span class="lbl">Agregar</span></button></div></div>')
    return out


def ld_script(data, ident=""):
    idattr = f' id="{ident}"' if ident else ""
    return f'  <script type="application/ld+json"{idattr}>{json.dumps(data, ensure_ascii=False)}</script>\n'


def faq_pairs():
    src = read("faq.html")
    out = []
    for q, a in re.findall(r"<summary>(.*?)</summary>\s*<p>(.*?)</p>", src, re.S):
        out.append((html.unescape(re.sub(r"<[^>]+>", "", q)).strip(), html.unescape(re.sub(r"<[^>]+>", "", a)).strip()))
    return out


ORG = {"@type": "Organization", "@id": SITE + "/#org", "name": "Academia Taller Creativo", "url": SITE, "logo": SITE + "/img/logo-marca.png",
       "image": SITE + "/img/og-taller-creativo.jpg", "slogan": "Aprende, Crea, Emprende",
       "description": "Academia digital de guías en PDF para aprender dibujo, pintura, jabones y velas artesanales paso a paso y desde cero.",
       "contactPoint": {"@type": "ContactPoint", "contactType": "customer service", "telephone": "+" + WA, "availableLanguage": "Spanish",
                        "areaServed": ["CO", "LATAM"]}}


def course_ld(c, others_unused=None):
    url = f"{SITE}/guias/{c['slug']}"
    img = cover_url(c) or SITE + "/img/og-taller-creativo.jpg"
    offer = {"@type": "Offer", "url": url, "priceCurrency": "COP", "price": str(round(float(c["price_cop"]))), "availability": "https://schema.org/InStock",
             "category": "Paid", "seller": {"@id": SITE + "/#org"}}
    return {"@context": "https://schema.org", "@graph": [
        ORG,
        {"@type": "Course", "@id": url + "#course", "name": c["title"], "description": c.get("promise") or c.get("short") or "", "url": url, "image": img,
         "inLanguage": "es", "educationalLevel": "Principiante", "courseMode": "online", "isAccessibleForFree": False,
         "provider": {"@id": SITE + "/#org"}, "teaches": c.get("learn") or [], "numberOfCredits": None, "offers": offer},
        {"@type": "Product", "@id": url + "#product", "name": f'{c["title"]} (guía en PDF)', "description": c.get("promise") or c.get("short") or "", "image": img,
         "brand": {"@type": "Brand", "name": "Academia Taller Creativo"}, "category": c.get("category") or "Guías en PDF", "offers": offer},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Inicio", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Guías", "item": SITE + "/#guias"},
            {"@type": "ListItem", "position": 3, "name": c["title"], "item": url}]}]}


def build_course_pages():
    """guias/<curso>.html: una página fija por curso publicado (contenido, etiquetas y datos estructurados ya escritos)."""
    cat = fetch_catalog()
    if not cat["ok"]:
        return
    gdir = os.path.join(ROOT, "guias")
    os.makedirs(gdir, exist_ok=True)
    keep = set()
    for c in cat["courses"]:
        others = [o for o in cat["courses"] if o["slug"] != c["slug"]]
        data = course_ld(c)
        for node in data["@graph"]:
            if "numberOfCredits" in node and node["numberOfCredits"] is None:
                del node["numberOfCredits"]
        cover = cover_url(c)
        img = cover or None
        body = f"""{head(course_title(c), course_desc(c), "/guias/" + c["slug"], ld_script(data, "ld-course"), img, course_keywords(c))}
{header(False)}
<main id="course-root">{course_body(c, others)}</main>
<template id="course-static">
{read('garantia.html')}
{read('faq.html')}
</template>
{CART}{footer()}"""
        write(f"guias/{c['slug']}.html", body)
        keep.add(c["slug"] + ".html")
    for f in os.listdir(gdir):
        if f.endswith(".html") and f not in keep:
            os.remove(os.path.join(gdir, f))


# ---------------------------------------------------------------- portada ---
def build_index():
    cat = fetch_catalog()
    cards = '\n        <p class="note" id="guias-loading">Cargando las guías…</p><noscript><p class="note">Activa JavaScript para ver el catálogo de guías.</p></noscript>'
    packs = ""
    min_cop = 24000
    ld_graph = [ORG, {"@type": "WebSite", "@id": SITE + "/#web", "url": SITE, "name": "Academia Taller Creativo", "inLanguage": "es", "publisher": {"@id": SITE + "/#org"}}]
    if cat["ok"]:
        by_slug = {c["slug"]: c for c in cat["courses"]}
        cards = "\n        " + "\n        ".join(card_html(c) for c in cat["courses"])
        packs = "\n        " + "\n        ".join(pack_html(b, by_slug) for b in cat["bundles"])
        min_cop = min(float(c["price_cop"]) for c in cat["courses"])
        ld_graph.append({"@type": "ItemList", "name": "Guías de la Academia Taller Creativo", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": f"{SITE}/guias/{c['slug']}", "name": c["title"]} for i, c in enumerate(cat["courses"])]})
    faq = faq_pairs()
    if faq:
        ld_graph.append({"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]})
    desc = f"Aprende dibujo, pintura, jabones y velas artesanales desde cero con guías en PDF paso a paso. Desde {money(min_cop, 'cop')}, acceso inmediato y garantía de 7 días."
    kws = ("guías de dibujo, guías de pintura, jabones artesanales, velas artesanales, curso de dibujo desde cero, aprender a pintar, "
           "cómo hacer jabones, cómo hacer velas, guías en PDF, academia online, manualidades, emprender con manualidades, Taller Creativo")
    body = f"""{head("Guías de dibujo, pintura, jabones y velas | Taller Creativo", desc, "/", ld_script({"@context": "https://schema.org", "@graph": ld_graph}), None, kws)}
{header(True)}
<main id="inicio">

{read('hero.html')}
{read('medida.html')}
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
      <div class="guias" id="guias-grid">{cards}
      </div>
      <h3 class="chips-title">Cada guía incluye</h3>
      <div class="bonus-strip">
        <span>Guía de materiales</span><span>Ejercicios extra por módulo</span><span>Plantillas de trabajo imprimibles</span>
        <span>Guía de costos y precio de venta</span><span>Banco de referencias</span><span>Certificado digital</span>
      </div>
      <p class="note">Las guías se entregan en PDF y, cuando una lección tiene video, lo ves en tu zona de alumnos. Los videos nuevos de una guía que ya compraste son sin costo extra.</p>
    </div>
  </section>

  <!-- PAQUETES -->
  <section class="section alt" id="paquetes">
    <div class="wrap">
      <h2>Paquetes con descuento</h2>
      <p class="sub">Llévate más guías y paga menos por cada una. También puedes armar tu propio paquete: agrega al carrito las guías que quieras.</p>
      <div class="packs" id="packs-grid">{packs}
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
      <a class="btn btn-light" href="#guias">Ver las guías</a>{' <a class="btn btn-light" href="/entrar?registro=1">Únete gratis</a>' if SHOW_JOIN else ''}
      <p class="cta-wa"><a href="#" data-wa="Hola, quiero información de la Academia Taller Creativo">¿Dudas? Escríbenos por WhatsApp</a></p>
    </div>
  </section>
</main>
{CART}{footer()}"""
    write("index.html", body)


# ------------------------------------------------------------ página guía ---
def build_guia_template():
    """guia.html: plantilla única de todos los cursos (/guias/<curso>). js/catalog.js la llena con lo publicado."""
    title = "Guía en PDF · Academia Taller Creativo"
    desc = "Guía digital en PDF, paso a paso y desde cero. Acceso inmediato y garantía de 7 días."
    body = f"""{head(title, desc, "/guias", "")}
{header(False)}
<main id="course-root"><section class="section"><div class="wrap"><p class="note">Cargando la guía…</p></div></section></main>
<template id="course-static">
{read('garantia.html')}
{read('faq.html')}
</template>
{CART}{footer()}"""
    write("guia.html", body)


# ----------------------------------------------------------- zona alumnos ---
def zona_page(rel, path, title, page, main):
    """Página de la zona de alumnos: sin indexar, con los scripts de Supabase y de la zona."""
    h = head(title, "Zona de alumnos de Academia Taller Creativo", path, '  <meta name="robots" content="noindex,nofollow">\n')
    h = h.replace("<body>", f'<body data-page="{page}">', 1)
    scripts = '<script src="/js/supabase.js"></script>\n<script src="/js/icons.js"></script>\n<script src="/js/zona.js"></script>\n' + ('<script src="/js/admin.js"></script>\n' if page == "admin" else "")
    foot = footer().replace("</body>", scripts + "</body>")
    write(rel, f"{h}{header(False)}\n{main}\n{CART}{foot}")


def build_zona():
    zona_page("entrar.html", "/entrar", "Entrar · Zona de alumnos · Academia Taller Creativo", "entrar", """<main class="zona">
  <div class="wrap zona-narrow">
    <div class="auth-card">
      <h1 id="auth-title">Entra a tu zona de alumnos</h1>
      <p class="lead-sm" id="auth-lead">Escribe tu correo. Te enviamos un código de 6 dígitos y entras sin contraseña.</p>
      <form id="form-email" novalidate>
        <label for="email">Tu correo</label>
        <input id="email" type="email" autocomplete="email" inputmode="email" placeholder="tucorreo@ejemplo.com" required>
        <button class="btn btn-block" type="submit">Enviarme el código</button>
      </form>
      <form id="form-code" hidden novalidate>
        <p class="sent">Te enviamos un código a <b id="sent-to"></b>. Si no llega en un minuto, revisa la carpeta de spam.</p>
        <label for="code">Código de 6 dígitos</label>
        <input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456">
        <button class="btn btn-block" type="submit">Entrar</button>
        <p class="links"><button type="button" id="resend" class="linkbtn" disabled>Reenviar código</button> · <button type="button" id="change-email" class="linkbtn">Cambiar correo</button></p>
      </form>
      <p class="msg" id="msg" role="alert" hidden></p>
      <p class="foot-note" id="auth-switch"></p>
      <p class="foot-note">¿Ya pagaste y no ves tus guías? <a href="#" data-wa="Hola, ya pagué y necesito acceso a mis guías. Mi correo es:">Escríbenos</a>.</p>
    </div>
  </div>
</main>""")
    zona_page("mis-cursos.html", "/mis-cursos", "Mis cursos · Academia Taller Creativo", "mis-cursos", """<main class="zona">
  <div class="wrap">
    <div class="zona-head dm-head">
      <div><h1>Mis cursos</h1><p class="muted" id="who"></p></div>
      <div class="zona-actions">
        <label class="dm-filter"><span class="sr">Filtrar mis cursos</span>
          <select id="course-filter">
            <option value="todos">Todos mis cursos</option>
            <option value="en-curso">En curso</option>
            <option value="sin-empezar">Sin empezar</option>
            <option value="completados">Completados</option>
          </select>
        </label>
        <a id="admin-link" class="btn btn-sm btn-ghost" href="/admin" hidden>Administrar alumnos</a>
        <button id="logout" class="btn btn-sm btn-ghost" type="button">Salir</button>
      </div>
    </div>
    <p class="msg" id="msg" role="alert" hidden></p>
    <p id="loading" class="muted">Cargando tus guías…</p>
    <div id="courses" class="mycourses"></div>
    <div id="empty" class="empty" hidden>
      <h2>¡Te damos la bienvenida! Tu cuenta ya está lista</h2>
      <p>Cuando compres una guía, aparecerá aquí con el correo que usaste para entrar. Mientras tanto, mira las guías disponibles. Si ya pagaste y no la ves, escríbenos con tu comprobante.</p>
      <p><a class="btn" href="/#guias">Ver las guías</a> <a class="btn btn-ghost" href="#" data-wa="Hola, ya pagué y no veo mi guía en Mis cursos. Mi correo es:">Escribirnos por WhatsApp</a></p>
    </div>
  </div>
</main>""")
    zona_page("curso.html", "/curso", "Mi curso · Academia Taller Creativo", "curso", """<main class="zona">
  <div class="wrap">
    <div class="zona-head">
      <p class="crumbs"><a href="/mis-cursos">Mis cursos</a> › <span id="crumb">Guía</span></p>
      <div class="zona-actions"><button id="logout" class="btn btn-sm btn-ghost" type="button">Salir</button></div>
    </div>
    <p class="msg" id="msg" role="alert" hidden></p>
    <p id="loading" class="muted">Cargando tu guía…</p>
    <div id="denied" class="empty" hidden>
      <h2>No encontramos esta guía en tu cuenta</h2>
      <p>Entra con el correo con el que la compraste. Si ya pagaste, escríbenos y la activamos.</p>
      <p><a class="btn" href="/mis-cursos">Ir a Mis cursos</a> <a class="btn btn-ghost" href="#" data-wa="Hola, ya pagué y no puedo abrir mi guía. Mi correo es:">Escribirnos por WhatsApp</a></p>
    </div>
    <div id="reader" hidden>
      <div class="reader-head">
        <div id="c-cover" class="mc-cover"></div>
        <div class="reader-info">
          <h1 id="c-title"></h1>
          <p class="muted" id="c-count"></p>
          <div class="bar" id="c-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="bar-fill"></span></div>
          <div class="mc-actions">
            <button id="c-resume" class="btn btn-sm" type="button">Seguir donde voy</button>
            <button id="c-pdf-open" class="btn btn-sm btn-ghost" type="button">Leer el PDF</button>
            <button id="c-pdf-dl" class="btn btn-sm btn-ghost" type="button">Descargar PDF</button>
          </div>
        </div>
      </div>
      <p id="c-done" class="done-banner" hidden>¡Completaste esta guía! Muy pronto vas a poder descargar tu certificado digital aquí mismo.</p>
      <h2 class="left">Lecciones y ejercicios</h2>
      <p class="muted">Lee la guía en PDF, haz el ejercicio de cada lección y márcala como hecha para ver tu avance.</p>
      <div class="mods" id="modules"></div>
    </div>
  </div>
</main>""")
    zona_page("admin.html", "/admin", "Panel de administración · Academia Taller Creativo", "admin", """<main class="zona">
  <div class="wrap">
    <div class="zona-head">
      <div><p class="crumbs">Academia Taller Creativo</p><h1>Panel de administración</h1></div>
      <div class="zona-actions"><a class="btn btn-sm btn-ghost" href="/mis-cursos">Mis cursos</a><button id="logout" class="btn btn-sm btn-ghost" type="button">Salir</button></div>
    </div>
    <p class="msg" id="msg" role="alert" hidden></p>
    <p id="loading" class="muted">Cargando…</p>
    <div id="denied" class="empty" hidden><h2>No tienes permiso para esta página</h2><p>Solo la administración de la Academia puede entrar aquí.</p></div>
    <div id="admin" hidden>
      <nav class="tabs" role="tablist" aria-label="Secciones del panel">
        <button type="button" role="tab" class="tab on" data-tab="cursos" aria-selected="true">Cursos</button>
        <button type="button" role="tab" class="tab" data-tab="precios" aria-selected="false">Precios y paquetes</button>
        <button type="button" role="tab" class="tab" data-tab="alumnos" aria-selected="false">Alumnos y accesos</button>
      </nav>
      <section id="tab-cursos"><div id="course-list"></div><div id="course-editor" hidden></div></section>
      <section id="tab-precios" hidden></section>
      <section id="tab-alumnos" hidden></section>
    </div>
  </div>
</main>""")


def published_slugs():
    """Cursos publicados, leídos de la base de datos (lectura pública). Si no responde, se usan los 4 de la semilla."""
    import urllib.request
    try:
        env = open(os.path.join(ROOT, "js", "catalog.js"), encoding="utf-8").read()
        url = re.search(r'URL_BASE = "([^"]+)"', env).group(1)
        key = re.search(r'ANON = "([^"]+)"', env).group(1)
        req = urllib.request.Request(url + "/rest/v1/courses?select=slug&status=eq.publicado&order=sort_order.asc", headers={"apikey": key, "Authorization": "Bearer " + key})
        return [r["slug"] for r in json.loads(urllib.request.urlopen(req, timeout=15).read())]
    except Exception:
        return [c["slug"] for c in COURSES]


def build_seo():
    cat = fetch_catalog()
    if cat["ok"]:
        items = [("/", max(c["updated_at"][:10] for c in cat["courses"]))] + [(f"/guias/{c['slug']}", c["updated_at"][:10]) for c in cat["courses"]]
    else:
        items = [("/", None)] + [(f"/guias/{x}", None) for x in published_slugs()]
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for u, d in items:
        sm += f"  <url><loc>{SITE}{u}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>\n"
    sm += "</urlset>\n"
    write("sitemap.xml", sm)
    write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /entrar\nDisallow: /mis-cursos\nDisallow: /curso\nDisallow: /admin\nSitemap: {SITE}/sitemap.xml\n")


if __name__ == "__main__":
    build_index()
    build_guia_template()
    build_course_pages()
    build_zona()
    build_seo()
    print("OK: index.html, guia.html, zona de alumnos, sitemap")
