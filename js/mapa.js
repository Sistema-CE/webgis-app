let bases=[], aoi=null, aoiLayer=null, results=[], wmsLayerGroup=L.layerGroup(), hitLayerGroup=L.layerGroup();
let wmsLayers=new Map();
const map=L.map('map',{preferCanvas:true,zoomControl:true}).setView([-5.2,-39.5],7);
const baseMaps={
  osm:L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,crossOrigin:true,attribution:'© OpenStreetMap'}),
  satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,crossOrigin:true,attribution:'Tiles © Esri, Maxar, Earthstar Geographics e demais fornecedores'})
};
let currentBaseMap=baseMaps.osm.addTo(map);
// WMS inicia oculto. As camadas continuam disponíveis e ativas para análise.
hitLayerGroup.addTo(map);
const drawGroup=new L.FeatureGroup().addTo(map);
const drawControl=new L.Control.Draw({edit:{featureGroup:drawGroup},draw:{polyline:false,circle:false,circlemarker:false,marker:false,polygon:true,rectangle:true}});
map.addControl(drawControl);
map.on(L.Draw.Event.CREATED,e=>{drawGroup.clearLayers(); drawGroup.addLayer(e.layer); setAOI(e.layer.toGeoJSON(),'Área desenhada');});
map.on(L.Draw.Event.EDITED,()=>{const gj=drawGroup.toGeoJSON(); if(gj.features.length) setAOI(gj,'Área editada',false);});

