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
    }

    return config;
  },
};

export default nextConfig;
