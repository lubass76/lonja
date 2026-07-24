// api/maps-key.js
// Idéntico al de Experience Prospector — sirve la key de Google Maps al frontend.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const key = process.env.GOOGLE_PLACES_API_KEY;
  res.status(200).json({ key: key || null });
}
