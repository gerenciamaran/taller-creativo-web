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

## Zona de alumnos (Supabase)

Páginas: `/entrar` (código de 6 dígitos al correo), `/mis-cursos`, `/curso?g=<guía>` (lecciones, avance y PDF) y `/admin` (dar o quitar acceso). `build.py` las genera junto con `js/cursos.js`; la lógica está en `js/zona.js` y la librería de Supabase, en `js/supabase.js`.

- **Proyecto de Supabase:** `taller-creativo` (ref `kpseadjekdezqwjjflfg`, organización DAVINCI). Migraciones en `supabase/migrations/`; configuración de Auth (plantilla del correo con el código) en `supabase/config.toml` (`supabase config push`).
- **Acceso por correo:** tabla `enrollments(email, course_slug)`. Un administrador da acceso desde `/admin` (función `grant_access`); más adelante los avisos de pago (Wompi, Gumroad, Hotmart) solo necesitan insertar el correo del comprador.
- **PDF:** bucket privado `guides` (`dibujo.pdf`, `pintura.pdf`, `jabones.pdf`, `velas.pdf`), con enlaces temporales y solo para quien tiene la guía.
- **Administradores:** tabla `academy_admins` (correos).
- **Claves:** la URL y la clave `anon` van en `js/zona.js` (son públicas). La clave de servicio y la contraseña de la base de datos solo están en `.env.local` (no se sube a git).
- **Botón «Mis cursos» del menú:** `SHOW_ACCOUNT` en `build.py`. Actívalo cuando el correo con el código salga por un SMTP propio (el de Supabase de fábrica solo envía unos pocos correos por hora y solo a miembros de la organización).
