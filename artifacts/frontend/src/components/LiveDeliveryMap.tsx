import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet quebra sem isso em builds com bundler (os ícones padrão vêm de
// URLs relativas que o Vite não resolve sozinho).
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const originIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#16a34a;border:2px solid white;box-shadow:0 0 0 1px #16a34a"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const destIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#dc2626;border:2px solid white;box-shadow:0 0 0 1px #dc2626"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface LiveDeliveryMapProps {
  lat: number;
  lng: number;
  label?: string;
  updatedAt?: string | null;
  height?: number;
  // Rastro do trajeto percorrido — se vier, desenha a linha, não só a
  // bolinha da posição atual.
  route?: { lat: number; lng: number }[];
  // Pontos de coleta/entrega, quando marcados no mapa (opcional).
  origin?: { lat: number; lng: number } | null;
  destination?: { lat: number; lng: number } | null;
}

// Mapa ao vivo da entrega — sem chave de API (OpenStreetMap via Leaflet).
export function LiveDeliveryMap({ lat, lng, label, updatedAt, height = 260, route, origin, destination }: LiveDeliveryMapProps) {
  const bounds: [number, number][] = [
    [lat, lng],
    ...(route ?? []).map((p): [number, number] => [p.lat, p.lng]),
    ...(origin ? [[origin.lat, origin.lng] as [number, number]] : []),
    ...(destination ? [[destination.lat, destination.lng] as [number, number]] : []),
  ];

  return (
    <div style={{ height }} className="rounded-xl overflow-hidden border">
      <MapContainer
        center={[lat, lng]}
        zoom={14}
        bounds={bounds.length > 1 ? bounds : undefined}
        boundsOptions={{ padding: [24, 24] }}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {route && route.length > 1 && (
          <Polyline positions={route.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#2563eb", weight: 3, opacity: 0.7 }} />
        )}

        {origin && <Marker position={[origin.lat, origin.lng]} icon={originIcon}><Popup>Coleta</Popup></Marker>}
        {destination && <Marker position={[destination.lat, destination.lng]} icon={destIcon}><Popup>Entrega</Popup></Marker>}

        <Marker position={[lat, lng]} icon={defaultIcon}>
          {(label || updatedAt) && (
            <Popup>
              {label}
              {updatedAt && (
                <div className="text-xs text-muted-foreground mt-1">
                  Atualizado {new Date(updatedAt).toLocaleTimeString("pt-BR")}
                </div>
              )}
            </Popup>
          )}
        </Marker>
      </MapContainer>
    </div>
  );
}
