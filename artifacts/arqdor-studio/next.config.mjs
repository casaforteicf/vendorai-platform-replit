/**
 * Configuração do Next do Arqdor Studio.
 *
 * O `manifold-3d` é publicado como ESM gerado por Emscripten e referencia módulos Node
 * (`node:module`, `fs`, `path`) em ramos que só rodam fora do navegador. Sem fallback, o
 * webpack tenta resolvê-los e quebra o build ("UnhandledSchemeError: node:module").
 *
 * Desligar esses módulos no cliente mantém o WASM funcionando (no browser ele usa `fetch`).
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        module: false,
        'node:module': false,
        fs: false,
        'node:fs': false,
        path: false,
        'node:path': false,
        url: false,
        'node:url': false,
      };
    }
    return config;
  },
};

export default nextConfig;
