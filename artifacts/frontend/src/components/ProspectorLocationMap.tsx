import { useMemo, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const DEFAULT_CENTER: [number, number] = [-27.0965, -52.6183];

export type ProspectorGeoArea = { lat: number; lng: number; label: string; radiusKm: number };

function MapClick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

function Recenter({ point }: { point: { lat: number; lng: number } | null }) {
  const map = useMap();
  if (point) map.setView([point.lat, point.lng], Math.max(map.getZoom(), 12));
  return null;
}

async function reverseGeocode(lat: number, lng: number) {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=pt-BR`);
  if (!response.ok) throw new Error("Não foi possível identificar a localização.");
  const data = await response.json() as { display_name?: string; address?: Record<string, string> };
  const a = data.address ?? {};
  const city = a.city || a.town || a.village || a.municipality || a.county;
  const state = a.state_code || a.state;
  return city && state ? `${city}, ${state}` : data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function ProspectorLocationMap({
  values,
  onChange,
  maxItems = 20,
  onAreaAdd,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  maxItems?: number;
  onAreaAdd?: (area: ProspectorGeoArea) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = useState("");
  const [radiusKm, setRadiusKm] = useState(25);
  const [busy, setBusy] = useState(false);

  const display = useMemo(() => point ? `${label || "Ponto selecionado"} · raio ${radiusKm} km` : "", [label, point, radiusKm]);

  async function pick(lat: number, lng: number) {
    setPoint({ lat, lng });
    setBusy(true);
    try { setLabel(await reverseGeocode(lat, lng)); } catch { setLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); } finally { setBusy(false); }
  }

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(query.trim())}`);
      const data = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
      const first = data[0];
      if (!first) return;
      setPoint({ lat: Number(first.lat), lng: Number(first.lon) });
      setLabel(first.display_name.split(",").slice(0, 2).join(",").trim());
    } finally { setBusy(false); }
  }

  function add() {
    if (!point || !label || values.length >= maxItems) return;
    const normalized = label.trim();
    if (!values.some((v) => v.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"))) {
      onChange([...values, normalized].slice(0, maxItems));
    }
    onAreaAdd?.({ lat: point.lat, lng: point.lng, label: normalized, radiusKm });
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen((v) => !v)}>
        <MapPin className="h-3.5 w-3.5" />{open ? "Fechar mapa" : "Selecionar no mapa"}
      </Button>
      {open && (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
          <div className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} placeholder="Endereço, cidade, bairro ou CEP" />
            <Button type="button" variant="secondary" onClick={() => void search()} disabled={busy || !query.trim()}><Search className="h-4 w-4" /></Button>
          </div>
          <div className="h-[280px] overflow-hidden rounded-xl border">
            <MapContainer center={point ? [point.lat, point.lng] : DEFAULT_CENTER} zoom={point ? 12 : 8} style={{ height: "100%", width: "100%" }}>
              <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapClick onPick={(lat, lng) => void pick(lat, lng)} />
              <Recenter point={point} />
              {point && <>
                <Circle center={[point.lat, point.lng]} radius={radiusKm * 1000} pathOptions={{ fillOpacity: 0.08 }} />
                <Marker position={[point.lat, point.lng]} icon={defaultIcon} draggable eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); void pick(p.lat, p.lng); } }} />
              </>}
            </MapContainer>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="space-y-1.5">
              <Label>Localização identificada</Label>
              <div className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm">{busy ? "Identificando..." : (label || "Clique no mapa ou pesquise acima.")}</div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label>Raio</Label><Badge variant="secondary">{radiusKm} km</Badge></div>
              <input type="range" min={1} max={100} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="h-10 w-full accent-primary" />
            </div>
          </div>
          {point && <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{display} · {point.lat.toFixed(5)}, {point.lng.toFixed(5)}</p><Button type="button" size="sm" onClick={add} disabled={busy || !label}>Adicionar localização</Button></div>}
          <p className="text-[11px] text-muted-foreground">Você pode pesquisar, clicar no mapa ou arrastar o pino. Repita para adicionar várias regiões.</p>
        </div>
      )}
    </div>
  );
}
