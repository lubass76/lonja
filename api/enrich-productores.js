// api/enrich-productores.js
// Recibe un lote de candidatos ya encontrados por search-productores.js
// (solo nombre, dirección y categorías de Google en las que apareció) y decide,
// con una llamada ligera a OpenAI, cuáles son realmente productores directos o
// comercios especializados en producto español — descartando cadenas de
// distribución, franquicias y cualquier cosa sin señal clara. Reasigna además
// la categoría real (una sola, la más específica) para corregir los casos en
// los que un negocio "ganó" una categoría de búsqueda equivocada.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada.' });

  const { candidatos } = req.body || {};
  if (!Array.isArray(candidatos) || !candidatos.length) {
    return res.status(400).json({ error: 'candidatos debe ser un array no vacío.' });
  }

  const CATEGORIAS_VALIDAS = ['aceite', 'vino', 'queso', 'miel', 'jamon', 'conservas', 'pan', 'carne', 'huerta'];

  const systemPrompt = `Eres un verificador de origen de producto para un directorio que solo admite dos tipos de negocio:
(a) PRODUCTORES DIRECTOS de alimentación española: bodegas, almazaras, queserías, apicultores, obradores, carnicerías con producción propia, panaderías/hornos artesanos, huertas o cooperativas agrícolas.
(b) COMERCIOS ESPECIALIZADOS que venden exclusivamente producto español certificado: delicatessen, tiendas de producto español, charcuterías ibéricas, tiendas gourmet de kilómetro cero.

EXCLUYE SIEMPRE, sin excepción:
- Supermercados y cadenas de gran distribución (Mercadona, Carrefour, Lidl, Dia, Consum, Eroski, Alcampo, Caprabo, Aldi y cualquier cadena similar, nacional o internacional)
- Franquicias de restauración o comida rápida
- Tiendas de conveniencia genéricas, gasolineras, bazares, minimarkets
- Marcas o distribuidores de producto extranjero
- Cualquier negocio cuyo nombre no dé ninguna señal clara de ser productor directo o comercio especializado en producto español

Solo tienes el nombre, la dirección, y en qué categorías de búsqueda de Google apareció cada uno — no tienes su web ni reseñas reales. Sé conservador: ante la duda razonable, decide "descartar". Un directorio pequeño y fiable vale más que uno grande y dudoso.

Para cada candidato que SÍ incluyas, asigna una única categoría real de esta lista cerrada: ${CATEGORIAS_VALIDAS.join(', ')}. Elige la más específica a su actividad principal — ignora las categorías de Google que fueron solo coincidencias de la búsqueda si no encajan con el nombre real del negocio.

Devuelve ÚNICAMENTE JSON válido sin markdown, con un elemento por cada candidato recibido, en el mismo orden:
{
  "resultados": [
    { "id": "el id exacto recibido", "incluir": true, "categoria": "una de las 9 categorías si incluir es true, si no null", "motivo": "una frase breve" }
  ]
}`;

  const userMessage = `Candidatos a verificar:\n${JSON.stringify(candidatos, null, 2)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_output_tokens: 3500,
      }),
    });
    clearTimeout(timeout);

    if (!r.ok) {
      const errData = await r.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OpenAI error ${r.status}`);
    }

    const data = await r.json();
    let text = '';
    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === 'message' && item.content) {
          for (const block of item.content) {
            if (block.type === 'output_text') text += block.text;
          }
        }
      }
    }
    if (!text) throw new Error('Respuesta vacía de OpenAI.');

    const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch {
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
      else throw new Error('La respuesta no fue JSON válido.');
    }

    // Sanea: fuerza que la categoría devuelta sea una de las válidas.
    const resultados = (parsed.resultados || []).map(r => ({
      id: r.id,
      incluir: !!r.incluir,
      categoria: r.incluir && CATEGORIAS_VALIDAS.includes(r.categoria) ? r.categoria : null,
      motivo: r.motivo || '',
    }));

    return res.status(200).json({ resultados });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error desconocido.' });
  }
}
