# WEBGIS GEO — ANM Inteligente v1

Esta versão adiciona um analisador específico para os processos minerários da ANM.

## Regras condicionais

Os recursos especiais da ANM somente aparecem quando:

1. a base está ligada nas Configurações;
2. o catálogo possui `"papel": "anm"`;
3. o catálogo possui `"analiseEspecial": true`;
4. o cartão usa `"dashboard": true`;
5. o relatório especial usa `"relatorioEspecial": true`.

## Informações exibidas

- DSProcesso;
- AREA_HA;
- FASE;
- NOME;
- SUBS;
- área de sobreposição com a AOI;
- percentual da AOI.

## Publicação

Substitua integralmente os arquivos do repositório `webgis-app` pelo conteúdo deste pacote.
