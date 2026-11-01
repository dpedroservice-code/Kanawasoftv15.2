/* Kanawa Soft — mapas, rotas, geolocalização e rastreio */
(function () {
  'use strict';

  const ROUTING_API = 'https://router.project-osrm.org';
  const GEOCODING_API = 'https://photon.komoot.io/api';
  const DEFAULT_CENTER = [-8.8383, 13.2344];
  let maps = {};
  let mapLayers = {};
  let trackingWatchId = null;
  let trackingTargetId = null;
  let lastTrackingWrite = 0;

  function text(value) { return String(value == null ? '' : value); }
  function safe(value) { return typeof esc === 'function' ? esc(text(value)) : text(value).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  function notify(message, type) { if (typeof toast === 'function') toast(message, type || 'info'); }
  function destroy() {
    Object.keys(maps).forEach(function (key) { try { maps[key].remove(); } catch (e) {} });
    maps = {};
    mapLayers = {};
  }
  function stopLiveTracking() {
    if (trackingWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(trackingWatchId);
    trackingWatchId = null;
    trackingTargetId = null;
    lastTrackingWrite = 0;
  }
  function ensureLeaflet() {
    if (window.L && typeof window.L.map === 'function') return Promise.resolve(window.L);
    if (window.__kanawaLeafletPromise) return window.__kanawaLeafletPromise;
    window.__kanawaLeafletPromise = new Promise(function (resolve, reject) {
      if (!document.querySelector('link[data-kanawa-leaflet]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        css.setAttribute('data-kanawa-leaflet', 'true');
        document.head.appendChild(css);
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = function () {
        if (window.L && typeof window.L.map === 'function') resolve(window.L);
        else reject(new Error('A biblioteca Leaflet não ficou disponível.'));
      };
      script.onerror = function () { reject(new Error('Não foi possível carregar a biblioteca do mapa.')); };
      document.head.appendChild(script);
    }).catch(function (error) {
      window.__kanawaLeafletPromise = null;
      throw error;
    });
    return window.__kanawaLeafletPromise;
  }
  function createMap(id) {
    const element = document.getElementById(id);
    if (!element || !window.L) return null;
    if (maps[id]) { try { maps[id].remove(); } catch (e) {} }
    const map = window.L.map(element, { scrollWheelZoom: true }).setView(DEFAULT_CENTER, 11);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    maps[id] = map;
    mapLayers[id] = [];
    setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 120);
    return map;
  }
  function clearLayers(id) {
    const map = maps[id];
    (mapLayers[id] || []).forEach(function (layer) { try { if (map) map.removeLayer(layer); } catch (e) {} });
    mapLayers[id] = [];
  }
  function addMarker(id, lat, lon, title, detail) {
    const map = maps[id];
    if (!map || !window.L || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
    const marker = window.L.marker([Number(lat), Number(lon)]).addTo(map);
    marker.bindPopup('<strong>' + safe(title || 'Localização') + '</strong>' + (detail ? '<br>' + safe(detail) : ''));
    mapLayers[id].push(marker);
    return marker;
  }
  async function geocode(value) {
    const query = text(value).trim();
    if (!query) throw new Error('Indique uma morada, localidade ou coordenadas.');
    const coords = query.match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
    if (coords) {
      const lat = Number(coords[1]), lon = Number(coords[2]);
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error('As coordenadas estão fora dos limites válidos.');
      return { lat: lat, lon: lon, label: query };
    }
    const response = await fetch(GEOCODING_API + '?q=' + encodeURIComponent(query) + '&limit=1&lang=pt');
    if (!response.ok) throw new Error('Serviço de pesquisa de moradas indisponível (' + response.status + ').');
    const data = await response.json();
    const feature = data && data.features && data.features[0];
    if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) throw new Error('Não foi possível localizar "' + query + '". Indique a cidade ou coordenadas.');
    const props = feature.properties || {};
    return { lon: Number(feature.geometry.coordinates[0]), lat: Number(feature.geometry.coordinates[1]), label: props.name || props.street || props.city || query };
  }
  async function routeBetween(originText, destinationText) {
    const origin = await geocode(originText);
    const destination = await geocode(destinationText);
    const url = ROUTING_API + '/route/v1/driving/' + origin.lon + ',' + origin.lat + ';' + destination.lon + ',' + destination.lat + '?overview=full&geometries=geojson&steps=true';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Serviço de cálculo de percurso indisponível (' + response.status + ').');
    const data = await response.json();
    if (!data || data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error('Não foi encontrado um percurso rodoviário entre os pontos.');
    const route = data.routes[0];
    return { origin: origin, destination: destination, geometry: route.geometry, distanceMeters: Number(route.distance), durationSeconds: Number(route.duration), distanceKm: Number(route.distance) / 1000, durationMinutes: Number(route.duration) / 60 };
  }
  function drawRoute(id, route) {
    const map = maps[id];
    if (!map || !route || !route.geometry || !window.L) return;
    clearLayers(id);
    const coords = (route.geometry.coordinates || []).map(function (p) { return [p[1], p[0]]; });
    if (coords.length > 1) {
      const line = window.L.polyline(coords, { color: '#1677d2', weight: 5, opacity: 0.85 }).addTo(map);
      mapLayers[id].push(line);
      map.fitBounds(line.getBounds(), { padding: [24, 24] });
    }
    addMarker(id, route.origin.lat, route.origin.lon, 'Origem', route.origin.label);
    addMarker(id, route.destination.lat, route.destination.lon, 'Destino', route.destination.label);
  }
  async function initRouteMap() {
    try {
      const rows = await getData('roteirizacao') || [];
      await ensureLeaflet();
      const map = createMap('kanawaRouteMap');
      if (!map) return;
      const routes = rows.filter(function (r) { return r.route_geometry && Array.isArray(r.route_geometry.coordinates); });
      if (routes.length) {
        const r = routes[routes.length - 1];
        drawRoute('kanawaRouteMap', { geometry: r.route_geometry, origin: { lat: r.origin_lat, lon: r.origin_lon, label: r.origem }, destination: { lat: r.destination_lat, lon: r.destination_lon, label: r.destino } });
      } else {
        rows.forEach(function (r) {
          if (r.origin_lat != null && r.origin_lon != null) addMarker('kanawaRouteMap', r.origin_lat, r.origin_lon, 'Origem', r.origem);
          if (r.destination_lat != null && r.destination_lon != null) addMarker('kanawaRouteMap', r.destination_lat, r.destination_lon, 'Destino', r.destino);
        });
      }
    } catch (error) {
      const status = document.getElementById('rotaMapStatus');
      if (status) status.textContent = error.message;
      else notify(error.message, 'warning');
    }
  }
  async function renderRoutes(title) {
    const routes = await getData('roteirizacao') || [];
    window.__kanawaRoutePreview = null;
    return header(title || 'Roteirização e Rotas', routes.length + ' rotas guardadas', 'var(--primary)',
      '<button class="btn btn-info" onclick="usarLocalizacaoAtualComoOrigem()"><i class="fas fa-location-arrow"></i> Usar minha localização</button>' +
      (routes.length >= 2 ? '<button class="btn btn-warning" onclick="otimizarRotas()"><i class="fas fa-route"></i> Otimizar paragens</button>' : ''), 'fa-route') +
      '<div class="card"><h3>Calcular percurso</h3><div class="form-grid">' +
      '<div class="form-group"><label>Origem (morada, local ou latitude, longitude)</label><input id="rotaOrigem" placeholder="Ex.: Kilamba, Luanda"></div>' +
      '<div class="form-group"><label>Destino (morada, local ou latitude, longitude)</label><input id="rotaDestino" placeholder="Ex.: Talatona, Luanda"></div>' +
      '<div class="form-group"><label>Veículo / motorista (opcional)</label><input id="rotaVeiculo" placeholder="Matrícula ou identificação"></div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button id="rotaCalcularBtn" class="btn btn-primary" onclick="calcularRotaLogistica()">Calcular distância e rota</button><button class="btn btn-success" onclick="salvarRota()">Guardar rota calculada</button></div>' +
      '<p id="rotaMapStatus" class="text-muted" style="margin-top:10px">A duração é uma estimativa rodoviária, sem dados de trânsito em tempo real.</p>' +
      '<div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:8px"><strong>Distância: <span id="rotaDistancia">—</span></strong><strong>Duração: <span id="rotaDuracao">—</span></strong></div></div>' +
      '<div class="card"><div id="kanawaRouteMap" style="height:380px;width:100%;border-radius:10px;z-index:1"></div></div>' +
      '<div class="card">' + table(['Origem','Destino','Distância','Duração','Veículo','Ações'], routes.map(function (r) {
        return [safe(r.origem || '-'), safe(r.destino || '-'), safe(r.distancia || '-'), safe(r.duracao || '-'), safe(r.veiculo || '-'),
          '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'roteirizacao\',' + Number(r.id) + ')"><i class="fas fa-trash"></i></button>'];
      })) + '</div>';
  }
  async function calculateRoute() {
    const origin = document.getElementById('rotaOrigem') && document.getElementById('rotaOrigem').value.trim();
    const destination = document.getElementById('rotaDestino') && document.getElementById('rotaDestino').value.trim();
    const status = document.getElementById('rotaMapStatus'), button = document.getElementById('rotaCalcularBtn');
    if (!origin || !destination) { notify('Preencha a origem e o destino.', 'warning'); return; }
    if (button) { button.disabled = true; button.textContent = 'A calcular...'; }
    if (status) status.textContent = 'A localizar os pontos e calcular o percurso...';
    try {
      const route = await routeBetween(origin, destination);
      window.__kanawaRoutePreview = route;
      const distance = route.distanceKm.toLocaleString('pt-AO', { maximumFractionDigits: 1 }) + ' km';
      if (document.getElementById('rotaDistancia')) document.getElementById('rotaDistancia').textContent = distance;
      if (document.getElementById('rotaDuracao')) document.getElementById('rotaDuracao').textContent = Math.max(1, Math.round(route.durationMinutes)) + ' min (estimativa)';
      if (status) status.textContent = 'Percurso calculado. Confirme o traçado no mapa antes de guardar.';
      drawRoute('kanawaRouteMap', route);
    } catch (error) {
      window.__kanawaRoutePreview = null;
      if (status) status.textContent = error.message;
      notify(error.message, 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Calcular distância e rota'; }
    }
  }
  function useCurrentLocation() {
    if (!navigator.geolocation) { notify('Este dispositivo não disponibiliza geolocalização.', 'warning'); return; }
    navigator.geolocation.getCurrentPosition(function (position) {
      const input = document.getElementById('rotaOrigem');
      if (input) input.value = position.coords.latitude.toFixed(6) + ', ' + position.coords.longitude.toFixed(6);
      notify('Localização atual definida como origem.', 'success');
    }, function (error) { notify('Não foi possível obter a localização: ' + error.message, 'error'); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  }
  async function saveRoute() {
    const origin = document.getElementById('rotaOrigem') && document.getElementById('rotaOrigem').value.trim();
    const destination = document.getElementById('rotaDestino') && document.getElementById('rotaDestino').value.trim();
    const vehicle = document.getElementById('rotaVeiculo') && document.getElementById('rotaVeiculo').value.trim();
    const route = window.__kanawaRoutePreview;
    if (!origin || !destination) { notify('Preencha a origem e o destino.', 'warning'); return; }
    if (!route) { notify('Calcule a rota antes de a guardar.', 'warning'); return; }
    try {
      await saveData('roteirizacao', {
        origem: origin, destino: destination, veiculo: vehicle || null,
        distancia: route.distanceKm.toFixed(2) + ' km', duracao: Math.round(route.durationMinutes) + ' min',
        origin_lat: route.origin.lat, origin_lon: route.origin.lon,
        destination_lat: route.destination.lat, destination_lon: route.destination.lon,
        route_geometry: route.geometry, route_provider: 'osrm-openstreetmap', data: now()
      });
      window.__kanawaRoutePreview = null;
      notify('Rota calculada e guardada.', 'success');
      openModule(currentModule === 'frota-rotas' ? 'frota-rotas' : 'logistica-roteirizacao');
    } catch (error) { notify(error.message || 'Não foi possível guardar a rota.', 'error'); }
  }
  async function optimizeRoutes() {
    const routes = await getData('roteirizacao') || [];
    if (routes.length < 2) { notify('Guarde pelo menos duas rotas para otimizar as paragens.', 'warning'); return; }
    try {
      const candidates = [];
      for (const r of routes) {
        const a = r.origin_lat != null && r.origin_lon != null ? { lat:Number(r.origin_lat), lon:Number(r.origin_lon), label:r.origem } : await geocode(r.origem);
        const b = r.destination_lat != null && r.destination_lon != null ? { lat:Number(r.destination_lat), lon:Number(r.destination_lon), label:r.destino } : await geocode(r.destino);
        candidates.push(a,b);
      }
      const unique = [];
      const seen = new Set();
      candidates.forEach(function (p) {
        const key = p.lat.toFixed(5)+','+p.lon.toFixed(5);
        if (!seen.has(key)) { seen.add(key); unique.push(p); }
      });
      if (unique.length < 3) { notify('São necessárias pelo menos três paragens diferentes para otimizar.', 'warning'); return; }
      if (unique.length > 20) { notify('A otimização está limitada a 20 paragens por operação.', 'warning'); return; }
      const coordinates = unique.map(p => p.lon+','+p.lat).join(';');
      const response = await fetch(ROUTING_API+'/trip/v1/driving/'+coordinates+'?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson');
      if (!response.ok) throw new Error('Serviço de otimização indisponível ('+response.status+').');
      const data = await response.json();
      if (data.code !== 'Ok' || !data.trips || !data.trips.length) throw new Error('Não foi possível otimizar estas paragens.');
      const trip = data.trips[0];
      const ordered = (data.waypoints || []).slice().sort((a,b)=>a.waypoint_index-b.waypoint_index).map(w=>unique[w.trips_index] || unique[w.waypoint_index]).filter(Boolean);
      const first = ordered[0] || unique[0], last = ordered[ordered.length-1] || unique[unique.length-1];
      await saveData('roteirizacao', {
        origem:first.label, destino:last.label, veiculo:'Rota otimizada',
        distancia:(Number(trip.distance)/1000).toFixed(2)+' km',
        duracao:Math.round(Number(trip.duration)/60)+' min',
        origin_lat:first.lat, origin_lon:first.lon, destination_lat:last.lat, destination_lon:last.lon,
        route_geometry:trip.geometry, route_provider:'osrm-trip-openstreetmap',
        paragens_otimizadas:ordered.map(p=>p.label), data:now()
      });
      notify('Rota otimizada e guardada. Verifique a ordem das paragens no registo.', 'success');
      openModule(currentModule);
    } catch (error) { notify(error.message || 'Falha ao otimizar as rotas.', 'error'); }
  }
  async function getPosition() {
    return await new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('Este dispositivo não disponibiliza GPS/geolocalização.')); return; }
      navigator.geolocation.getCurrentPosition(
        p => resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),
        e => reject(new Error('Não foi possível obter a localização: '+e.message)),
        {enableHighAccuracy:true,timeout:20000,maximumAge:5000}
      );
    });
  }
  function hasVerifiedPosition(record) {
    return !!record && (record.location_source === 'device_gps' || record.location_source === 'device_gps_live') &&
      record.lat !== null && record.lat !== undefined && record.lng !== null && record.lng !== undefined &&
      Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lng));
  }
  function trackingPermissionModule() { return 'logistica-rastreio'; }

  async function renderTracking(title) {
    const records = await getData('rastreios') || [];
    const permissionModule = trackingPermissionModule();
    const canCreate = podeFazerModulo(permissionModule,'criar');
    const canEdit = podeFazerModulo(permissionModule,'editar');
    return header(title || 'Rastreio de Encomendas', records.length+' encomendas registadas', 'var(--success)',
      canCreate ? '<button class="btn btn-success" onclick="criarRastreioEncomenda()"><i class="fas fa-plus"></i> Nova encomenda</button>' : '', 'fa-map-marked-alt') +
      '<div class="card"><div class="form-grid">' +
      '<div class="form-group"><label>Código de rastreio</label><input id="rastreioCodigo" placeholder="Código atribuído à encomenda"></div>' +
      '<div class="form-group"><label>Referência do pedido</label><input id="rastreioPedido" placeholder="Número do pedido / venda"></div>' +
      '<div class="form-group"><label>Produto / descrição</label><input id="rastreioProduto" placeholder="Descrição da encomenda"></div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" onclick="rastrearEncomenda()">Consultar código</button>' +
      (canCreate ? '<button class="btn btn-success" onclick="criarRastreioEncomenda()">Criar rastreio</button>' : '') +
      (canEdit ? '<button class="btn btn-info" onclick="pararGPSRastreio()">Parar GPS ao vivo</button>' : '') + '</div>' +
      '<div id="rastreioResultado" class="alert alert-info" style="display:none;margin-top:12px"></div></div>' +
      '<div class="card"><div id="kanawaTrackingMap" style="height:360px;width:100%;border-radius:10px;z-index:1"></div>' +
      '<p class="text-muted" style="margin-top:8px;font-size:.78rem">A posição vem do GPS do dispositivo autorizado. O rastreio ao vivo exige a aplicação aberta e permissão de localização.</p></div>' +
      '<div class="card">' + table(['Código','Pedido','Produto','Estado','Localização','Atualizado','Ações'], records.map(function (r) {
        const has = Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng));
        const loc = has ? Number(r.lat).toFixed(5)+', '+Number(r.lng).toFixed(5) : 'Sem posição GPS';
        const actions = canEdit ? '<button class="btn btn-sm btn-primary" onclick="atualizarLocalizacaoEncomenda('+Number(r.id)+')">Atualizar GPS</button> <button class="btn btn-sm btn-info" onclick="iniciarGPSRastreio('+Number(r.id)+')">GPS ao vivo</button>' : '';
        return ['<strong>'+safe(r.codigo || '-')+'</strong>',safe(r.pedido_ref || '-'),safe(r.produto || '-'),badge(r.status || 'pendente',r.status==='entregue'?'success':'warning'),safe(loc),fmtDT(r.ultimaAtualizacao || r.data),actions];
      })) + '</div>';
  }
  async function renderEcommerceTracking() { return await renderTracking('Rastreio de Encomendas E-commerce'); }
  async function initTrackingMap() {
    const records = await getData('rastreios') || [];
    try {
      await ensureLeaflet();
      const map = maps.kanawaTrackingMap || createMap('kanawaTrackingMap');
      if (!map) return;
      clearLayers('kanawaTrackingMap');
      const points = records.filter(hasVerifiedPosition);
      points.forEach(r=>addMarker('kanawaTrackingMap',r.lat,r.lng,r.codigo || 'Encomenda',(r.status || 'Estado não indicado')+' · '+(r.produto || 'Encomenda')));
      if (points.length) { const b=window.L.featureGroup(mapLayers.kanawaTrackingMap).getBounds(); if(b.isValid())map.fitBounds(b,{padding:[24,24],maxZoom:15}); }
    } catch(error) { const el=document.getElementById('kanawaTrackingMap'); if(el)el.textContent='Mapa indisponível: '+error.message; }
  }
  async function createTracking() {
    const code=text(document.getElementById('rastreioCodigo') && document.getElementById('rastreioCodigo').value).trim();
    const order=text(document.getElementById('rastreioPedido') && document.getElementById('rastreioPedido').value).trim();
    const product=text(document.getElementById('rastreioProduto') && document.getElementById('rastreioProduto').value).trim();
    if(!code){notify('Indique um código de rastreio.','warning');return;}
    const records=await getData('rastreios')||[];
    if(records.some(r=>text(r.codigo).toLowerCase()===code.toLowerCase())){notify('Já existe um rastreio com esse código.','warning');return;}
    try{await saveData('rastreios',{codigo:code,pedido_ref:order,produto:product,status:'preparando',ultimaAtualizacao:now(),data:now()});notify('Rastreio criado. A localização será registada quando o motorista partilhar o GPS.','success');openModule(currentModule);}
    catch(e){notify(e.message||'Não foi possível criar o rastreio.','error');}
  }
  async function searchTracking() {
    const code=text(document.getElementById('rastreioCodigo')&&document.getElementById('rastreioCodigo').value).trim();
    if(!code){notify('Informe o código de rastreio.','warning');return;}
    const records=await getData('rastreios')||[];
    const r=records.find(x=>text(x.codigo).toLowerCase()===code.toLowerCase());
    const out=document.getElementById('rastreioResultado');
    if(!r){if(out){out.style.display='block';out.textContent='Não foi encontrado nenhum registo com este código.';}return;}
    const has=hasVerifiedPosition(r);
    if(out){out.style.display='block';out.textContent='Encomenda '+r.codigo+' · Estado: '+(r.status||'não indicado')+' · Atualizado: '+(r.ultimaAtualizacao||r.data||'não disponível')+(has?' · GPS: '+r.lat+', '+r.lng:' · Ainda sem posição GPS.');}
  }
  async function updateTrackingLocation(id) {
    if(!podeFazerModulo(trackingPermissionModule(),'editar')){notify('Precisa de permissão para atualizar o GPS.','error');return;}
    try{
      const record=await DB.get('rastreios',id);if(!record)throw new Error('Encomenda não encontrada.');
      const p=await getPosition();record.lat=p.lat;record.lng=p.lng;record.gps_accuracy_m=Math.round(p.accuracy);
      record.location_source='device_gps';record.ultimaAtualizacao=now();await saveData('rastreios',record);
      notify('Localização da encomenda atualizada.','success');openModule(currentModule);
    }catch(e){notify(e.message||'Não foi possível atualizar o GPS.','error');}
  }
  function startLiveTracking(id) {
    if(!podeFazerModulo(trackingPermissionModule(),'editar')){notify('Precisa de permissão para iniciar o GPS ao vivo.','error');return;}
    if(!navigator.geolocation){notify('Este dispositivo não disponibiliza GPS.','warning');return;}
    stopLiveTracking();trackingTargetId=id;lastTrackingWrite=0;
    trackingWatchId=navigator.geolocation.watchPosition(async function(position){
      const t=Date.now();if(t-lastTrackingWrite<30000)return;lastTrackingWrite=t;
      try{const r=await DB.get('rastreios',trackingTargetId);if(!r)return;r.lat=position.coords.latitude;r.lng=position.coords.longitude;
        r.gps_accuracy_m=Math.round(position.coords.accuracy);r.location_source='device_gps_live';r.ultimaAtualizacao=now();
        await saveData('rastreios',r);await initTrackingMap();
      }catch(e){console.warn('GPS de encomenda:',e);}
    },function(error){notify('GPS ao vivo interrompido: '+error.message,'error');stopLiveTracking();},
    {enableHighAccuracy:true,maximumAge:5000,timeout:20000});
    notify('GPS ao vivo iniciado. Mantenha a aplicação aberta e permita a localização.','success');
  }
  async function renderFleetGPS() {
    const vehicles=await getData('gpsTracking')||[];
    const canEdit=podeFazerModulo('frota-gps','editar')||podeFazerModulo('frota-gps','criar');
    return header('GPS da Frota',vehicles.length+' veículos registados','var(--success)',
      canEdit?'<button class="btn btn-success" onclick="adicionarGPS()"><i class="fas fa-plus"></i> Registar veículo</button>':'','fa-satellite')+
      '<div class="card"><div id="kanawaGpsMap" style="height:360px;width:100%;border-radius:10px;z-index:1"></div><p class="text-muted" style="margin-top:8px;font-size:.78rem">A posição é recolhida pelo GPS do dispositivo autorizado. Não são usadas coordenadas simuladas.</p></div>'+
      '<div class="card">'+table(['Veículo','Latitude','Longitude','Precisão','Atualização','Ações'],vehicles.map(function(v){
        const has=hasVerifiedPosition(v);
        return ['<strong>'+safe(v.veiculo||'-')+'</strong>',has?Number(v.lat).toFixed(5):'-',has?Number(v.lng).toFixed(5):'-',
          v.gps_accuracy_m?Math.round(v.gps_accuracy_m)+' m':'-',fmtDT(v.ultimaAtualizacao),
          canEdit?'<button class="btn btn-sm btn-primary" onclick="atualizarGPSVeiculo('+Number(v.id)+')">Atualizar GPS</button>':''];
      }))+'</div>';
  }
  async function initGpsMap() {
    const vehicles=await getData('gpsTracking')||[];
    try{await ensureLeaflet();const map=maps.kanawaGpsMap||createMap('kanawaGpsMap');if(!map)return;clearLayers('kanawaGpsMap');
      const points=vehicles.filter(hasVerifiedPosition);
      points.forEach(v=>addMarker('kanawaGpsMap',v.lat,v.lng,v.veiculo||'Veículo','Atualizado: '+(v.ultimaAtualizacao||'não disponível')));
      if(points.length){const b=window.L.featureGroup(mapLayers.kanawaGpsMap).getBounds();if(b.isValid())map.fitBounds(b,{padding:[24,24],maxZoom:15});}
    }catch(e){const el=document.getElementById('kanawaGpsMap');if(el)el.textContent='Mapa indisponível: '+e.message;}
  }
  async function addGPSVehicle() {
    const vehicle=prompt('Identificação ou matrícula do veículo:');if(!vehicle)return;
    try{await saveData('gpsTracking',{veiculo:vehicle.trim(),ultimaAtualizacao:null,location_source:null});notify('Veículo registado. Atualize a posição quando o GPS estiver disponível.','success');openModule('frota-gps');}
    catch(e){notify(e.message||'Não foi possível registar o veículo.','error');}
  }
  async function updateGPSVehicle(id) {
    if(!podeFazerModulo('frota-gps','editar')&&!podeFazerModulo('frota-gps','criar')){notify('Não tem permissão para atualizar a posição da frota.','error');return;}
    try{const r=await DB.get('gpsTracking',id);if(!r)throw new Error('Veículo não encontrado.');
      const p=await getPosition();r.lat=p.lat;r.lng=p.lng;r.gps_accuracy_m=Math.round(p.accuracy);r.location_source='device_gps';r.ultimaAtualizacao=now();
      await saveData('gpsTracking',r);notify('Posição GPS do veículo atualizada.','success');openModule('frota-gps');
    }catch(e){notify(e.message||'Não foi possível atualizar a posição.','error');}
  }

  window.KanawaMaps = {
    destroy:destroy, stopLiveTracking:stopLiveTracking,
    renderRoutes:renderRoutes, renderTracking:renderTracking, renderEcommerceTracking:renderEcommerceTracking, renderFleetGPS:renderFleetGPS,
    initRouteMap:initRouteMap, initTrackingMap:initTrackingMap, initGpsMap:initGpsMap,
    calculateRoute:calculateRoute, useCurrentLocation:useCurrentLocation, saveRoute:saveRoute, optimizeRoutes:optimizeRoutes,
    createTracking:createTracking, searchTracking:searchTracking, updateTrackingLocation:updateTrackingLocation,
    startLiveTracking:startLiveTracking, addGPSVehicle:addGPSVehicle, updateGPSVehicle:updateGPSVehicle
  };
})();
