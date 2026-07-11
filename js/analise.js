function featureLabel(feature,base){
  const properties=feature.properties||{};
  if(base.nameField&&properties[base.nameField]) return properties[base.nameField];
  const keys=['NM_MUN','nm_mun','nome','NOME','name','NAME','nome_uc','NM_UNIDADE','terrai_nom','denominacao','nom_cav','nome_rio','NOME_RIO','rio_nome','NOMEMASSA','nomemassa','nome_massa','NOME_MASSA','nm_massa','NM_MASSA','ds_nome','DS_NOME','waterway','natural','water','landuse'];
  for(const key of keys){
    if(properties[key]) return properties[key];
  }
  return 'Feição sem nome';
}

function checkIntersection(aoiFeature,feature){
  try{
    const geometryType=feature.geometry&&feature.geometry.type;
    if(!geometryType) return {hit:false,area:0,geom:null};

    if(geometryType.includes('Point')){
      const hit=geometryType==='Point'
        ? turf.booleanPointInPolygon(feature,aoiFeature)
        : feature.geometry.coordinates.some(coords=>turf.booleanPointInPolygon(turf.point(coords),aoiFeature));
      return {hit,area:0,geom:hit?feature:null};
    }

    if(geometryType.includes('Polygon')&&aoiFeature.geometry.type.includes('Polygon')){
      const intersection=turf.intersect(aoiFeature,feature);
      return {hit:!!intersection,area:intersection?areaHa(intersection):0,geom:intersection};
    }

    const hit=turf.booleanIntersects(aoiFeature,feature);
    return {hit,area:0,geom:hit?feature:null};
  }catch(error){
    return {hit:false,area:0,geom:null,error:error.message};
  }
}

function analyzeMunicipalityBreakdown(base,features,aoiArea){
  if(base.role!=='municipios') return null;

  const breakdown=[];
  for(const feature of features){
    const intersection=checkIntersection(aoi,feature);
    if(!intersection.hit||!intersection.geom) continue;

    const overlapArea=areaHa(intersection.geom);
    if(!Number.isFinite(overlapArea)||overlapArea<=0.0000001) continue;

    const properties=feature.properties||{};
    const municipalityName=
      properties[base.nameField]||
      properties.NM_MUN||
      properties.nm_mun||
      properties.NOME||
      properties.nome||
      'Município não identificado';

    breakdown.push({
      nome:String(municipalityName),
      codigo:base.codeField?String(properties[base.codeField]||''):'',
      area:overlapArea,
      pct:aoiArea>0?(overlapArea/aoiArea)*100:0
    });
  }

  breakdown.sort((a,b)=>b.pct-a.pct||a.nome.localeCompare(b.nome,'pt-BR'));
  return breakdown;
}

btnRun.onclick=async()=>{
  if(!aoi){
    alert('Defina a área de interesse.');
    return;
  }

  results=[];
  hitLayerGroup.clearLayers();
  const activeBases=bases.filter(base=>base.active);
  const aoiArea=areaHa(aoi);
  log('runLog',`Iniciando análise de ${activeBases.length} bases...`);

  for(const [index,base] of activeBases.entries()){
    log('runLog',`Analisando ${index+1}/${activeBases.length}: ${base.name}`);

    try{
      const featureCollection=await fetchBaseFeatures(base);
      const features=featureCollection.features||[];
      let totalArea=0;
      const names=[];
      const hitGeoms=[];
      const intersectedFeatures=[];

      for(const feature of features){
        const intersection=checkIntersection(aoi,feature);
        if(!intersection.hit) continue;

        totalArea+=intersection.area;
        names.push(featureLabel(feature,base));
        intersectedFeatures.push(feature);
        if(intersection.geom) hitGeoms.push(intersection.geom);
      }

      const municipalityBreakdown=analyzeMunicipalityBreakdown(base,features,aoiArea);
      const pct=aoiArea>0?(totalArea/aoiArea)*100:0;
      const uniqueNames=[...new Set(names)];

      results.push({
        base:base.name,
        baseId:base.id,
        role:base.role||'',
        group:base.group,
        source:base.source,
        hit:uniqueNames.length>0,
        feature:uniqueNames.slice(0,8).join('; '),
        area:totalArea,
        pct,
        url:base.url,
        status:'OK',
        hitGeoms,
        baseFeatures:intersectedFeatures,
        municipalityBreakdown
      });

      hitGeoms.forEach(geometry=>{
        L.geoJSON(geometry,{
          style:{color:'#dc2626',weight:3,fillColor:'#ef4444',fillOpacity:.28},
          pointToLayer:(feature,latlng)=>L.circleMarker(latlng,{radius:7,color:'#dc2626',fillColor:'#ef4444',fillOpacity:.8})
        }).addTo(hitLayerGroup);
      });
    }catch(error){
      results.push({
        base:base.name,
        baseId:base.id,
        role:base.role||'',
        group:base.group,
        source:base.source,
        hit:false,
        feature:'Erro ao carregar/analisar: '+error.message,
        area:0,
        pct:0,
        url:base.url,
        status:'ERRO',
        municipalityBreakdown:null
      });
    }

    renderResults();
  }

  log('runLog',`Análise concluída. Bases: ${results.length}. Interseções: ${results.filter(result=>result.hit).length}.`);
};

function resultFeatureHtml(result){
  const featureText=escapeHtml(result.feature||'-');
  if(!result.municipalityBreakdown||!result.municipalityBreakdown.length) return featureText;

  const rows=result.municipalityBreakdown.map(item=>
    `<div style="margin-top:4px"><b>${escapeHtml(item.nome)}</b>: ${fmt(item.pct,2)}% (${fmt(item.area,4)} ha)</div>`
  ).join('');
  return `${featureText}<div class="small" style="margin-top:6px">${rows}</div>`;
}

function renderResults(){
  const tbody=document.querySelector('#resultsTable tbody');
  tbody.innerHTML='';

  results.forEach(result=>{
    const row=document.createElement('tr');
    const pillClass=result.status==='ERRO'?'warn':(result.hit?'no':'ok');
    const label=result.status==='ERRO'?'ERRO':(result.hit?'SIM':'NÃO');
    row.innerHTML=`<td><b>${escapeHtml(result.base)}</b><br><span class="small">${escapeHtml(result.source||'')}</span></td><td><span class="pill ${pillClass}">${label}</span></td><td>${resultFeatureHtml(result)}</td><td>${result.area?fmt(result.area)+' ha':'-'}</td><td>${result.pct?fmt(result.pct,2)+'%':'-'}</td>`;
    tbody.appendChild(row);
  });

  resBases.textContent=results.length;
  resHits.textContent=results.filter(result=>result.hit).length;
  resArea.textContent=fmt(results.reduce((sum,result)=>sum+(result.area||0),0));
}

btnCsv.onclick=()=>{
  if(!results.length){
    alert('Execute a análise primeiro.');
    return;
  }

  const rows=[['Base','Grupo','Fonte','Intersecta','Feicao','Area_ha','Percentual','Status']];
  results.forEach(result=>{
    if(result.municipalityBreakdown&&result.municipalityBreakdown.length){
      result.municipalityBreakdown.forEach(item=>rows.push([
        result.base,
        result.group,
        result.source,
        'Sim',
        item.nome,
        fmt(item.area,4),
        fmt(item.pct,2),
        result.status
      ]));
    }else{
      rows.push([result.base,result.group,result.source,result.hit?'Sim':'Não',result.feature,fmt(result.area),fmt(result.pct,2),result.status]);
    }
  });

  download(
    'resultado_intersecoes.csv',
    rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(';')).join('\n'),
    'text/csv;charset=utf-8'
  );
};
