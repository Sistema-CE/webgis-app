
(function(){
  const safe={
    intersects:(a,b)=>{try{return turf.booleanIntersects(a,b);}catch(e){return false;}},
    buffer:(f,d)=>{try{return turf.buffer(f,d,{units:'meters',steps:12});}catch(e){return null;}},
    intersect:(a,b)=>{try{return turf.intersect(a,b);}catch(e){return null;}},
    difference:(a,b)=>{try{return turf.difference(a,b)||a;}catch(e){return a;}},
    union:(features)=>{
      if(!features.length) return null;
      let merged=features[0];
      for(let i=1;i<features.length;i++){
        try{merged=turf.union(merged,features[i])||merged;}catch(e){}
      }
      return merged;
    }
  };

  function bboxIntersects(a,b){
    return !(a[2]<b[0]||a[0]>b[2]||a[3]<b[1]||a[1]>b[3]);
  }

  function value(props,keys,fallback=''){
    for(const key of keys){
      if(!key) continue;
      const current=props?.[key];
      if(current!==undefined&&current!==null&&String(current).trim()!=='') return current;
    }
    return fallback;
  }

  function numberValue(props,keys,fallback=0){
    const number=Number(String(value(props,keys,fallback)).replace(',','.'));
    return Number.isFinite(number)?number:fallback;
  }

  function waterName(props,base){
    const fields=base.fieldMap||{};
    const original=String(value(props,[fields.nome,base.nameField,'nmoriginal'],'')).trim();
    if(original) return original;
    const alternative=String(value(props,[fields.nomeAlternativo,'nmalternat'],'')).trim();
    if(alternative) return alternative;
    const composed=[
      value(props,[fields.tipo,'nmgenerico'],''),
      value(props,[fields.ligacao,'nmligacao'],''),
      value(props,[fields.especifico,'nmespecifi'],'')
    ].map(item=>String(item).trim()).filter(Boolean).join(' ').replace(/\s+/g,' ');
    return composed||'Massa d’água sem nome';
  }

  function territorialMasks(){
    const context=window.WEBGIS?.getTerritorialContext?.();
    const urban=[];
    const rural=[];
    (context?.geometrias||[]).forEach(item=>{
      const situation=String(item.situacao||'').toLowerCase();
      if(!item.feature) return;
      if(situation.includes('urbana')) urban.push(item.feature);
      else if(situation.includes('rural')) rural.push(item.feature);
    });
    return {context,urban:safe.union(urban),rural:safe.union(rural)};
  }

  function analyzeLines(base,features,aoiArea){
    if(base.category!=='hidrografia'||base.family!=='cursos_dagua'||base.hydricGeometry!=='linha') return null;

    const distance=Number(base.defaultBuffer)||30;
    const searchDistance=Math.max(distance,Number(base.searchDistance)||150);
    const searchArea=safe.buffer(aoi,searchDistance);
    const searchBbox=turf.bbox(searchArea);
    const fields=base.fieldMap||{};
    const records=[],fragments=[],resourceFeatures=[];
    let direct=0,proximity=0;

    for(const feature of features){
      if(!String(feature?.geometry?.type||'').includes('LineString')) continue;
      let bbox; try{bbox=turf.bbox(feature);}catch(e){continue;}
      if(!bboxIntersects(searchBbox,bbox)||!safe.intersects(searchArea,feature)) continue;

      const app=safe.intersect(safe.buffer(feature,distance),aoi);
      if(!app) continue;
      const area=areaHa(app);
      if(!Number.isFinite(area)||area<=1e-7) continue;

      const isDirect=safe.intersects(aoi,feature);
      if(isDirect) direct++; else proximity++;
      const props=feature.properties||{};
      records.push({
        nome:String(value(props,[fields.nome,base.nameField,'noriocomp','nooriginal'],'Curso d’água sem nome')),
        tipo:String(value(props,[fields.tipo,'nogenerico'],'Curso d’água')),
        dominialidade:String(value(props,[fields.dominialidade,'dedominial'],'Não informada')),
        situacao:isDirect?'INTERSEÇÃO DIRETA':'FAIXA POR PROXIMIDADE',
        faixaMetros:distance,
        areaDentroAoi:area,
        percentualAoi:aoiArea>0?(area/aoiArea)*100:0
      });
      fragments.push(app);
      resourceFeatures.push(feature);
    }

    const consolidated=safe.union(fragments);
    const consolidatedArea=consolidated?areaHa(consolidated):fragments.reduce((s,f)=>s+areaHa(f),0);

    return {
      tipo:'linha',
      modoDelimitacao:base.delineationMode||'preliminar',
      quantidade:records.length,
      intersecoesDiretas:direct,
      somenteProximidade:proximity,
      distanciaBuscaMetros:searchDistance,
      faixaMetros:distance,
      areaProtecaoConsolidadaHa:consolidatedArea,
      percentualAoi:aoiArea>0?(consolidatedArea/aoiArea)*100:0,
      registros:records,
      appGeometries:consolidated?[consolidated]:fragments,
      resourceFeatures,
      observacao:'Faixa preliminar de 30 m para apoio à triagem. O enquadramento definitivo depende da largura do leito regular, do regime do curso e da validação técnica.'
    };
  }

  function analyzeMasses(base,features,aoiArea){
    if(base.category!=='hidrografia'||base.family!=='massas_dagua'||base.hydricGeometry!=='poligono') return null;

    const urbanDistance=Number(base.urbanBuffer)||30;
    const ruralUpTo20=Number(base.ruralBufferUpTo20)||50;
    const ruralAbove20=Number(base.ruralBufferAbove20)||100;
    const searchDistance=Math.max(urbanDistance,ruralUpTo20,ruralAbove20,Number(base.searchDistance)||150);
    const searchArea=safe.buffer(aoi,searchDistance);
    const searchBbox=turf.bbox(searchArea);
    const masks=territorialMasks();
    const fields=base.fieldMap||{};
    const records=[],fragments=[],resourceFeatures=[];
    let direct=0,proximity=0;

    for(const feature of features){
      if(!String(feature?.geometry?.type||'').includes('Polygon')) continue;
      let bbox; try{bbox=turf.bbox(feature);}catch(e){continue;}
      if(!bboxIntersects(searchBbox,bbox)||!safe.intersects(searchArea,feature)) continue;

      const props=feature.properties||{};
      const massArea=numberValue(props,[fields.area,'area_calculada_ha','nuareaha'],turf.area(feature)/10000);
      const ruralDistance=massArea<=20?ruralUpTo20:ruralAbove20;

      const urbanRing=safe.difference(safe.buffer(feature,urbanDistance),feature);
      const ruralRing=safe.difference(safe.buffer(feature,ruralDistance),feature);
      let urbanPart=null,ruralPart=null,territorialClass='';

      if(masks.urban||masks.rural){
        if(masks.urban) urbanPart=safe.intersect(safe.intersect(urbanRing,masks.urban),aoi);
        if(masks.rural) ruralPart=safe.intersect(safe.intersect(ruralRing,masks.rural),aoi);
        territorialClass=urbanPart&&ruralPart?'MISTA':urbanPart?'URBANA':ruralPart?'RURAL':'';
      }else{
        const predominant=String(masks.context?.situacaoPredominante||'').toLowerCase();
        if(predominant.includes('urbana')){
          urbanPart=safe.intersect(urbanRing,aoi);
          territorialClass='URBANA — predominante';
        }else{
          ruralPart=safe.intersect(ruralRing,aoi);
          territorialClass=predominant.includes('rural')?'RURAL — predominante':'RURAL — fallback conservador';
        }
      }

      const parts=[urbanPart,ruralPart].filter(Boolean);
      if(!parts.length) continue;
      const protection=safe.union(parts);
      if(!protection) continue;
      const protectionArea=areaHa(protection);
      if(!Number.isFinite(protectionArea)||protectionArea<=1e-7) continue;

      const isDirect=safe.intersects(aoi,feature);
      if(isDirect) direct++; else proximity++;

      records.push({
        nome:waterName(props,base),
        tipo:String(value(props,[fields.tipo,'nmgenerico','detipomda'],'Massa d’água')),
        natureza:String(value(props,[fields.natureza,'detipomass'],'Não informada')),
        municipio:String(value(props,[fields.municipio,'nmmun'],'Não informado')),
        dominialidade:String(value(props,[fields.dominialidade,'dedominial'],'Não informada')),
        areaMassaHa:massArea,
        classificacaoTerritorial:territorialClass,
        faixaUrbanaMetros:urbanPart?urbanDistance:0,
        faixaRuralMetros:ruralPart?ruralDistance:0,
        situacao:isDirect?'INTERSEÇÃO DIRETA':'FAIXA POR PROXIMIDADE',
        areaDentroAoi:protectionArea,
        percentualAoi:aoiArea>0?(protectionArea/aoiArea)*100:0
      });
      fragments.push(protection);
      resourceFeatures.push(feature);
    }

    records.sort((a,b)=>b.areaDentroAoi-a.areaDentroAoi||a.nome.localeCompare(b.nome,'pt-BR'));
    const consolidated=safe.union(fragments);
    const consolidatedArea=consolidated?areaHa(consolidated):fragments.reduce((s,f)=>s+areaHa(f),0);

    return {
      tipo:'poligono',
      modoDelimitacao:base.delineationMode||'preliminar',
      quantidade:records.length,
      intersecoesDiretas:direct,
      somenteProximidade:proximity,
      distanciaBuscaMetros:searchDistance,
      faixaUrbanaMetros:urbanDistance,
      faixaRuralAte20Metros:ruralUpTo20,
      faixaRuralAcima20Metros:ruralAbove20,
      areaProtecaoConsolidadaHa:consolidatedArea,
      percentualAoi:aoiArea>0?(consolidatedArea/aoiArea)*100:0,
      registros:records,
      appGeometries:consolidated?[consolidated]:fragments,
      resourceFeatures,
      observacao:'Faixa preliminar aplicada a todas as massas d’água da base, naturais ou artificiais. O enquadramento jurídico e ambiental definitivo deverá ser validado pelo técnico responsável, considerando origem, barramento, licenciamento e características locais.'
    };
  }

  WEBGIS_ANALYSIS.register({
    id:'app_hidrica',
    aliases:['recurso_hidrico'],
    analyze({base,features,aoiArea}){
      return {hydricAnalysis:analyzeLines(base,features,aoiArea)||analyzeMasses(base,features,aoiArea)};
    },
    dashboard({result}){
      const h=result.hydricAnalysis;
      if(result.dashboardEnabled!==true||!h) return '';
      if(!h.quantidade) return `<div><b>Nenhuma faixa hídrica alcança a Área de Interesse.</b></div>`;
      let rules='';
      if(h.tipo==='poligono'){
        const applied=new Map();

        (h.registros||[]).forEach(record=>{
          if(record.faixaUrbanaMetros>0){
            const key=`Urbana — ${fmt(record.faixaUrbanaMetros,0)} m`;
            applied.set(key,(applied.get(key)||0)+1);
          }

          if(record.faixaRuralMetros>0){
            const className=record.areaMassaHa<=20
              ? 'Rural — massa até 20 ha'
              : 'Rural — massa acima de 20 ha';
            const key=`${className} — ${fmt(record.faixaRuralMetros,0)} m`;
            applied.set(key,(applied.get(key)||0)+1);
          }
        });

        const appliedItems=[...applied.entries()];
        if(appliedItems.length===1){
          rules=`<div class="hydric-applied-rule"><b>Faixa aplicada:</b><br>${escapeHtml(appliedItems[0][0])}</div>`;
        }else if(appliedItems.length>1){
          rules=`
            <div class="hydric-applied-rule">
              <b>Faixas aplicadas:</b>
              <ul>${appliedItems.map(([label,count])=>
                `<li>${escapeHtml(label)}${count>1?` — ${count} ocorrências`:''}</li>`
              ).join('')}</ul>
            </div>`;
        }
      }else{
        rules=`<div class="hydric-applied-rule"><b>Faixa aplicada:</b><br>${fmt(h.faixaMetros,0)} m</div>`;
      }

      return `
        <div><b>Modo:</b> Faixa preliminar de proteção</div>
        <div><b>Ocorrências:</b> ${h.quantidade}</div>
        <div><b>Interseção direta:</b> ${h.intersecoesDiretas}</div>
        ${h.somenteProximidade?`<div><b>Somente pela faixa:</b> ${h.somenteProximidade}</div>`:''}
        ${rules}
        <div><b>Área consolidada:</b> ${fmt(h.areaProtecaoConsolidadaHa,4)} ha (${fmt(h.percentualAoi,2)}%)</div>`;
    },
    report({results}){
      return results.filter(r=>r.engineId==='app_hidrica'&&r.specialReportEnabled===true&&r.hydricAnalysis).map(result=>{
        const h=result.hydricAnalysis;
        if(h.tipo==='linha'){
          const rows=h.registros.map(r=>`<tr><td>${escapeHtml(r.nome)}</td><td>${escapeHtml(r.tipo)}</td><td>${escapeHtml(r.dominialidade)}</td><td>${escapeHtml(r.situacao)}</td><td>${fmt(r.faixaMetros,0)} m</td><td>${fmt(r.areaDentroAoi,4)} ha</td><td>${fmt(r.percentualAoi,2)}%</td></tr>`).join('');
          return `<h2>Recursos Hídricos — ${escapeHtml(result.base)}</h2><p><b>Modo:</b> Faixa preliminar de proteção.</p>${rows?`<table><thead><tr><th>Curso d’água</th><th>Tipo</th><th>Dominialidade</th><th>Situação</th><th>Faixa</th><th>Área na AOI</th><th>% da AOI</th></tr></thead><tbody>${rows}</tbody></table>`:'<p>Sem ocorrência.</p>'}<div class="note"><b>Ressalva:</b> ${escapeHtml(h.observacao)}</div>`;
        }

        const rows=h.registros.map(r=>`<tr><td>${escapeHtml(r.nome)}</td><td>${escapeHtml(r.tipo)}</td><td>${escapeHtml(r.natureza)}</td><td>${escapeHtml(r.municipio)}</td><td>${fmt(r.areaMassaHa,4)} ha</td><td>${escapeHtml(r.classificacaoTerritorial)}</td><td>${r.faixaUrbanaMetros?fmt(r.faixaUrbanaMetros,0)+' m':'-'}</td><td>${r.faixaRuralMetros?fmt(r.faixaRuralMetros,0)+' m':'-'}</td><td>${escapeHtml(r.situacao)}</td><td>${fmt(r.areaDentroAoi,4)} ha</td><td>${fmt(r.percentualAoi,2)}%</td></tr>`).join('');
        return `<h2>Massas d’Água — ${escapeHtml(result.base)}</h2>
          <p><b>Modo:</b> Faixa preliminar de proteção para apoio à análise técnica.</p>
          <p>Foram consideradas massas naturais e artificiais. Critérios: 30 m em área urbana; 50 m em área rural para massas de até 20 ha; 100 m em área rural para massas acima de 20 ha.</p>
          <p><b>Área consolidada dentro da AOI:</b> ${fmt(h.areaProtecaoConsolidadaHa,4)} ha (${fmt(h.percentualAoi,2)}%).</p>
          ${rows?`<table><thead><tr><th>Nome</th><th>Tipo</th><th>Natural/Artificial</th><th>Município</th><th>Área da massa</th><th>Classificação territorial</th><th>Faixa urbana</th><th>Faixa rural</th><th>Situação</th><th>Faixa na AOI</th><th>% da AOI</th></tr></thead><tbody>${rows}</tbody></table>`:'<p>Sem ocorrência.</p>'}
          <div class="note"><b>Ressalva técnica:</b> ${escapeHtml(h.observacao)}</div>`;
      }).join('');
    }
  });
})();
