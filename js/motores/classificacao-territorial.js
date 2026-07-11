
WEBGIS_ANALYSIS.register({
  id:'classificacao_territorial',
  aliases:['territorial'],
  analyze({base,features,aoiArea}){
    return {
      territorialClassification:analyzeTerritorialClassification(base,features,aoiArea)
    };
  },
  updateContext({result,context}){
    if(!result.territorialClassification) return;
    const territorial=result.territorialClassification;
    const urbano=territorial.distribution?.find(item=>item.classe==='Urbana')||{area:0,pct:0};
    const rural=territorial.distribution?.find(item=>item.classe==='Rural')||{area:0,pct:0};

    context.territorial={
      situacaoPredominante:territorial.dominant,
      percentualUrbano:urbano.pct||0,
      percentualRural:rural.pct||0,
      areaUrbanaHa:urbano.area||0,
      areaRuralHa:rural.area||0,
      municipios:[...(territorial.municipalities||[])],
      distritos:[...(territorial.districts||[])],
      bairros:[...(territorial.neighborhoods||[])],
      nucleosUrbanos:[...(territorial.urbanCores||[])],
      aglomerados:[...(territorial.settlements||[])],
      setores:[...(territorial.sectors||[])],
      populacaoTotal:territorial.population||0,
      domiciliosTotais:territorial.households||0,
      origem:result.base
    };
  },
  dashboard({result}){
    if(result.dashboardEnabled!==true||!result.territorialClassification) return '';
    const territorial=result.territorialClassification;
    const distribution=territorial.distribution.map(item=>`
      <div class="dashboard-municipality-item">
        <span><b>${escapeHtml(item.classe)}</b></span>
        <span>${fmt(item.pct,2)}%</span>
      </div>`).join('');
    return `
      <div><b>Classificação predominante:</b> ${escapeHtml(territorial.dominant)}</div>
      <div class="dashboard-municipality-list">${distribution}</div>
      <div style="margin-top:8px"><b>Setores atingidos:</b> ${territorial.sectors.length}</div>
      <div><b>Distritos:</b> ${escapeHtml(territorial.districts.join(', ')||'Não informado')}</div>
      <div><b>Bairros:</b> ${escapeHtml(territorial.neighborhoods.join(', ')||'Não informado')}</div>
      <div><b>População dos setores:</b> ${territorial.population.toLocaleString('pt-BR')}</div>
      <div><b>Domicílios dos setores:</b> ${territorial.households.toLocaleString('pt-BR')}</div>`;
  },
  report(){
    return typeof buildTerritorialReportSection==='function'
      ? buildTerritorialReportSection()
      : '';
  }
});
