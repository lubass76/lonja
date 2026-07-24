// api/search-productores.js
// Clonado de api/search.js (Experience Prospector) y adaptado:
// en vez de una única query de prospección, lanza varias búsquedas en
// paralelo — una por categoría de producto español — sobre la misma
// localidad, y devuelve todo combinado y etiquetado por categoría.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY no configurada.' });

  const { location, radius = 15000, categorias } = req.body || {};
  if (!location) return res.status(400).json({ error: 'location es obligatorio.' });

  // Categorías de producto español — cada una es una query independiente de
  // Google Places Text Search. Fácil de ampliar a otras verticales (moda,
  // artesanía, cosmética...) en el futuro añadiendo entradas aquí.
  const CATEGORIAS = [
    { id: 'aceite',    label: 'Aceite de oliva',      query: 'productor de aceite de oliva virgen extra' },
    { id: 'vino',      label: 'Vino',                 query: 'bodega de vinos' },
    { id: 'queso',     label: 'Queso',                query: 'quesería artesanal' },
    { id: 'miel',      label: 'Miel',                 query: 'apicultor productor de miel' },
    { id: 'jamon',     label: 'Jamón y embutido',     query: 'jamonería ibéricos embutidos artesanos' },
    { id: 'conservas', label: 'Conservas',            query: 'conservas artesanas' },
    { id: 'pan',       label: 'Pan y repostería',     query: 'panadería artesana horno tradicional' },
    { id: 'carne',     label: 'Carne',                query: 'carnicería de productor local' },
    { id: 'huerta',    label: 'Fruta y verdura',      query: 'productor de fruta y verdura de huerta' },
  ];

  const categoriasActivas = Array.isArray(categorias) && categorias.length
    ? CATEGORIAS.filter(c => categorias.includes(c.id))
    : CATEGORIAS;

  try {
    // Geocodifica la localidad UNA sola vez (igual que search.js original).
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
    const geocodeRes = await fetch(geocodeUrl);
    const geocodeData = await geocodeRes.json();

    if (!geocodeData.results || geocodeData.results.length === 0) {
      throw new Error(`No se encontró la localidad: ${location}`);
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;

    // Lanza una Text Search por categoría, en paralelo, centrada en el punto geocodificado.
    const busquedas = await Promise.all(categoriasActivas.map(async (cat) => {
      const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(cat.query)}&location=${lat},${lng}&radius=${radius}&key=${apiKey}`;
      const r = await fetch(placesUrl);
      const data = await r.json();
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.warn(`[search-productores] ${cat.id}: ${data.status}`);
        return { categoria: cat, results: [] };
      }
      return { categoria: cat, results: data.results || [] };
    }));

    // Combina y deduplica por place_id — un mismo local puede aparecer en más
    // de una categoría (ej. una tienda de "productos españoles" generalista).
    const vistos = new Map();
    for (const { categoria, results } of busquedas) {
      for (const place of results) {
        if (vistos.has(place.place_id)) {
          vistos.get(place.place_id).categorias.push(categoria.id);
          continue;
        }
        vistos.set(place.place_id, {
          id: place.place_id,
          nombre: place.name,
          direccion: place.formatted_address,
          rating: place.rating || null,
          totalRatings: place.user_ratings_total || 0,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          categoria: categoria.id,
          categoriaLabel: categoria.label,
          categorias: [categoria.id],
          photos: (place.photos || []).slice(0, 3).map(p => p.photo_reference),
        });
      }
    }

    const productores = Array.from(vistos.values());

    return res.status(200).json({
      productores,
      center: { lat, lng },
      total: productores.length,
      categorias: categoriasActivas,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
