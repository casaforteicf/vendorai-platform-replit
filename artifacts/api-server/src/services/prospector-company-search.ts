export type ProspectorCompanySearchResult = {
  nomeEmpresa: string;
  endereco: string | null;
  telefone: string | null;
  whatsapp: string | null;
  rating: number | null;
  reviewCount: number | null;
  siteOficial: string | null;
};

function deriveWhatsapp(telefone: string | null): string | null {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, "");
  const local = digits.length > 11 ? digits.slice(-11) : digits;
  return local.length === 11 && local[2] === "9" ? telefone : null;
}

export async function searchProspectorCompanies(input: {
  atividade: string;
  localidade: string;
  maxResults?: number;
}): Promise<{ query: string; results: ProspectorCompanySearchResult[] }> {
  const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY não configurada");

  const atividade = input.atividade.trim();
  const localidade = input.localidade.trim();
  if (atividade.length < 2 || localidade.length < 2) {
    throw new Error("atividade e localidade são obrigatórias");
  }

  const maxResults = Math.min(Math.max(Number(input.maxResults ?? 10), 1), 20);
  const query = `${atividade} em ${localidade}`;

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "pt-BR",
      maxResultCount: maxResults,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Places API erro ${response.status}`);
  }

  const data = await response.json() as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      nationalPhoneNumber?: string;
      websiteUri?: string;
    }>;
  };

  const results = (data.places ?? [])
    .filter((place) => Boolean(place.displayName?.text))
    .map((place) => ({
      nomeEmpresa: place.displayName!.text!,
      endereco: place.formattedAddress ?? null,
      telefone: place.nationalPhoneNumber ?? null,
      whatsapp: deriveWhatsapp(place.nationalPhoneNumber ?? null),
      rating: typeof place.rating === "number" ? place.rating : null,
      reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
      siteOficial: place.websiteUri ?? null,
    }));

  return { query, results };
}
