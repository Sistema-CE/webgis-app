# WEBGIS GEO — Estrutura modular (Etapa 14.2)

Esta versão divide o antigo `js/app.js` em arquivos funcionais, mantendo a mesma ordem e o mesmo comportamento da versão testada.

## Estrutura

- `index.html`
- `css/style.css`
- `js/config.js`
- `js/mapa.js`
- `js/dados-legados.js`
- `js/util.js`
- `js/catalogo.js`
- `js/interface.js`
- `js/fontes.js`
- `js/analise.js`
- `js/relatorio.js`
- `js/configuracoes.js`
- `js/pontos.js`
- `js/app.js` (arquivo de compatibilidade, não utilizado)

## Objetivo dos módulos

- **config.js**: URLs e chaves de armazenamento.
- **mapa.js**: estado global e inicialização do Leaflet.
- **dados-legados.js**: dado antigo ainda mantido sem alterar o funcionamento.
- **util.js**: funções auxiliares.
- **catalogo.js**: catálogo online, bases e visualização das camadas.
- **interface.js**: Área de Interesse e controles gerais.
- **fontes.js**: leitura de GeoJSON, WFS, ArcGIS REST, GeoPackage e outras fontes.
- **analise.js**: interseções e tabela de resultados.
- **relatorio.js**: mapas individuais, relatório e downloads.
- **configuracoes.js**: janela de configurações e catálogo.
- **pontos.js**: GPS e coordenadas UTM.

## Publicação

Envie o conteúdo desta pasta para a raiz do repositório `webgis-app`.


## Versão Municípios v1

- Reconhece bases com `papel: "municipios"` no catálogo online.
- Calcula a área da AOI dentro de cada município.
- Calcula o percentual da AOI em cada município.
- Usa `campoNome` (ex.: `NM_MUN`) para identificar o município.
- Mantém análise genérica para todas as demais bases.
