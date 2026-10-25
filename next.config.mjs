/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Чтение DWG на сервере (серия диванов): WASM-библиотека грузится из node_modules как есть, без сборки
  serverExternalPackages: ["@mlightcad/libredwg-web"],
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // manifold-3d (WASM) в Node импортирует node:module / fs / path / url; в браузере эти ветки не выполняются
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (res) => {
          res.request = res.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = { ...config.resolve.fallback, module: false, fs: false, path: false, url: false };
    }
    return config;
  },
};

export default nextConfig;
