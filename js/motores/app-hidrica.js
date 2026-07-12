
(function(){
  function bboxIntersects(a,b){
    return !(a[2]<b[0] || a[0]>b[2] || a[3]<b[1] || a[1]>b[3]);
  }

  function safeBooleanIntersects(a,b){
    try{return turf.booleanIntersects(a,b);}catch(error){return false;}
  }

  function safeBuffer(feature,distance){
    try{
      return turf.buffer(feature,distance,{units:'meters',steps:12});
    }catch(error){
      return null;
    }
  }

  function safeIntersection(a,b){
    try{return turf.intersect(a,b);}catch(error){return null;}
  }

  function safeUnion(features){
    if(!features.length) return null;
    let merged=features[0];
    for(let index=1;index<features.length;index++){
      try{
        merged=turf.union(merged,features[index])||merged;
      }catch(error){
        // Mantém a geometria já consolidada; a área individual continua disponível.
      }
    }
    return merged;
  }

  function propertyValue(properties,keys,fallback=''){
    for(const key of keys){
      if(!key) continue;
      const value=properties?.[key];
      if(value!==undefined&&value!==null&&String(value).trim()!==''){
        return value;
      }
    }
    return fallback;
  }

  function analyzeLinearHydrography(base,features,aoiArea){
    if(
      base.category!=='hidrografia' ||
      base.family!=='cursos_dagua' ||
      base.hydricGeometry!=='linha'
    ) return null;

    const bufferDistance=Number(base.defaultBuffer)||30;
    const searchDistance=Math.max(bufferDistance,Number(base.searchDistance)||150);
    const searchArea=safeBuffer(aoi,searchDistance);
    if(!searchArea) throw new Error('Não foi possível criar a área de busca hídrica.');

    const searchBbox=turf.bbox(searchArea);
    const fields=base.fieldMap||{};
    const records=[];
    const appFragments=[];
    const relevantFeatures=[];
    let directCount=0;
    let proximityCount=0;
    let candidateCount=0;

    for(const feature of features){
      const geometryType=feature?.geometry?.type||'';
      if(!geometryType.includes('LineString')) continue;

      let featureBbox;
      try{featureBbox=turf.bbox(feature);}catch(error){continue;}
      if(!bboxIntersects(searchBbox,featureBbox)) continue;
      if(!safeBooleanIntersects(searchArea,feature)) continue;
      candidateCount++;

      const appBuffer=safeBuffer(feature,bufferDistance);
      if(!appBuffer) continue;

      const appInsideAoi=safeIntersection(appBuffer,aoi);
      if(!appInsideAoi) continue;

      const appArea=areaHa(appInsideAoi);
      if(!Number.isFinite(appArea)||appArea<=0.0000001) continue;

      const direct=safeBooleanIntersects(aoi,feature);
      if(direct) directCount++;
      else proximityCount++;

      const properties=feature.properties||{};
      const name=String(propertyValue(properties,[
        fields.nome,base.nameField,'noriocomp','nooriginal','nome','NOME'
      ],'Curso d’água sem nome'));
      const type=String(propertyValue(properties,[
        fields.tipo,'nogenerico','tipo','TIPO'
      ],'Curso d’água'));
      const domain=String(propertyValue(properties,[
        fields.dominialidade,'dedominial'
      ],'Não informada'));

      records.push({
        nome:name,
        tipo:type,
        dominialidade:domain,
        intersecaoDireta:direct,
        situacao:direct?'INTERSEÇÃO DIRETA':'APP POR PROXIMIDADE',
        faixaMetros:bufferDistance,
        areaAppDentroAoi:appArea,
        percentualAoi:aoiArea>0?(appArea/aoiArea)*100:0
      });

      appFragments.push(appInsideAoi);
      relevantFeatures.push(feature);
    }

    records.sort((a,b)=>
      Number(b.intersecaoDireta)-Number(a.intersecaoDireta) ||
      b.areaAppDentroAoi-a.areaAppDentroAoi ||
      a.nome.localeCompare(b.nome,'pt-BR')
    );

    const consolidated=safeUnion(appFragments);
    const consolidatedArea=consolidated
      ? areaHa(consolidated)
      : appFragments.reduce((sum,feature)=>sum+areaHa(feature),0);

    return {
      tipo:'linha',
      bufferMetros:bufferDistance,
      distanciaBuscaMetros:searchDistance,
      candidatosNaBusca:candidateCount,
      cursosComAppNaAoi:records.length,
      intersecoesDiretas:directCount,
      somenteProximidade:proximityCount,
      areaAppConsolidadaHa:consolidatedArea,
      percentualAoi:aoiArea>0?(consolidatedArea/aoiArea)*100:0,
      registros:records,
      appGeometries:consolidated?[consolidated]:appFragments,
      resourceFeatures:relevantFeatures,
      observacao:'Faixa preliminar de 30 m adotada para cursos d’água lineares. O enquadramento definitivo depende da confirmação da largura do leito regular e do regime do curso d’água.'
    };
  }

  WEBGIS_ANALYSIS.register({
    id:'app_hidrica',
    aliases:['recurso_hidrico'],
    analyze({base,features,aoiArea}){
      const hydric=analyzeLinearHydrography(base,features,aoiArea);
      return {hydricAnalysis:hydric};
    },
    dashboard({result}){
      const hydric=result.hydricAnalysis;
      if(result.dashboardEnabled!==true||!hydric) return '';

      if(!hydric.cursosComAppNaAoi){
        return `
          <div><b>Nenhuma APP hídrica alcança a Área de Interesse.</b></div>
          <div>Busca realizada até ${fmt(hydric.distanciaBuscaMetros,0)} m ao redor da AOI.</div>`;
      }

      const situationText=hydric.somenteProximidade
        ? `${hydric.somenteProximidade} ocorrência(s) sem interseção direta, mas com APP alcançando a AOI.`
        : 'Não houve ocorrência apenas por proximidade.';

      return `
        <div><b>${hydric.cursosComAppNaAoi}</b> curso(s) d’água com APP incidente na AOI.</div>
        <div><b>Interseção direta:</b> ${hydric.intersecoesDiretas}</div>
        <div><b>Somente pela APP:</b> ${hydric.somenteProximidade}</div>
        <div><b>Faixa preliminar:</b> ${fmt(hydric.bufferMetros,0)} m</div>
        <div><b>APP consolidada dentro da AOI:</b> ${fmt(hydric.areaAppConsolidadaHa,4)} ha (${fmt(hydric.percentualAoi,2)}%)</div>
        <div class="small" style="margin-top:7px">${escapeHtml(situationText)}</div>`;
    },
    report({results}){
      const hydricResults=results.filter(result=>
        result.engineId==='app_hidrica' &&
        result.specialReportEnabled===true &&
        result.hydricAnalysis
      );
      if(!hydricResults.length) return '';

      return hydricResults.map(result=>{
        const hydric=result.hydricAnalysis;
        const rows=hydric.registros.map(record=>`
          <tr>
            <td>${escapeHtml(record.nome)}</td>
            <td>${escapeHtml(record.tipo)}</td>
            <td>${escapeHtml(record.dominialidade)}</td>
            <td>${escapeHtml(record.situacao)}</td>
            <td>${fmt(record.faixaMetros,0)} m</td>
            <td>${fmt(record.areaAppDentroAoi,4)} ha</td>
            <td>${fmt(record.percentualAoi,2)}%</td>
          </tr>`).join('');

        return `
          <h2>Recursos Hídricos — ${escapeHtml(result.base)}</h2>
          <p><b>Fonte:</b> ${escapeHtml(result.source||'Não informada')}</p>
          <p><b>Distância de busca:</b> ${fmt(hydric.distanciaBuscaMetros,0)} m ao redor da Área de Interesse.</p>
          <p><b>Faixa preliminar adotada:</b> ${fmt(hydric.bufferMetros,0)} m.</p>
          <p><b>Cursos com APP dentro da AOI:</b> ${hydric.cursosComAppNaAoi}.</p>
          <p><b>Interseções diretas:</b> ${hydric.intersecoesDiretas}. 
             <b>Ocorrências apenas por proximidade:</b> ${hydric.somenteProximidade}.</p>
          <p><b>Área consolidada de APP dentro da AOI:</b> ${fmt(hydric.areaAppConsolidadaHa,4)} ha 
             (${fmt(hydric.percentualAoi,2)}% da AOI).</p>
          ${rows?`
            <table>
              <thead>
                <tr>
                  <th>Curso d’água</th>
                  <th>Tipo</th>
                  <th>Dominialidade</th>
                  <th>Situação</th>
                  <th>Faixa</th>
                  <th>APP na AOI</th>
                  <th>% da AOI</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`:'<p>Não foi identificada APP hídrica incidente na Área de Interesse.</p>'}
          <div class="note"><b>Observação técnica:</b> ${escapeHtml(hydric.observacao)}</div>`;
      }).join('');
    }
  });
})();
