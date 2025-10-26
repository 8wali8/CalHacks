import { NextRequest, NextResponse } from 'next/server';

const HF_BASE_URL = 'https://huggingface.co/';

export const dynamic = 'force-dynamic';

async function proxyRequest(
  req: NextRequest,
  params: { path: string[] },
  method: 'GET' | 'HEAD'
) {
  const search = req.nextUrl.search;
  const targetPath = params.path.join('/');
  const url = `${HF_BASE_URL}${targetPath}${search}`;

  const token =
    process.env.HUGGINGFACE_TOKEN ?? process.env.NEXT_PUBLIC_HUGGINGFACE_TOKEN;

  const headers = new Headers();
  headers.set('User-Agent', 'analytics-lab/1.0');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const upstream = await fetch(url, {
    headers,
    method,
  });

  const responseHeaders = new Headers(upstream.headers);
  // Prevent Next.js from caching error responses or private headers.
  responseHeaders.delete('set-cookie');
  const upstreamCache = upstream.headers.get('cache-control');
  responseHeaders.set(
    'cache-control',
    upstreamCache ?? 'public, max-age=0, must-revalidate'
  );

  return { upstream, responseHeaders };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const { upstream, responseHeaders } = await proxyRequest(req, params, 'GET');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function HEAD(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const { upstream, responseHeaders } = await proxyRequest(req, params, 'HEAD');

  return new NextResponse(null, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
