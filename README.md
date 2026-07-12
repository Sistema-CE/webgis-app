# WEBGIS GEO — Categorias e Famílias v1

Cada base agora possui `categoria` e `familia`.

API interna:
- `WEBGIS.getBasesCategoria("hidrografia")`
- `WEBGIS.getBasesFamilia("cursos_dagua")`
- `WEBGIS.getBasesCategoriaFamilia("hidrografia","cursos_dagua")`
- `WEBGIS.getBasesHidrografia()`
- `WEBGIS.getBasesHidrografia("cursos_dagua")`

Por padrão, retornam somente bases ligadas. Use `{onlyActive:false}` para retornar todas.
