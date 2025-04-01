/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim(),
    OPENAI_ORG_ID: process.env.OPENAI_ORG_ID?.trim(),
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: 'https://ai4kingdom.com',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig