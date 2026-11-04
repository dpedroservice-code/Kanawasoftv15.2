(function () {
  'use strict';
  let map = null;
  let mapContainer = null;
  let watchId = null;
  let currentMarker = null;
  const vehicleMarkers = new Map();
  let gpsRecordId = null;
  let lastSavedAt = 0;

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      if (!document.getElementById('kanawaLeafletCss')) {
        const link = document.createElement('link');
        link.id = 'kanawaLeafletCss';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const existing = document.getElementById('kanawaLeafletJs');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        if (window.L) resolve();
        return;
      }
      const script = document.createElement('script');
      script.id = 'kanawaLeafletJs';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      script.onerror = function () { reject(new Error('A biblioteca do mapa não carregou. Verifique a internet.')); };
      document.head.appendChild(script);
    });
  }

  function mapStatus(message, isError) {
    const el = document.getElementById('frotaGpsMapStatus');
    if (el) {
      el.textContent = message;
      el.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
    }
  }

  function addVehicleMarker(item) {
    if (!map || !window.L || !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) return;
    const key = String(item.id || item.veiculo || (item.lat + ':' + item.lng));
    const latlng = [Number(item.lat), Number(item.lng)];
    const label = String(item.veiculo || 'Dispositivo');
    let marker = vehicleMarkers.get(key);
    if (marker) marker.setLatLng(latlng);
    else {
      marker = window.L.marker(latlng).addTo(map);
      vehicleMarkers.set(key, marker);
    }
    marker.bindPopup('<strong>' + label.replace(/[&<>"']/g, '') + '</strong><br>Atualizado: ' + String(item.ultimaAtualizacao || '—'));
  }

  async function refreshMarkers() {
    const rows = await getData('gpsTracking');
    (rows || []).forEach(addVehicleMarker);
  }

  window.renderFrotaGPS = async function () {
    const rows = await getData('gpsTracking') || [];
    const valid = rows.filter(function (item) {
      return item.coordinates_valid === true && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng));
    });
    const tableRows = rows.map(function (item) {
      return ['<strong>' + esc(item.veiculo || 'Dispositivo') + '</strong>', esc(item.lat || '—'), esc(item.lng || '—'),
        esc(item.location_source === 'device' ? 'GPS do dispositivo' : 'Manual'), fmtDT(item.ultimaAtualizacao),
        item.coordinates_valid === true ? '<span class="badge badge-success">Válida</span>' : '<span class="badge badge-warning">A verificar</span>'];
    });
    return header('GPS e Localização da Frota', valid.length + ' posições com coordenadas válidas', 'var(--info)',
      '<button class="btn btn-success" onclick="ativarGPSDispositivo()"><i class="fas fa-location-arrow"></i> Ativar GPS deste dispositivo</button> <button class="btn btn-secondary" onclick="pararGPSDispositivo()"><i class="fas fa-stop"></i> Parar</button>', 'fa-satellite') +
      '<div class="card"><div class="form-grid"><div class="form-group"><label>Veículo / dispositivo</label><input id="frotaGpsVehicle" placeholder="Ex.: Viatura 01"></div><div class="form-group"><label>Modo do mapa</label><div style="padding:10px">Satélite com opção de mapa de ruas</div></div></div>' +
      '<div id="frotaGpsMap" style="height:430px;min-height:320px;width:100%;border-radius:12px;background:var(--bg-hover);overflow:hidden"></div>' +
      '<p id="frotaGpsMapStatus" role="status" style="margin-top:10px;font-size:.85rem">A preparar o mapa. Para partilhar a posição, permita o acesso à localização do dispositivo.</p>' +
      '<p style="font-size:.78rem;color:var(--text-muted);margin-top:6px">O GPS só transmite depois de autorizar no Android. A localização é sincronizada com a empresa ativa; não é ativada em segredo.</p></div>' +
      '<div class="card"><h3 style="margin-bottom:12px">Posições registadas</h3>' + table(['Veículo / dispositivo','Latitude','Longitude','Origem','Última atualização','Validação'], tableRows) + '</div>';
  };

  window.initFrotaGpsMap = async function () {
    const element = document.getElementById('frotaGpsMap');
    if (!element) return;
    await loadLeaflet();
    if (map && mapContainer !== element) { map.remove(); map = null; vehicleMarkers.clear(); currentMarker = null; }
    if (!map) {
      mapContainer = element;
      map = window.L.map(element, { scrollWheelZoom: true }).setView([-11.2, 17.8], 5);
      const satellite = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics'
      }).addTo(map);
      const streets = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      });
      window.L.control.layers({ 'Satélite': satellite, 'Mapa de ruas': streets }).addTo(map);
    } else {
      map.invalidateSize();
    }
    await refreshMarkers();
    mapStatus('Mapa carregado. Escolha Satélite ou Mapa de ruas no controlo do canto superior direito.');
  };

  window.ativarGPSDispositivo = function () {
    if (!navigator.geolocation) {
      mapStatus('Este dispositivo não disponibiliza geolocalização.', true);
      return;
    }
    if (watchId !== null) {
      mapStatus('O GPS deste dispositivo já está ativo.');
      return;
    }
    const vehicleInput = document.getElementById('frotaGpsVehicle');
    const vehicle = vehicleInput && vehicleInput.value.trim() ? vehicleInput.value.trim() : 'Dispositivo Android';
    const companyId = window.KanawaCloud && window.KanawaCloud.context && window.KanawaCloud.context.company
      ? window.KanawaCloud.context.company.id : 'local';
    const storageKey = 'kanawa_gps_record_' + companyId;
    gpsRecordId = localStorage.getItem(storageKey) || null;
    if (gpsRecordId && /^\d+$/.test(gpsRecordId)) gpsRecordId = Number(gpsRecordId);
    mapStatus('A solicitar permissão de localização ao Android…');
    watchId = navigator.geolocation.watchPosition(async function (position) {
      const coords = position.coords;
      const now = Date.now();
      const point = {
        id: gpsRecordId || undefined,
        veiculo: vehicle,
        lat: Number(coords.latitude),
        lng: Number(coords.longitude),
        accuracy_m: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
        speed_mps: Number.isFinite(coords.speed) ? coords.speed : null,
        heading_deg: Number.isFinite(coords.heading) ? coords.heading : null,
        ultimaAtualizacao: new Date(position.timestamp || now).toISOString(),
        location_source: 'device',
        tracking_mode: 'device',
        coordinates_valid: true
      };
      addVehicleMarker(point);
      if (map) {
        if (currentMarker) currentMarker.setLatLng([point.lat, point.lng]);
        else currentMarker = window.L.circleMarker([point.lat, point.lng], { radius: 8, color: '#0ea5e9', fillOpacity: 0.9 }).addTo(map).bindPopup('Localização deste dispositivo');
        map.setView([point.lat, point.lng], Math.max(map.getZoom(), 15));
      }
      if (now - lastSavedAt > 10000) {
        lastSavedAt = now;
        try {
          const savedId = await saveData('gpsTracking', point);
          if (!gpsRecordId && savedId) {
            gpsRecordId = String(savedId);
            localStorage.setItem(storageKey, gpsRecordId);
          }
          mapStatus('GPS ativo. Precisão aproximada: ' + Math.round(coords.accuracy || 0) + ' m. Última atualização: ' + new Date().toLocaleTimeString());
        } catch (error) {
          mapStatus('A posição foi captada, mas não foi possível guardá-la: ' + error.message, true);
        }
      }
    }, function (error) {
      watchId = null;
      const messages = {
        1: 'Permissão de localização recusada. Ative a localização para este site nas definições do Android.',
        2: 'A posição não está disponível. Verifique o GPS e tente novamente.',
        3: 'A localização demorou demasiado tempo. Tente novamente.'
      };
      mapStatus(messages[error.code] || error.message || 'Erro ao obter localização.', true);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  };

  window.pararGPSDispositivo = function () {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    mapStatus('GPS deste dispositivo parado. As posições já guardadas permanecem disponíveis.');
  };

  window.addEventListener('beforeunload', function () {
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  });
})();