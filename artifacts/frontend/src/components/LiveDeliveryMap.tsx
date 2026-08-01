import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
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

interface LiveDeliveryMapProps {
  lat: number;
  lng: number;
  label?: string;
  updatedAt?: string | null;
  height?: number;
}

// Mapa ao vivo da entrega — sem chave de API (OpenStreetMap via Leaflet).
export function LiveDeliveryMap({ lat, lng, label, updatedAt, height = 260 }: LiveDeliveryMapProps) {
  return (
    <div style={{ height }} className="rounded-xl overflow-hidden border">
      <MapContainer center={[lat, lng]} zoom={14} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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
