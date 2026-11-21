# Academia Taller Creativo — sitio web

Sitio estático (Vercel). Los HTML se generan con `build.py`; después de cambiar textos, precios o guías:

```bash
python build.py
git add -A && git commit -m "..." && git push
```

- `build.py` — textos de cada guía (`COURSES`), precios mostrados (`P`) y plantillas. Genera `index.html`, `guias/*.html`, `sitemap.xml` y `robots.txt`.
- `src/` — bloques de la portada (hero, problema, garantía, preguntas).
- `app.js` — carrito, moneda y pagos. **Configuración al inicio del archivo (`CONFIG`)**:
  - `whatsapp`: número de WhatsApp.
  - `links`: enlace de pago por producto y pasarela (Gumroad en dólares, Hotmart y Wompi en pesos). Un enlace vacío oculta ese botón; "Pedir por WhatsApp" siempre aparece.
  - `prices`: precios por cantidad. Deben coincidir con los precios de `P` en `build.py`.

Productos (clave de enlace): `dibujo`, `pintura`, `jabones`, `velas`, `dibujo-pintura`, `jabones-velas`, `paquete-completo`.
Las demás combinaciones (por ejemplo Dibujo + Jabones o cualquier trío) se cobran por WhatsApp o, más adelante, con Wompi.

## Cursos en la base de datos, zona de alumnos y panel de administración (Supabase)

Los cursos ya no se escriben en el código: viven en Supabase y se manejan desde `/admin`.

- **Catálogo y páginas de cada curso** (`js/catalog.js`): la portada y `/guias/<curso>` (plantilla única `guia.html`) leen lo publicado, los descuentos por cantidad y los paquetes. El carrito (`app.js`) calcula los precios con esos datos. `vercel.json` (y `serve.json` para pruebas locales) mandan `/guias/:slug` a `guia.html`.
- **Páginas:** `/entrar` (código de 6 dígitos al correo; `?registro=1` = «Únete gratis»), `/mis-cursos`, `/curso?g=<curso>` (lecciones, avance, PDF y videos) y `/admin`.
- **Panel `/admin`** (`js/admin.js`): Cursos (crear/editar con portada, PDF, módulos, lecciones, ejercicios y videos; publicar u ocultar), Precios y paquetes (descuentos por cantidad y paquetes de precio fijo) y Alumnos y accesos (dar o quitar acceso por correo).
- **Base de datos:** proyecto `taller-creativo` (ref `kpseadjekdezqwjjflfg`, organización DAVINCI). Migraciones en `supabase/migrations/` (`gen_0003.py` genera la 0003 a partir de las 4 guías iniciales de `build.py`); Auth y plantilla del correo en `supabase/config.toml` (`supabase config push`).
- **Acceso por correo:** `enrollments(email, course_slug)`. Un administrador da acceso desde `/admin`; los avisos de pago (Wompi, Gumroad, Hotmart) solo necesitarán insertar el correo del comprador.
- **Archivos:** portadas en el bucket público `covers`; PDF en el privado `guides` (`<curso>.pdf`); videos en el privado `videos` (`<curso>/<lección>-….mp4`), con enlaces temporales y solo para quien tiene el curso.
- **Administradores:** tabla `academy_admins` (correos).
- **Claves:** la URL y la clave `anon` van en `js/zona.js` y `js/catalog.js` (son públicas). La clave de servicio y la contraseña de la base de datos solo están en `.env.local` (no se sube a git).
- **Botones «Únete gratis» / «Entrar» / «Mis cursos» del menú:** `SHOW_JOIN` en `build.py`. Actívalo cuando el correo con el código salga por un SMTP propio (el de fábrica de Supabase solo envía unos pocos correos por hora y solo a miembros de la organización).
- **SEO (búsquedas):** `python build.py` lee los cursos publicados de Supabase y deja escritos en el HTML las tarjetas y paquetes de la portada, una página fija por curso (`guias/<curso>.html`, con título, descripción, Open Graph, Twitter y datos estructurados Course/Product/BreadcrumbList) y, en la portada, Organization/WebSite/ItemList/FAQPage (las preguntas salen de `src/faq.html`). También genera `sitemap.xml` con `lastmod` y la imagen para compartir `img/og-taller-creativo.jpg`. Un curso recién publicado ya funciona sin reconstruir (plantilla `guia.html`); para que además quede como página fija, ejecuta `python build.py` y sube los cambios.
- **Botón «Actualizar sitio» (/admin → Cursos):** regenera las páginas fijas para buscadores sin tocar git. Funciona así: `request_site_rebuild()` (migración 0005, solo administradores, máximo una vez por minuto) llama por `pg_net` al **Deploy Hook** de Vercel, y Vercel ejecuta el `buildCommand` de `vercel.json` (`python3 build.py --strict`), que lee los cursos publicados de Supabase y reescribe `index.html`, `guias/*.html` y `sitemap.xml`. Con `--strict`, si no se puede leer la base, la construcción falla y lo publicado no cambia. El enlace del Deploy Hook es un secreto: se guarda una sola vez en la tabla `academy_settings` (clave `vercel_deploy_hook`) desde el SQL Editor de Supabase, nunca en el código:

  ```sql
  insert into academy_settings(key, value) values ('vercel_deploy_hook', 'PEGA_AQUI_EL_ENLACE')
  on conflict (key) do update set value = excluded.value, updated_at = now();
  ```
  Crear el enlace: Vercel → proyecto del sitio → Settings → Git → Deploy Hooks (nombre «admin», rama `main`).
