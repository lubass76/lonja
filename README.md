# LONJA — Mercado de productores de España

Demo funcional: buscas una localidad, aparecen los productores de aceite, vino,
queso, miel, jamón, conservas, pan, carne y huerta cerca de ti, en mapa y en
lista, con distancia real.

Construida reutilizando la arquitectura de búsqueda de Experience Prospector
(Google Places + Geocoding), en un proyecto Vercel independiente.

## Estructura

```
lonja/
├── api/
│   ├── search-productores.js   ← busca por localidad, 9 categorías en paralelo
│   └── maps-key.js             ← sirve la key de Maps al frontend
├── public/
│   └── index.html              ← toda la interfaz (HTML+CSS+JS en un solo archivo)
├── vercel.json
├── package.json
├── .gitignore
└── .env.example
```

## Puesta en marcha

1. Crea un repo nuevo en GitHub (ej. `lonja`) y sube esta carpeta tal cual.
2. En Vercel: **Add New → Project → Import** ese repo. No hace falta configurar
   ningún build command ni framework — es estático + funciones serverless.
3. En **Project Settings → Environment Variables**, añade:
   - `GOOGLE_PLACES_API_KEY` — tu key de Google Cloud con **Geocoding API**,
     **Places API** y **Maps JavaScript API** habilitadas.
4. Deploy. La app queda en `public/index.html`, servida en la raíz del dominio
   que te dé Vercel.

## Desarrollo local (opcional)

```bash
npm i -g vercel
cp .env.example .env.local   # y rellena la key
vercel dev
```

## Siguiente paso pendiente

Google Places no distingue si un resultado es realmente un productor/comercio
de producto español o solo un negocio cualquiera que encaja con la búsqueda de
texto. El siguiente paso natural es un enriquecimiento ligero por resultado
(reutilizando el patrón `callOpenAI` de `analyze.js` en Experience Prospector,
pero mucho más simple) que confirme origen y categoría real de cada sitio.
