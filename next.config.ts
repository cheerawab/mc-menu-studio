import os from 'node:os';
import type { NextConfig } from 'next';

// A phone (or another computer) opens the editor through this computer's network address, the "Network:" URL that `npm run dev`
// prints. Next.js blocks dev-only requests (hot reload, dev assets) from any host that is not allowed, and without this list the page
// stays on "載入中…". Only this machine's own addresses are allowed. They are read when the dev server starts: restart it after
// switching networks.
const hostName = os.hostname();
const ownHosts = Object.values(os.networkInterfaces())
  .flat()
  .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...new Set([...ownHosts, hostName, hostName.endsWith('.local') ? hostName : `${hostName}.local`])],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
