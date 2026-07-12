# WEBGIS GEO — Motor Hídrico Linear v1

## Funcionalidades

Para cada base ativa da categoria `hidrografia`, família `cursos_dagua` e geometria `linha`:

- cria uma área de busca em torno da AOI;
- identifica cursos que intersectam a AOI ou estão próximos;
- aplica buffer preliminar de 30 m;
- recorta a APP pela AOI;
- diferencia interseção direta e APP por proximidade;
- calcula a APP consolidada dentro da AOI;
- mostra resultado individual por base no Dashboard e no Relatório.

## Parâmetros do catálogo

- `faixaPadrao`
- `distanciaBusca`
- `geometriaHidrica`
- `tipoRecurso`

## Limitação técnica

A faixa de 30 m é preliminar. O enquadramento definitivo depende da largura do leito regular, do regime do curso e da validação técnica.
