async function getSQL(){
  if(!SQL_PROMISE){
    SQL_PROMISE=initSqlJs({locateFile:file=>'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/'+file});
  }
  return SQL_PROMISE;
}
async function fetchArrayBufferSmart(url,timeout=90000){
  let lastErr=null;
  for(const u of proxyUrls(url)){
    try{
      const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeout);
      const r=await fetch(u,{signal:ctrl.signal}); clearTimeout(t);
      if(!r.ok) throw new Error('HTTP '+r.status);
      return await r.arrayBuffer();
    }catch(e){ lastErr=e; }
  }
  throw new Error((lastErr&&lastErr.message)||'Falha ao baixar arquivo GeoPackage');
}
function qIdent(s){ return '"'+String(s).replace(/"/g,'""')+'"'; }
function gpkgHeaderSize(bytes){
  if(bytes[0]!==0x47 || bytes[1]!==0x50) return 0;
  const flags=bytes[3];
  const env=(flags>>1)&7;
  const envBytes={0:0,1:32,2:48,3:48,4:64}[env]||0;
  return 8+envBytes;
}
function DataReader(bytes, offset=0){
  return {bytes, dv:new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), o:offset, le:true,
    u8(){return this.dv.getUint8(this.o++);},
    u32(){const v=this.dv.getUint32(this.o,this.le); this.o+=4; return v;},
    f64(){const v=this.dv.getFloat64(this.o,this.le); this.o+=8; return v;}
  };
}
function readWkbGeometry(r){
  r.le = r.u8()===1;
  let type=r.u32();
  type = type % 1000; // remove Z/M/ZM ISO offsets when present
  if(type===1){ return {type:'Point',coordinates:[r.f64(),r.f64()]}; }
  if(type===2){ const n=r.u32(), coords=[]; for(let i=0;i<n;i++) coords.push([r.f64(),r.f64()]); return {type:'LineString',coordinates:coords}; }
  if(type===3){ const rings=[], nr=r.u32(); for(let i=0;i<nr;i++){ const n=r.u32(), ring=[]; for(let j=0;j<n;j++) ring.push([r.f64(),r.f64()]); rings.push(ring); } return {type:'Polygon',coordinates:rings}; }
  if(type===4){ const n=r.u32(), arr=[]; for(let i=0;i<n;i++) arr.push(readWkbGeometry(r).coordinates); return {type:'MultiPoint',coordinates:arr}; }
  if(type===5){ const n=r.u32(), arr=[]; for(let i=0;i<n;i++) arr.push(readWkbGeometry(r).coordinates); return {type:'MultiLineString',coordinates:arr}; }
  if(type===6){ const n=r.u32(), arr=[]; for(let i=0;i<n;i++) arr.push(readWkbGeometry(r).coordinates); return {type:'MultiPolygon',coordinates:arr}; }
  if(type===7){ const n=r.u32(), geoms=[]; for(let i=0;i<n;i++) geoms.push(readWkbGeometry(r)); return {type:'GeometryCollection',geometries:geoms}; }
  throw new Error('Tipo WKB não suportado: '+type);
}
function gpkgGeomToGeoJSON(value){
  const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
  const off=gpkgHeaderSize(bytes);
  const r=DataReader(bytes,off);
  return readWkbGeometry(r);
}
function dbQuery(db,sql,params=[]){
  const stmt=db.prepare(sql); stmt.bind(params); const rows=[];
  while(stmt.step()) rows.push(stmt.getAsObject());
  stmt.free(); return rows;
}
async function openGpkg(url){
  if(gpkgCache[url]) return gpkgCache[url];
  const SQL=await getSQL();
  const buf=await fetchArrayBufferSmart(url);
  const db=new SQL.Database(new Uint8Array(buf));
  const meta=dbQuery(db,"SELECT table_name, column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns LIMIT 1")[0];
  if(!meta) throw new Error('GeoPackage sem tabela vetorial em gpkg_geometry_columns.');
  const cols=dbQuery(db,`PRAGMA table_info(${qIdent(meta.table_name)})`).map(r=>r.name);
  // IMPORTANTE: não usar tabelas RTree no navegador.
  // Alguns GeoPackages possuem índices espaciais virtuais (rtree_*), mas o SQL.js
  // utilizado em HTML local pode não ter o módulo rtree habilitado, gerando:
  // "no such module: rtree". Por isso a ferramenta faz leitura direta da
  // tabela vetorial e aplica filtro espacial posteriormente com Turf.js.
  return gpkgCache[url]={db,meta,cols,rtree:null,hasRtree:false};
}
async function fetchGpkgFeatures(base){
  const gpkg=await openGpkg(base.url);
  const {db,meta,cols}=gpkg;
  const bbox=boundsOf(aoi); // minx,miny,maxx,maxy
  const geomCol=meta.column_name, table=meta.table_name;
  const propCols=cols.filter(c=>c!==geomCol);
  const selectCols=[geomCol,...propCols].map(qIdent).join(',');

  // Leitura sem RTree: evita o erro "no such module: rtree".
  // A filtragem espacial é feita em duas etapas no JavaScript:
  // 1) filtro rápido pelo bbox da geometria;
  // 2) interseção real com Turf.js na etapa principal da análise.
  const sql=`SELECT ${selectCols} FROM ${qIdent(table)}`;
  const rows=dbQuery(db,sql,[]);
  const bboxPoly=turf.bboxPolygon(bbox);
  const features=[];
  for(const row of rows){
    try{
      const geom=gpkgGeomToGeoJSON(row[geomCol]);
      if(!geom) continue;
      const props={}; propCols.forEach(c=>props[c]=row[c]);
      const f={type:'Feature',properties:props,geometry:geom};
      try{
        const fb=turf.bbox(f);
        if(fb[2] < bbox[0] || fb[0] > bbox[2] || fb[3] < bbox[1] || fb[1] > bbox[3]) continue;
      }catch(e){ /* se bbox falhar, tenta mesmo assim */ }
      try{
        if(turf.booleanIntersects(bboxPoly, f)) features.push(f);
      }catch(e){ features.push(f); }
    }catch(e){ /* ignora geometrias inválidas */ }
  }
  return {type:'FeatureCollection',features};
}

function arcgisQueryBaseParams(bbox){
  const geom={xmin:bbox[0],ymin:bbox[1],xmax:bbox[2],ymax:bbox[3],spatialReference:{wkid:4326}};
  return {
    where:'1=1',
    outFields:'*',
    returnGeometry:'true',
    geometry:JSON.stringify(geom),
    geometryType:'esriGeometryEnvelope',
    inSR:'4326',
    outSR:'4326',
    spatialRel:'esriSpatialRelIntersects'
  };
}
function buildArcgisRestQueryUrl(base,bbox,extra={}){
  // ArcGIS REST Feature Layer: consulta apenas feições que cruzam o BBOX da área analisada.
  // Não usa paginação por offset, pois alguns serviços do SNIRH retornam "Pagination is not supported".
  const ep=base.url.replace(/\/+$/,'') + '/query';
  const p=new URLSearchParams({f:'geojson',...arcgisQueryBaseParams(bbox),...extra});
  return ep+'?'+p.toString();
}
function chunkArray(arr,size){ const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }
function fetchArcgisJsonp(url,timeout=45000){
  return new Promise((resolve,reject)=>{
    const cb='__arcgis_cb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const sep=url.includes('?')?'&':'?';
    const script=document.createElement('script');
    let done=false;
    const finish=(err,data)=>{ if(done)return; done=true; clearTimeout(timer); try{delete window[cb]}catch(e){}; script.remove(); err?reject(err):resolve(data); };
    window[cb]=(data)=>finish(null,data);
    script.onerror=()=>finish(new Error('Falha JSONP no serviço ArcGIS REST'));
    script.src=url+sep+'callback='+encodeURIComponent(cb);
    document.head.appendChild(script);
    const timer=setTimeout(()=>finish(new Error('Timeout na consulta JSONP ArcGIS REST')),timeout);
  });
}
function esriGeometryToGeoJSON(g,geometryType){
  if(!g) return null;
  if(Number.isFinite(g.x)&&Number.isFinite(g.y)) return {type:'Point',coordinates:[g.x,g.y]};
  if(Array.isArray(g.points)) return {type:'MultiPoint',coordinates:g.points};
  if(Array.isArray(g.paths)) return g.paths.length===1?{type:'LineString',coordinates:g.paths[0]}:{type:'MultiLineString',coordinates:g.paths};
  if(Array.isArray(g.rings)){
    // Para a checagem espacial, cada anel é preservado como polígono independente.
    // Turf.js continua responsável pela interseção exata com a Área de Interesse.
    if(g.rings.length===1) return {type:'Polygon',coordinates:[g.rings[0]]};
    return {type:'MultiPolygon',coordinates:g.rings.map(r=>[r])};
  }
  return null;
}
function esriJsonToGeoJSON(data){
  if(data&&data.type==='FeatureCollection') return data;
  const geometryType=data&&data.geometryType;
  const feats=(data&&data.features||[]).map((f,i)=>({
    type:'Feature',
    id:(f.attributes&&(f.attributes.OBJECTID??f.attributes.FID??f.attributes.objectid))??i,
    properties:f.attributes||{},
    geometry:esriGeometryToGeoJSON(f.geometry,geometryType)
  })).filter(f=>f.geometry);
  return {type:'FeatureCollection',features:feats};
}
async function fetchArcgisJsonWithJsonpFallback(url,timeout=45000){
  try{return await fetchJsonSmart(url,timeout)}catch(e){
    // ArcGIS REST suporta callback JSONP em respostas JSON. Esse caminho evita CORS/403 do navegador.
    const u=new URL(url);
    u.searchParams.set('f','json');
    return await fetchArcgisJsonp(u.toString(),timeout);
  }
}
async function fetchArcgisIds(base,bbox){
  const ep=base.url.replace(/\/+$/,'') + '/query';
  const p=new URLSearchParams({
    f:'json',
    where:'1=1',
    returnIdsOnly:'true',
    returnGeometry:'false',
    geometry:JSON.stringify({xmin:bbox[0],ymin:bbox[1],xmax:bbox[2],ymax:bbox[3],spatialReference:{wkid:4326}}),
    geometryType:'esriGeometryEnvelope',
    inSR:'4326',
    outSR:'4326',
    spatialRel:'esriSpatialRelIntersects'
  });
  const data=await fetchArcgisJsonWithJsonpFallback(ep+'?'+p.toString(),45000);
  if(data.error) throw new Error(data.error.message||'Erro retornado pelo ArcGIS REST');
  return data.objectIds||data.objectids||[];
}
async function fetchArcgisFeaturesByObjectIds(base,objectIds){
  if(!objectIds.length) return {type:'FeatureCollection',features:[]};
  const ep=base.url.replace(/\/+$/,'') + '/query';
  const features=[];
  const chunks=chunkArray(objectIds, 100);
  for(const ids of chunks){
    const p=new URLSearchParams({
      f:'geojson',
      where:'1=1',
      objectIds:ids.join(','),
      outFields:'*',
      returnGeometry:'true',
      outSR:'4326'
    });
    let data;
    try{
      data=await fetchJsonSmart(ep+'?'+p.toString(),45000);
    }catch(e){
      p.set('f','json');
      data=await fetchArcgisJsonp(ep+'?'+p.toString(),45000);
    }
    if(data.error) throw new Error(data.error.message||'Erro retornado pelo ArcGIS REST');
    const fc=esriJsonToGeoJSON(data);
    features.push(...(fc.features||[]));
  }
  return {type:'FeatureCollection',features};
}
async function fetchArcgisFeatures(base,bbox){
  // Estratégia principal para SNIRH: consulta somente a extensão da Área de Interesse, obtém ObjectIDs e baixa as feições em lotes.
  // Isso evita o erro "Pagination is not supported" em serviços sem paginação por offset.
  try{
    const ids=await fetchArcgisIds(base,bbox);
    if(ids.length===0) return {type:'FeatureCollection',features:[]};
    return await fetchArcgisFeaturesByObjectIds(base,ids);
  }catch(idErr){
    // Fallback: consulta direta sem resultRecordCount/resultOffset.
    const url=buildArcgisRestQueryUrl(base,bbox);
    const data=await fetchJsonSmart(url,45000);
    if(data.type==='FeatureCollection') return data;
    if(data.type==='Feature') return {type:'FeatureCollection',features:[data]};
    if(data.error) throw new Error((data.error.message||'Erro retornado pelo ArcGIS REST') + ' | fallback após objectIds: ' + idErr.message);
    throw new Error('Resposta ArcGIS REST não veio como GeoJSON.');
  }
}

function aoiToOverpassPoly(feature){
  try{
    let geom=feature.geometry;
    if(!geom) return '';
    let ring=null;
    if(geom.type==='Polygon') ring=geom.coordinates[0];
    else if(geom.type==='MultiPolygon') ring=geom.coordinates[0][0];
    if(!ring || ring.length<4) return '';
    // Overpass espera "lat lon lat lon...". Simplifica a primeira borda externa.
    return ring.map(c=>`${Number(c[1]).toFixed(7)} ${Number(c[0]).toFixed(7)}`).join(' ');
  }catch(e){return '';}
}

function isFunaiBase(base){
  return /FUNAI/i.test(base.source||'') || /tis_(poligonais|pontos)/i.test(base.wfsLayer||base.layer||'');
}
function funaiEndpoints(){
  return [
    'https://geoserver.funai.gov.br/geoserver/ows',
    'https://geoserver.funai.gov.br/geoserver/Funai/ows',
    'https://geoserver.funai.gov.br/geoserver/funai/ows'
  ];
}
async function fetchDirectText(url,timeout=30000){
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const r=await fetch(url,{method:'GET',mode:'cors',cache:'no-store',credentials:'omit',signal:ctrl.signal});
    if(!r.ok) { const err=new Error('HTTP '+r.status); err.httpStatus=r.status; throw err; }
    return await r.text();
  } finally { clearTimeout(timer); }
}
function gmlToGeoJSON(text){
  if(!window.ol) throw new Error('Leitor GML não foi carregado.');
  const format=new ol.format.WFS();
  const features=format.readFeatures(text,{dataProjection:'EPSG:4326',featureProjection:'EPSG:4326'});
  const geojson=new ol.format.GeoJSON().writeFeaturesObject(features,{dataProjection:'EPSG:4326',featureProjection:'EPSG:4326'});
  return geojson;
}
async function fetchFunaiFeatures(base,bbox){
  const layer=base.wfsLayer||base.layer||'Funai:tis_poligonais_portarias';
  const attempts=[];
  for(const ep of funaiEndpoints()){
    for(const version of ['1.0.0','1.1.0','2.0.0']){
      const typeKey=version==='2.0.0'?'typeNames':'typeName';
      for(const outputFormat of ['application/json','json']){
        const p=new URLSearchParams({service:'WFS',version,request:'GetFeature',srsName:'EPSG:4326',outputFormat});
        p.set(typeKey,layer); p.set('bbox',bbox.join(',')+',EPSG:4326');
        attempts.push({url:ep+'?'+p.toString(),format:'json'});
      }
      const pGml=new URLSearchParams({service:'WFS',version,request:'GetFeature',srsName:'EPSG:4326'});
      pGml.set(typeKey,layer); pGml.set('bbox',bbox.join(',')+',EPSG:4326');
      attempts.push({url:ep+'?'+pGml.toString(),format:'gml'});
    }
  }
  let lastErr=null, saw403=false;
  for(const a of attempts){
    try{
      const txt=await fetchDirectText(a.url,30000);
      if(a.format==='json'){
        const data=JSON.parse(txt);
        if(data.type==='FeatureCollection') return data;
        if(data.type==='Feature') return {type:'FeatureCollection',features:[data]};
        throw new Error('Resposta JSON sem coleção de feições.');
      }
      const data=gmlToGeoJSON(txt);
      if(data && data.type==='FeatureCollection') return data;
    }catch(e){
      lastErr=e; if(e.httpStatus===403 || /HTTP 403/.test(e.message||'')) saw403=true;
    }
  }
  if(saw403) throw new Error('HTTP 403. Base FUNAI temporariamente indisponível para análise vetorial direta no navegador. A visualização WMS poderá continuar disponível.');
  throw new Error('Base FUNAI indisponível para análise vetorial direta. '+((lastErr&&lastErr.message)||''));
}

async function fetchBaseFeatures(base){
  const bbox=boundsOf(aoi);
  if(isFunaiBase(base)) return await fetchFunaiFeatures(base,bbox);
  if(base.type==='gpkg') return await fetchGpkgFeatures(base);
  if(base.type==='arcgis') return await fetchArcgisFeatures(base,bbox);
  const urls=base.type==='geojson'?[base.url]:wfsCandidates(base,bbox);
  let lastErr=null;
  for(const url of urls){
    try{
      const data=await fetchJsonSmart(url,30000);
      if(data.type==='FeatureCollection') return data;
      if(data.type==='Feature') return {type:'FeatureCollection',features:[data]};
      throw new Error('JSON retornado não é uma coleção de feições');
    }catch(e){ lastErr=e; }
  }
  throw new Error((lastErr&&lastErr.message)||'Falha ao carregar WFS/GeoJSON. Possível CORS ou WFS indisponível.');
}
