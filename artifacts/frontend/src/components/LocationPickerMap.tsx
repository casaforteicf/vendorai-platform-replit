import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Centro padrão — Chapecó/SC, mercado inicial do Vendor.ai. Só usado quando
// não há nenhum ponto ainda e o navegador não deu a localização.
const DEFAULT_CENTER: [number, number] = [-27.0965, -52.6183];

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface LocationPickerMapProps {
  value: { lat: number; lng: number } | null;
  onChange: (point: { lat: number; lng: number } | null) => void;
  height?: number;
}

// Mapa interativo pra marcar um ponto exato (coleta/entrega) clicando —
// complementa o endereço em texto quando ele não é preciso o bastante.
export function LocationPickerMap({ value, onChange, height = 220 }: LocationPickerMapProps) {
  const [center] = useState<[number, number]>(value ? [value.lat, value.lng] : DEFAULT_CENTER);

  return (
    <div className="space-y-2">
      <div style={{ height }} className="rounded-xl overflow-hidden border">
        <MapContainer center={center} zoom={value ? 15 : 12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickCapture onPick={(lat, lng) => onChange({ lat, lng })} />
          {value && <Marker position={[value.lat, value.lng]} icon={defaultIcon} />}
        </MapContainer>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : "Toque no mapa pra marcar o ponto exato"}
        </p>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} className="h-auto py-1 text-xs">
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
