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



function analyzeTerritorialClassification(base,features,aoiArea){
  if(
    base.role!=='classificacao_territorial' &&
    base.analysisType!=='classificacao_territorial'
  ) return null;

  const fields=base.fieldMap||{};
  const sectors=[];
  const totals={Urbana:0,Rural:0,Outros:0};
  const municipalities=new Set();
  const districts=new Set();
  const neighborhoods=new Set();
  const urbanCores=new Set();
  const settlements=new Set();
  let population=0;
  let households=0;

  for(const feature of features){
    const intersection=checkIntersection(aoi,feature);
    if(!intersection.hit||!intersection.geom) continue;

    const overlapArea=areaHa(intersection.geom);
    if(!Number.isFinite(overlapArea)||overlapArea<=0.0000001) continue;

    const properties=feature.properties||{};
    const situation=String(firstProperty(properties,[
      fields.situacao,'situacao','SITUACAO'
    ],'Não classificada')).trim();
    const normalized=situation.toLowerCase();

    if(normalized.includes('urbana')) totals.Urbana+=overlapArea;
    else if(normalized.includes('rural')) totals.Rural+=overlapArea;
    else totals.Outros+=overlapArea;

    const municipality=String(firstProperty(properties,[fields.municipio,'municipio'],'')).trim();
    const district=String(firstProperty(properties,[fields.distrito,'distrito'],'')).trim();
    const neighborhood=String(firstProperty(properties,[fields.bairro,'bairro'],'')).trim();
    const urbanCore=String(firstProperty(properties,[fields.nucleoUrbano,'nucleo_urbano'],'')).trim();
    const settlement=String(firstProperty(properties,[fields.aglomerado,'aglomerado'],'')).trim();

    if(municipality) municipalities.add(municipality);
    if(district) districts.add(district);
    if(neighborhood) neighborhoods.add(neighborhood);
    if(urbanCore) urbanCores.add(urbanCore);
    if(settlement) settlements.add(settlement);

    const sectorPopulation=Number(firstProperty(properties,[
      fields.populacao,'total_de_pessoas'
    ],0))||0;
    const sectorHouseholds=Number(firstProperty(properties,[
      fields.domicilios,'total_de_domicilios'
    ],0))||0;

    population+=sectorPopulation;
    households+=sectorHouseholds;

    sectors.push({
      codigo:String(firstProperty(properties,[fields.codigoSetor,'codigo_setor'],'')).trim(),
      situacao:situation,
      situacaoDetalhada:String(firstProperty(properties,[
        fields.situacaoDetalhada,'situacao_detalhada'
      ],'')).trim(),
      tipoSetor:String(firstProperty(properties,[
        fields.tipoSetor,'tipo_de_setor'
      ],'')).trim(),
      municipio:municipality,
      distrito:district,
      bairro:neighborhood,
      nucleoUrbano:urbanCore,
      aglomerado:settlement,
      populacao:sectorPopulation,
      domicilios:sectorHouseholds,
      areaSobreposta:overlapArea,
      percentualAoi:aoiArea>0?(overlapArea/aoiArea)*100:0
    });
  }

  sectors.sort((a,b)=>b.areaSobreposta-a.areaSobreposta);

  const distribution=[
    {classe:'Urbana',area:totals.Urbana,pct:aoiArea>0?(totals.Urbana/aoiArea)*100:0},
    {classe:'Rural',area:totals.Rural,pct:aoiArea>0?(totals.Rural/aoiArea)*100:0},
    {classe:'Outros/Não classificada',area:totals.Outros,pct:aoiArea>0?(totals.Outros/aoiArea)*100:0}
  ].filter(item=>item.area>0.0000001);

  let dominant='Não classificada';
  if(distribution.length){
    dominant=distribution.slice().sort((a,b)=>b.area-a.area)[0].classe;
  }

  return {
    dominant,
    distribution,
    sectors,
    municipalities:[...municipalities].sort((a,b)=>a.localeCompare(b,'pt-BR')),
    districts:[...districts].sort((a,b)=>a.localeCompare(b,'pt-BR')),
    neighborhoods:[...neighborhoods].sort((a,b)=>a.localeCompare(b,'pt-BR')),
    urbanCores:[...urbanCores].sort((a,b)=>a.localeCompare(b,'pt-BR')),
    settlements:[...settlements].sort((a,b)=>a.localeCompare(b,'pt-BR')),
    population,
    households
  };
}

function firstProperty(properties,keys,fallback=''){
  for(const key of keys){
    if(key && properties[key]!==undefined && properties[key]!==null && String(properties[key]).trim()!==''){
      return properties[key];
    }
  }
  return fallback;
}

function analyzeAnmProcesses(base,features,aoiArea){
  if(base.role!=='anm' || !base.specialAnalysisEnabled) return null;

  const fields=base.fieldMap||{};
  const records=[];
  const seen=new Set();

  for(const feature of features){
    const intersection=checkIntersection(aoi,feature);
    if(!intersection.hit) continue;

    const properties=feature.properties||{};
    const processo=String(firstProperty(properties,[
      fields.processo,'DSProcesso','dsprocesso','PROCESSO','processo'
    ],'Processo não informado'));
    const nome=String(firstProperty(properties,[
      fields.nome,'NOME','Nome','nome'
    ],'Titular não informado'));
    const fase=String(firstProperty(properties,[
      fields.fase,'FASE','Fase','fase'
    ],'Fase não informada'));
    const substancia=String(firstProperty(properties,[
      fields.substancia,'SUBS','Subs','subs'
    ],'Substância não informada'));

    const areaProcessoRaw=firstProperty(properties,[
      fields.area,'AREA_HA','Area_HA','area_ha'
    ],0);
    const areaProcesso=Number(String(areaProcessoRaw).replace(',','.'))||0;
    const overlapArea=intersection.geom ? areaHa(intersection.geom) : 0;
    const overlapPct=aoiArea>0 ? (overlapArea/aoiArea)*100 : 0;

    const uniqueKey=[processo,nome,fase,substancia,areaProcesso].join('|');
    if(seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);

    records.push({
      processo,
      areaProcesso,
      fase,
      nome,
      substancia,
      areaSobreposta:overlapArea,
      percentualAoi:overlapPct
    });
  }

  records.sort((a,b)=>
    b.areaSobreposta-a.areaSobreposta ||
    a.processo.localeCompare(b.processo,'pt-BR')
  );
  return records;
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
      const anmProcesses=analyzeAnmProcesses(base,features,aoiArea);
      const territorialClassification=analyzeTerritorialClassification(base,features,aoiArea);
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
        municipalityBreakdown,
        anmProcesses,
        territorialClassification,
        dashboardEnabled:base.dashboardEnabled===true,
        specialReportEnabled:base.specialReportEnabled===true,
        specialAnalysisEnabled:base.specialAnalysisEnabled===true,
        nameField:base.nameField||'',
        fieldMap:base.fieldMap||{},
        baseStyle:visualStyle(base)
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
        municipalityBreakdown:null,
        anmProcesses:null,
        territorialClassification:null,
        dashboardEnabled:base.dashboardEnabled===true,
        specialReportEnabled:base.specialReportEnabled===true,
        specialAnalysisEnabled:base.specialAnalysisEnabled===true,
        nameField:base.nameField||'',
        fieldMap:base.fieldMap||{},
        baseStyle:visualStyle(base)
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


function renderDashboard(){
  const summary=document.getElementById('dashboardSummary');
  const stats=document.getElementById('dashboardStats');
  const cards=document.getElementById('dashboardCards');
  if(!summary||!stats||!cards) return;

  const total=results.length;
  const hits=results.filter(result=>result.hit&&result.status!=='ERRO').length;
  const errors=results.filter(result=>result.status==='ERRO').length;
  const clear=results.filter(result=>!result.hit&&result.status!=='ERRO').length;

  stats.innerHTML=`
    <div class="dashboard-stat"><b>${total}</b><span>bases analisadas</span></div>
    <div class="dashboard-stat hit"><b>${hits}</b><span>com interseção</span></div>
    <div class="dashboard-stat clear"><b>${clear}</b><span>sem interseção</span></div>
    <div class="dashboard-stat warning"><b>${errors}</b><span>com erro</span></div>`;

  if(!total){
    summary.className='dashboard-summary neutral';
    summary.textContent='Execute a checagem para visualizar um resumo simplificado dos resultados.';
    cards.innerHTML='<div class="dashboard-empty">Nenhum resultado disponível.</div>';
    return;
  }

  if(errors){
    summary.className='dashboard-summary warning';
    summary.textContent=`A análise foi concluída, mas ${errors} base(s) apresentaram erro. Revise os cartões abaixo antes de usar o relatório.`;
  }else if(hits){
    summary.className='dashboard-summary alert';
    summary.textContent=`Atenção: foram identificadas interseções em ${hits} de ${total} base(s) analisadas.`;
  }else{
    summary.className='dashboard-summary clear';
    summary.textContent=`Nenhuma interseção foi identificada nas ${total} base(s) analisadas.`;
  }

  cards.innerHTML='';
  results.forEach(result=>{
    const statusClass=result.status==='ERRO'?'error':(result.hit?'hit':'clear');
    const statusLabel=result.status==='ERRO'?'NÃO ANALISADA':(result.hit?'INTERSEÇÃO':'SEM INTERSEÇÃO');
    const card=document.createElement('div');
    card.className=`dashboard-card ${statusClass}`;

    let body='';
    if(result.status==='ERRO'){
      body=`<div>${escapeHtml(result.feature||'Falha durante a análise.')}</div>`;
    }else if(result.role==='municipios'&&result.municipalityBreakdown?.length){
      const list=result.municipalityBreakdown.map(item=>`
        <div class="dashboard-municipality-item">
          <span><b>${escapeHtml(item.nome)}</b></span>
          <span>${fmt(item.pct,2)}%</span>
        </div>`).join('');
      body=`
        <div>A Área de Interesse está distribuída entre:</div>
        <div class="dashboard-municipality-list">${list}</div>`;
    }else if(
      result.role==='classificacao_territorial' &&
      result.dashboardEnabled===true &&
      result.territorialClassification
    ){
      const territorial=result.territorialClassification;
      const distribution=territorial.distribution.map(item=>`
        <div class="dashboard-municipality-item">
          <span><b>${escapeHtml(item.classe)}</b></span>
          <span>${fmt(item.pct,2)}%</span>
        </div>`).join('');
      body=`
        <div><b>Classificação predominante:</b> ${escapeHtml(territorial.dominant)}</div>
        <div class="dashboard-municipality-list">${distribution}</div>
        <div style="margin-top:8px"><b>Setores atingidos:</b> ${territorial.sectors.length}</div>
        <div><b>Distritos:</b> ${escapeHtml(territorial.districts.join(', ')||'Não informado')}</div>
        <div><b>Bairros:</b> ${escapeHtml(territorial.neighborhoods.join(', ')||'Não informado')}</div>
        <div><b>População dos setores:</b> ${territorial.population.toLocaleString('pt-BR')}</div>
        <div><b>Domicílios dos setores:</b> ${territorial.households.toLocaleString('pt-BR')}</div>`;
    }else if(
      result.role==='anm' &&
      result.dashboardEnabled===true &&
      result.anmProcesses?.length
    ){
      const processList=result.anmProcesses.map(item=>`
        <div class="dashboard-anm-item">
          <div class="dashboard-anm-process">${escapeHtml(item.processo)}</div>
          <div><b>Titular:</b> ${escapeHtml(item.nome)}</div>
          <div><b>Fase:</b> ${escapeHtml(item.fase)}</div>
          <div><b>Substância:</b> ${escapeHtml(item.substancia)}</div>
          <div><b>Área do processo:</b> ${fmt(item.areaProcesso,2)} ha</div>
          <div><b>Sobreposição com a AOI:</b> ${fmt(item.areaSobreposta,4)} ha (${fmt(item.percentualAoi,2)}%)</div>
        </div>`).join('');
      body=`
        <div><b>${result.anmProcesses.length}</b> processo(s) minerário(s) incidente(s) na Área de Interesse.</div>
        <div class="dashboard-anm-list">${processList}</div>`;
    }else if(result.hit){
      const areaText=result.area?`${fmt(result.area,4)} ha`:'interseção identificada';
      const pctText=result.pct?` (${fmt(result.pct,2)}% da área)`:'';
      body=`<div><b>Resultado:</b> ${areaText}${pctText}</div>
            <div><b>Feição:</b> ${escapeHtml(result.feature||'Não identificada')}</div>`;
    }else{
      body='<div>Não foi identificada sobreposição com a Área de Interesse.</div>';
    }

    card.innerHTML=`
      <div class="dashboard-card-header">
        <div>
          <div class="dashboard-card-title">${escapeHtml(result.base)}</div>
          <div class="dashboard-card-subtitle">${escapeHtml(result.group||'')} · ${escapeHtml(result.source||'')}</div>
        </div>
        <span class="dashboard-card-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="dashboard-card-body">${body}</div>`;
    cards.appendChild(card);
  });
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
  renderDashboard();
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
