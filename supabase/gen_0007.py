"""Genera supabase/migrations/0007_precio_normal_e_imagen_de_paquetes.sql.
Toma save_course() de la migración 0003 y le suma el precio normal (tachado) del curso."""
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(ROOT, "migrations", "0003_catalogo_en_base_de_datos.sql"), encoding="utf-8").read()
i = src.index("create or replace function save_course(p jsonb)")
j = src.index("$$;", i) + 3
fn = src[i:j]


def rep(a, b):
    global fn
    assert fn.count(a) == 1, a
    fn = fn.replace(a, b, 1)


rep("cover_path, price_cop, price_usd, status, sort_order)", "cover_path, price_cop, price_usd, list_price_cop, list_price_usd, status, sort_order)")
rep("coalesce((p ->> 'price_cop')::integer, 0), coalesce((p ->> 'price_usd')::numeric, 0),",
    "coalesce((p ->> 'price_cop')::integer, 0), coalesce((p ->> 'price_usd')::numeric, 0),\n    nullif(p ->> 'list_price_cop', '')::integer, nullif(p ->> 'list_price_usd', '')::numeric,")
rep("price_cop = excluded.price_cop, price_usd = excluded.price_usd,", "price_cop = excluded.price_cop, price_usd = excluded.price_usd,\n    list_price_cop = excluded.list_price_cop, list_price_usd = excluded.list_price_usd,")

sql = """-- Precio normal (tachado) de cada curso e imagen de cada paquete.
--   · courses.list_price_cop / list_price_usd: el precio «normal»; price_cop / price_usd pasan a ser el precio de promoción
--     que se cobra por un solo curso. Si el precio normal es nulo o no es mayor que el de venta, no se muestra tachado.
--   · bundles.image_path: imagen del paquete (bucket público «covers»), editable desde /admin → Precios y paquetes.
-- Los precios y descuentos concretos son datos del negocio y se editan en /admin; aquí solo va la estructura.

alter table courses add column if not exists list_price_cop integer check (list_price_cop is null or list_price_cop >= 0);
alter table courses add column if not exists list_price_usd numeric(8, 2) check (list_price_usd is null or list_price_usd >= 0);
alter table bundles add column if not exists image_path text;

""" + fn + """
"""
open(os.path.join(ROOT, "migrations", "0007_precio_normal_e_imagen_de_paquetes.sql"), "w", encoding="utf-8", newline="\n").write(sql)
print("ok", len(sql))
