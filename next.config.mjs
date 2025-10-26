/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Use null-loader to skip face worker during SSR
    // This prevents TensorFlow.js from being bundled on the server
    if (isServer) {
      config.module.rules.push({
        test: /workers\/faceWorker\.ts$/,
        loader: 'null-loader',
      });

      // Keep native onnxruntime bindings out of the server bundle
      config.externals = config.externals || [];
      config.externals.push('onnxruntime-node');
    }

    // Enable Web Workers (client-side only)
    if (!isServer) {
      config.module.rules.push({
        test: /\.worker\.(js|ts)$/,
        use: { loader: 'worker-loader' },
      });

      // Handle AudioWorklet files
      config.module.rules.push({
        test: /\.worklet\.js$/,
        type: 'asset/resource',
      });

      // Stub out onnxruntime-node for the browser build (we only use the WASM backend)
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'onnxruntime-node': false,
      };
    }

    return config;
  },
};

export default nextConfig;
