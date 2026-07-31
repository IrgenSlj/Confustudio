import { lookup } from 'node:dns/promises';
import net from 'node:net';

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export function createAssistantProxyError(message, code, statusCode = 502) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function isNonPublicIpAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    let mappedIpv4 = normalized.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/)?.[1] || null;
    const mappedHex = normalized.match(/^(?:::ffff:|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (!mappedIpv4 && mappedHex) {
      const high = Number.parseInt(mappedHex[1], 16);
      const low = Number.parseInt(mappedHex[2], 16);
      mappedIpv4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
    if (mappedIpv4) return isNonPublicIpAddress(mappedIpv4);
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('ff') ||
      normalized.startsWith('64:ff9b:') ||
      normalized.startsWith('2001:db8:')
    );
  }

  return true;
}

function parseProviderBaseUrl(rawUrl, providerId) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (_) {
    throw createAssistantProxyError(
      `Provider ${providerId} has an invalid server URL`,
      'PROVIDER_CONFIGURATION_INVALID',
      503,
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw createAssistantProxyError(
      `Provider ${providerId} has an invalid server URL`,
      'PROVIDER_CONFIGURATION_INVALID',
      503,
    );
  }
  return url;
}

function appendProviderPath(baseUrl, endpointPath) {
  const base = new URL(baseUrl.href);
  base.pathname = `${base.pathname.replace(/\/$/, '')}/${endpointPath.replace(/^\//, '')}`;
  return base;
}

async function assertHostedProviderDestination(url, allowTestProviderOrigins) {
  if (!allowTestProviderOrigins && url.protocol !== 'https:') {
    throw createAssistantProxyError('Hosted provider destination must use HTTPS', 'PROVIDER_DESTINATION_FORBIDDEN');
  }
  if (allowTestProviderOrigins) return;

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname) && isNonPublicIpAddress(hostname)) {
    throw createAssistantProxyError('Hosted provider destination is not public', 'PROVIDER_DESTINATION_FORBIDDEN');
  }

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (_) {
    throw createAssistantProxyError(
      'Hosted provider destination could not be resolved',
      'PROVIDER_DESTINATION_INVALID',
    );
  }
  if (!addresses.length || addresses.some(({ address }) => isNonPublicIpAddress(address))) {
    throw createAssistantProxyError('Hosted provider destination is not public', 'PROVIDER_DESTINATION_FORBIDDEN');
  }
}

function assertLocalProviderDestination(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw createAssistantProxyError(
      'Local provider destination must use HTTP or HTTPS',
      'LOCAL_PROVIDER_DESTINATION_FORBIDDEN',
    );
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const loopback =
    hostname === 'localhost' ||
    (net.isIPv4(hostname) && hostname.startsWith('127.')) ||
    (net.isIPv6(hostname) && hostname === '::1');
  if (!loopback) {
    throw createAssistantProxyError(
      'Local provider destination must be loopback-only',
      'LOCAL_PROVIDER_DESTINATION_FORBIDDEN',
    );
  }
}

export async function resolveProviderEndpoint(providerConfig, endpointPath, options = {}) {
  const baseUrl = parseProviderBaseUrl(providerConfig.baseUrl, providerConfig.id);
  const endpoint = appendProviderPath(baseUrl, endpointPath);
  if (endpoint.origin !== baseUrl.origin) {
    throw createAssistantProxyError(
      'Provider endpoint escaped its configured origin',
      'PROVIDER_DESTINATION_FORBIDDEN',
    );
  }
  if (providerConfig.scope === 'hosted') {
    await assertHostedProviderDestination(endpoint, Boolean(options.allowTestProviderOrigins));
  } else {
    assertLocalProviderDestination(endpoint);
  }
  return endpoint;
}

async function readBoundedResponseText(response, maxBytes) {
  const contentLength = response.headers.get('content-length');
  const declaredLength = contentLength === null ? null : Number(contentLength);
  if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw createAssistantProxyError('Provider response exceeded the size limit', 'UPSTREAM_RESPONSE_TOO_LARGE');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw createAssistantProxyError('Provider response exceeded the size limit', 'UPSTREAM_RESPONSE_TOO_LARGE');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
  return {
    signal: controller.signal,
    cancel() {
      clearTimeout(timer);
    },
  };
}

export async function postProviderJson(url, payload, headers = {}, options = {}) {
  const timeout = withTimeout(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: timeout.signal,
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw createAssistantProxyError('Provider redirect was rejected', 'UPSTREAM_REDIRECT_REJECTED');
    }
    const text = await readBoundedResponseText(response, maxResponseBytes);
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { raw: text };
    }
    return { response, data };
  } catch (error) {
    if (error?.code) throw error;
    if (timeout.signal.aborted) {
      throw createAssistantProxyError('Provider request timed out', 'UPSTREAM_TIMEOUT', 504);
    }
    throw createAssistantProxyError('Provider request failed', 'UPSTREAM_UNAVAILABLE');
  } finally {
    timeout.cancel();
  }
}
