# WEBGIS GEO — Editor de Estilos das Bases v1

Esta versão adiciona ao menu Configurações um editor visual para as bases vetoriais.

## Opções disponíveis

- cor do contorno;
- espessura da linha;
- transparência do contorno;
- cor do preenchimento;
- transparência do preenchimento;
- ativar ou desativar o preenchimento;
- restaurar o estilo original definido no catálogo.

## Persistência

Os estilos personalizados são salvos no `localStorage` do navegador e continuam válidos quando o catálogo online é atualizado.

## Aplicação dos estilos

Os estilos são usados:

- na visualização das bases no mapa;
- nas imagens individuais geradas no relatório.

As áreas exatas de interseção continuam destacadas em vermelho para facilitar a leitura técnica.

## WMS

Em bases WMS, cores, espessuras e preenchimentos são controlados pelo servidor. A ferramenta mantém para essas bases somente o controle geral de transparência do painel de camadas.

## Publicação

Substitua integralmente os arquivos do repositório `webgis-app` pelo conteúdo deste pacote.
