-- Precios de la promoción de lanzamiento (datos del negocio; también se editan en /admin → Cursos y → Precios y paquetes).
--   Precio normal de cada curso: COP $60.000 (US$17), que se muestra tachado.
--   Promoción: 1 curso = $49.000 · 2 cursos = $39.000 cada uno · 3 cursos = $34.000 cada uno · los 4 = $29.000 cada uno.
-- Los descuentos por cantidad son un porcentaje sobre el precio de promoción ($49.000):
--   39.000 / 49.000 → 20,41 %  ·  34.000 / 49.000 → 30,61 %  ·  29.000 / 49.000 → 40,82 %  (con redondeo a $100 dan 78.000, 102.000 y 116.000).
update courses set price_cop = 49000, price_usd = 14, list_price_cop = 60000, list_price_usd = 17;
update pricing_tiers set percent_off = 20.41 where min_qty = 2;
update pricing_tiers set percent_off = 30.61 where min_qty = 3;
update pricing_tiers set percent_off = 40.82 where min_qty = 4;
update bundles set price_cop = 78000, price_usd = 22.5 where code in ('dibujo-pintura', 'jabones-velas');
update bundles set price_cop = 116000, price_usd = 33 where code = 'paquete-completo';
