
WEBGIS_ANALYSIS.register({
  id:'processo_minerario',
  aliases:['anm'],
  analyze({base,features,aoiArea}){
    return {
      anmProcesses:analyzeAnmProcesses(base,features,aoiArea)
    };
  },
  updateContext({result,context}){
    if(result.anmProcesses?.length){
      context.anm.push(...result.anmProcesses.map(item=>({...item,base:result.base})));
    }
  },
  dashboard({result}){
    if(
      result.dashboardEnabled!==true ||
      !result.anmProcesses?.length
    ) return '';

    const processList=result.anmProcesses.map(item=>`
      <div class="dashboard-anm-item">
        <div class="dashboard-anm-process">${escapeHtml(item.processo)}</div>
        <div><b>Titular:</b> ${escapeHtml(item.nome)}</div>
        <div><b>Fase:</b> ${escapeHtml(item.fase)}</div>
        <div><b>Substância:</b> ${escapeHtml(item.substancia)}</div>
        <div><b>Área do processo:</b> ${fmt(item.areaProcesso,2)} ha</div>
        <div><b>Sobreposição com a AOI:</b> ${fmt(item.areaSobreposta,4)} ha (${fmt(item.percentualAoi,2)}%)</div>
      </div>`).join('');

    return `
      <div><b>${result.anmProcesses.length}</b> processo(s) minerário(s) incidente(s) na Área de Interesse.</div>
      <div class="dashboard-anm-list">${processList}</div>`;
  },
  report(){
    return typeof buildAnmReportSection==='function'
      ? buildAnmReportSection()
      : '';
  }
});
