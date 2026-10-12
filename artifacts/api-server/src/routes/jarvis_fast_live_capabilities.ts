import { Router, type IRouter } from "express";

const router: IRouter = Router();

type DeviceAction = {
  type: "open_external_url";
  provider: string;
  uri?: string;
  fallbackUrl: string;
  label?: string;
};

function lastUserMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const messages = Reflect.get(body, "messages");
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object" || Reflect.get(message, "role") !== "user") continue;
    const content = Reflect.get(message, "content");
    return typeof content === "string" ? content.trim() : null;
  }
  return null;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function writeSse(res: any, content: string, extra: Record<string, unknown> = {}) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
  res.write(`data: ${JSON.stringify({ done: true, ...extra })}\n\n`);
  res.end();
}

function detectGenericMusicIntent(text: string) {
  const normalized = normalize(text);
  const hasMusic = /\b(musica|som|spotify|playlist|faixa|album|artista)\b/.test(normalized);
  const wantsPlayback = /\b(quero|queria|gostaria|toca|toque|tocar|coloca|coloque|ouvir|escutar|abra|abrir)\b/.test(normalized);
  // Verbo de reprodução musical ("toca/coloca/ouvir/escutar X") já indica intenção de música,
  // mesmo sem um substantivo como "música" (ex.: "quero ouvir Time do Pink Floyd").
  const musicVerb = /\b(toca|toque|tocar|coloca|coloque|colocar|ouvir|escutar)\b/.test(normalized);
  return (hasMusic && wantsPlayback) || musicVerb;
}

function extractSpecificMusicQuery(text: string): string | null {
  const value = text
    .replace(/^\s*jarvis[, ]*/i, "")
    .replace(/^\s*(eu\s+)?(quero|queria|gostaria de)?\s*(ouvir|escutar|tocar|toque|toca|colocar|coloque|coloca|abrir|abra)?\s*/i, "")
    .replace(/^\s*(uma|a|um|o)?\s*(m[uú]sica|som|faixa|[aá]lbum|playlist)?\s*/i, "")
    .replace(/\s+(no|na|pelo|pela)\s+spotify\s*$/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
  const generic = /^(agora|qualquer uma|alguma coisa|uma musica|música)?$/i.test(value);
  return value.length >= 2 && !generic ? value.slice(0, 300) : null;
}

function spotifyAction(query?: string | null): DeviceAction {
  if (!query) {
    return {
      type: "open_external_url",
      provider: "spotify",
      uri: "spotify://",
      fallbackUrl: "https://open.spotify.com/",
      label: "Spotify",
    };
  }
  const encoded = encodeURIComponent(query);
  return {
    type: "open_external_url",
    provider: "spotify",
    uri: `spotify:search:${encoded}`,
    fallbackUrl: `https://open.spotify.com/search/${encoded}`,
    label: query,
  };
}

function detectWeatherIntent(text: string) {
  const normalized = normalize(text);
  return /\b(previsao do tempo|tempo hoje|clima hoje|vai chover|chuva hoje|temperatura hoje|como esta o tempo|como ta o tempo|tempo agora)\b/.test(normalized)
    || (/\b(tempo|clima|chuva|temperatura)\b/.test(normalized) && /\b(hoje|agora|amanha|previsao)\b/.test(normalized));
}

function extractWeatherLocation(text: string): string | null {
  const cleaned = text.replace(/^\s*jarvis[, ]*/i, "").replace(/[?!]+$/g, "").trim();
  const patterns = [
    /(?:previs[aã]o do tempo|tempo|clima|chuva|temperatura)\s+(?:hoje\s+|agora\s+)?(?:em|para|de)\s+(.+)$/i,
    /(?:em|para)\s+([\p{L}][\p{L}\s.'-]{1,80})$/iu,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const location = match?.[1]?.trim().replace(/\s+(hoje|agora|amanh[aã])$/i, "");
    if (location && location.length >= 2) return location.slice(0, 100);
  }
  return null;
}

async function fetchJson(url: string, timeoutMs = 4500): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "VendorAI-Jarvis/1.0" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function weatherDescription(code: number) {
  if (code === 0) return "céu limpo";
  if ([1, 2].includes(code)) return "parcialmente nublado";
  if (code === 3) return "nublado";
  if ([45, 48].includes(code)) return "neblina";
  if ([51, 53, 55, 56, 57].includes(code)) return "garoa";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "chuva";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "neve";
  if ([95, 96, 99].includes(code)) return "trovoadas";
  return "condição variável";
}

async function loadWeather(location: string) {
  const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=pt&format=json`);
  const place = geo?.results?.[0];
  if (!place || !Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) return null;

  const forecast = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(place.latitude)}&longitude=${encodeURIComponent(place.longitude)}&current=temperature_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=auto`,
  );
  const current = forecast?.current;
  if (!current) return null;
  const probabilities = Array.isArray(forecast?.hourly?.precipitation_probability)
    ? forecast.hourly.precipitation_probability.map(Number).filter(Number.isFinite)
    : [];
  const maxRainProbability = probabilities.length ? Math.max(...probabilities) : null;

  return {
    label: [place.name, place.admin1].filter(Boolean).join(", "),
    temperature: Number(current.temperature_2m),
    apparent: Number(current.apparent_temperature),
    wind: Number(current.wind_speed_10m),
    code: Number(current.weather_code),
    maxRainProbability,
  };
}

router.post("/support/chat", async (req, res, next) => {
  const text = lastUserMessage(req.body);
  if (!text) return next();

  if (detectWeatherIntent(text)) {
    const location = extractWeatherLocation(text);
    if (!location) {
      writeSse(res, "Consigo consultar a previsão em tempo real. Me diga apenas a cidade — por exemplo: “tempo em Chapecó”.", {
        jarvisFastCapability: "weather",
        status: "needs_location",
      });
      return;
    }

    try {
      const weather = await loadWeather(location);
      if (!weather) {
        writeSse(res, `Não localizei “${location}”. Me diga a cidade e o estado para eu consultar a previsão certa.`, {
          jarvisFastCapability: "weather",
          status: "location_not_found",
        });
        return;
      }
      const rainText = weather.maxRainProbability == null
        ? "probabilidade de chuva indisponível"
        : `chance máxima de chuva hoje em torno de ${Math.round(weather.maxRainProbability)}%`;
      writeSse(
        res,
        `${weather.label}: agora ${Math.round(weather.temperature)}°C, sensação de ${Math.round(weather.apparent)}°C, ${weatherDescription(weather.code)} e ${rainText}. Vento em torno de ${Math.round(weather.wind)} km/h.`,
        {
          jarvisFastCapability: "weather",
          status: "executed",
          provider: "Open-Meteo",
          observedAt: new Date().toISOString(),
          location: weather.label,
        },
      );
    } catch (err) {
      req.log?.warn({ err, location }, "jarvis: weather provider failed");
      writeSse(res, "A consulta do tempo falhou agora. Tente novamente em alguns segundos; não vou inventar uma previsão sem fonte atual.", {
        jarvisFastCapability: "weather",
        status: "provider_failed",
      });
    }
    return;
  }

  if (detectGenericMusicIntent(text)) {
    const query = extractSpecificMusicQuery(text);
    writeSse(
      res,
      query ? `Vou abrir “${query}” no Spotify.` : "Vou abrir o Spotify agora. Se quiser, diga o nome da música, artista ou playlist e eu abro a busca direto.",
      {
        jarvisFastCapability: "music",
        clientAction: spotifyAction(query),
        executionMode: "device_open",
        playbackConfirmed: false,
      },
    );
    return;
  }

  return next();
});

export { detectWeatherIntent, extractWeatherLocation, detectGenericMusicIntent, extractSpecificMusicQuery };
export default router;
