# WEBGIS GEO — Labels nos Mapas do Relatório v1

Esta versão adiciona rótulos diretamente nas imagens dos mapas individuais do relatório.

## Regras dos rótulos

- Municípios: usa `NM_MUN`;
- ANM: usa `DSProcesso`;
- Demais bases: usa o `campoNome` definido no catálogo, quando disponível.

Os labels são aplicados apenas às feições que efetivamente intersectam a Área de Interesse.

## Características

- fundo branco semitransparente;
- borda escura para melhorar a leitura;
- quebra automática de textos longos;
- tentativa de evitar sobreposição entre rótulos;
- limite de 50 rótulos por mapa para preservar legibilidade e desempenho.

## Publicação

Substitua integralmente os arquivos do repositório `webgis-app` pelo conteúdo deste pacote.
