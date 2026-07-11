# WEBGIS GEO — Motores de Análise v1

## Nova arquitetura

A ferramenta agora possui motores independentes:

- `generico`
- `municipio`
- `classificacao_territorial`
- `processo_minerario`
- `app_hidrica` — reservado para a próxima etapa

## Contexto interno

A Classificação Territorial alimenta um contexto reutilizável:

```javascript
WEBGIS.getTerritorialContext()
WEBGIS.getMunicipios()
WEBGIS.getAnm()
WEBGIS.getAnalysisContext()
```

O contexto territorial contém:

- situação predominante;
- percentual e área urbana;
- percentual e área rural;
- municípios;
- distritos;
- bairros;
- núcleos urbanos;
- aglomerados;
- setores;
- população;
- domicílios.

## Organização

```text
js/motores/
├── registro.js
├── generico.js
├── municipios.js
├── classificacao-territorial.js
├── anm.js
└── app-hidrica.js
```

Dashboard e relatório consultam os motores registrados. Uma evolução futura poderá alterar apenas um motor sem modificar os demais.

## Publicação

Substitua integralmente os arquivos do repositório `webgis-app`.
