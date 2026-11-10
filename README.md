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
