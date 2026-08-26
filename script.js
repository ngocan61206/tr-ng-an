/* =========================================================
   CẤU HÌNH — chỉnh các giá trị dưới đây cho đúng với công ty
   ========================================================= */
const CONFIG = {
  // Đơn giá vận chuyển: đồng / km / tấn
  RATE_PER_KM_PER_TON: 15000,

  // Phụ phí cố định mỗi chuyến (bốc xếp, giấy tờ...): đồng
  FIXED_FEE: 200000,

  // Tâm bản đồ mặc định khi chưa nhập điểm nào (hiện đang để Hà Nội)
  MAP_CENTER: { lat: 21.0285, lng: 105.8542 },
  MAP_ZOOM: 6,
};

/* =========================================================
   Không cần sửa phần dưới đây trừ khi muốn đổi logic tính toán
   ========================================================= */

let map, directionsService, directionsRenderer, geocoder;
let originAutocomplete, destAutocomplete;
let originMarker, destMarker;

// Điểm đã chọn — ưu tiên dùng khi tính cước (chính xác hơn text địa chỉ)
let originPoint = null; // { location: google.maps.LatLng, address: string }
let destPoint = null;

// Đang ở chế độ "chọn trên bản đồ" cho trường nào — null nếu không chọn
let pickMode = null; // 'origin' | 'destination' | null

function formatVND(n) {
  return Math.round(n).toLocaleString('vi-VN') + ' đ';
}

function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  map = new google.maps.Map(mapEl, {
    center: CONFIG.MAP_CENTER,
    zoom: CONFIG.MAP_ZOOM,
    disableDefaultUI: true,
    zoomControl: true,
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    polylineOptions: { strokeColor: '#C08A2E', strokeWeight: 5 },
    suppressMarkers: false,
  });
  geocoder = new google.maps.Geocoder();

  // Gợi ý địa chỉ khi gõ (autocomplete)
  originAutocomplete = new google.maps.places.Autocomplete(
    document.getElementById('origin-input'),
    { fields: ['formatted_address', 'geometry'] }
  );
  originAutocomplete.addListener('place_changed', () => {
    const place = originAutocomplete.getPlace();
    if (place.geometry) {
      setPoint('origin', place.geometry.location, place.formatted_address);
    }
  });

  destAutocomplete = new google.maps.places.Autocomplete(
    document.getElementById('destination-input'),
    { fields: ['formatted_address', 'geometry'] }
  );
  destAutocomplete.addListener('place_changed', () => {
    const place = destAutocomplete.getPlace();
    if (place.geometry) {
      setPoint('destination', place.geometry.location, place.formatted_address);
    }
  });

  // Chọn điểm bằng cách bấm trực tiếp lên bản đồ
  map.addListener('click', (e) => {
    if (!pickMode) return;
    reverseGeocodeAndSet(pickMode, e.latLng);
  });

  document.getElementById('map-placeholder').style.display = 'none';
  mapEl.style.display = 'block';
}

// Called automatically if the Google Maps script fails to load
// (e.g. missing/invalid API key) — keeps the page usable.
window.gm_authFailure = function () {
  const note = document.getElementById('dev-note');
  if (note) note.classList.add('show');
};

function reverseGeocodeAndSet(target, latLng) {
  geocoder.geocode({ location: latLng }, (results, status) => {
    const address = status === 'OK' && results[0]
      ? results[0].formatted_address
      : `${latLng.lat().toFixed(5)}, ${latLng.lng().toFixed(5)}`;
    setPoint(target, latLng, address);
    exitPickMode();
  });
}

function setPoint(target, location, address) {
  const point = { location, address };
  const inputId = target === 'origin' ? 'origin-input' : 'destination-input';
  document.getElementById(inputId).value = address;

  if (target === 'origin') {
    originPoint = point;
    if (originMarker) originMarker.setMap(null);
    originMarker = new google.maps.Marker({ position: location, map, label: 'A' });
  } else {
    destPoint = point;
    if (destMarker) destMarker.setMap(null);
    destMarker = new google.maps.Marker({ position: location, map, label: 'B' });
  }

  map.panTo(location);
  if (map.getZoom() < 11) map.setZoom(12);
}

function enterPickMode(target) {
  pickMode = target;
  document.getElementById('map-placeholder').style.display = 'none';
  document.getElementById('map').style.display = 'block';

  const banner = document.getElementById('pick-banner');
  banner.textContent = target === 'origin'
    ? 'Bấm vào bản đồ để chọn điểm đi'
    : 'Bấm vào bản đồ để chọn điểm đến';
  banner.classList.add('show');

  document.getElementById('pick-origin-btn').classList.toggle('active', target === 'origin');
  document.getElementById('pick-destination-btn').classList.toggle('active', target === 'destination');
}

function exitPickMode() {
  pickMode = null;
  document.getElementById('pick-banner').classList.remove('show');
  document.getElementById('pick-origin-btn').classList.remove('active');
  document.getElementById('pick-destination-btn').classList.remove('active');
}

function calculateQuote() {
  const originText = document.getElementById('origin-input').value.trim();
  const destText = document.getElementById('destination-input').value.trim();
  const tonnage = parseFloat(document.getElementById('tonnage-input').value);

  if (!originText || !destText) {
    alert('Vui lòng nhập điểm đi và điểm đến.');
    return;
  }
  if (!tonnage || tonnage <= 0) {
    alert('Vui lòng nhập số tấn hàng hợp lệ.');
    return;
  }
  if (!directionsService) {
    alert('Bản đồ chưa sẵn sàng. Vui lòng kiểm tra kết nối hoặc thử lại sau.');
    return;
  }

  // Ưu tiên dùng tọa độ đã chọn (chính xác hơn), nếu không có thì dùng text đã nhập
  const origin = (originPoint && originPoint.address === originText) ? originPoint.location : originText;
  const destination = (destPoint && destPoint.address === destText) ? destPoint.location : destText;

  directionsService.route(
    { origin, destination, travelMode: google.maps.TravelMode.DRIVING },
    (result, status) => {
      if (status !== 'OK') {
        alert('Không tìm được tuyến đường phù hợp. Vui lòng kiểm tra lại địa điểm.');
        return;
      }

      directionsRenderer.setDirections(result);
      // DirectionsRenderer tự vẽ marker A/B nên ẩn bớt marker thủ công để khỏi trùng
      if (originMarker) originMarker.setMap(null);
      if (destMarker) destMarker.setMap(null);

      const leg = result.routes[0].legs[0];
      const distanceKm = leg.distance.value / 1000;
      const total = distanceKm * tonnage * CONFIG.RATE_PER_KM_PER_TON + CONFIG.FIXED_FEE;

      renderWaybill({
        originText: leg.start_address,
        destText: leg.end_address,
        distanceKm,
        tonnage,
        total,
      });
    }
  );
}

function renderWaybill({ originText, destText, distanceKm, tonnage, total }) {
  const wb = document.getElementById('waybill');
  document.getElementById('wb-route').textContent = `${originText}  →  ${destText}`;
  document.getElementById('wb-distance').textContent = `${distanceKm.toFixed(1)} km`;
  document.getElementById('wb-tonnage').textContent = `${tonnage} tấn`;
  document.getElementById('wb-rate').textContent = `${formatVND(CONFIG.RATE_PER_KM_PER_TON)} / km / tấn`;
  document.getElementById('wb-total').textContent = formatVND(total);
  wb.classList.add('show');
  wb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('calc-button').addEventListener('click', calculateQuote);

  document.getElementById('pick-origin-btn').addEventListener('click', () => {
    pickMode === 'origin' ? exitPickMode() : enterPickMode('origin');
  });
  document.getElementById('pick-destination-btn').addEventListener('click', () => {
    pickMode === 'destination' ? exitPickMode() : enterPickMode('destination');
  });
});
