/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // L'import .xlsm envoie des lots de 200 lignes × 46 colonnes ; Vercel limite une requête à 4,5 Mo.
    serverActions: { bodySizeLimit: "4mb" },
  },
  webpack: (config, { dev }) => {
    // Windows / OneDrive / antivirus : le cache disque de Webpack échoue parfois au renommage
    // (« ENOENT … rename »). En développement, on le garde en mémoire : aucun fichier à renommer.
    if (dev) config.cache = { type: "memory" };
    return config;
  },
};

export default nextConfig;
