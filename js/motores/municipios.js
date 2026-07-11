
WEBGIS_ANALYSIS.register({
  id:'municipio',
  aliases:['municipios'],
  analyze({base,features,aoiArea}){
    return {
      municipalityBreakdown:analyzeMunicipalityBreakdown(base,features,aoiArea)
    };
  },
  updateContext({result,context}){
    if(result.municipalityBreakdown?.length){
      context.municipios=result.municipalityBreakdown.map(item=>({...item}));
    }
  },
  dashboard({result}){
    if(!result.municipalityBreakdown?.length) return '';
    const list=result.municipalityBreakdown.map(item=>`
      <div class="dashboard-municipality-item">
        <span><b>${escapeHtml(item.nome)}</b></span>
        <span>${fmt(item.pct,2)}%</span>
      </div>`).join('');
    return `
      <div>A Área de Interesse está distribuída entre:</div>
      <div class="dashboard-municipality-list">${list}</div>`;
  },
  report(){
    return '';
  }
});
