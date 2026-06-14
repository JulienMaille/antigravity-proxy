import { fetch as undiciFetch, ProxyAgent as UndiciProxyAgent } from 'undici';
import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import { logger } from './logger.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RATE_LIMIT_FILE = path.resolve(__dirname, '..', 'data', 'proxy-rate-limits.json');

interface ProxyItem {
  address: string;
  protocol: string;
  latency: number;
  quality_grade: string;
  status: string;
}

const PROXY_API = 'https://proxy.amux.ai/api/proxies';
const POLL_INTERVAL = 5 * 60 * 1000;
const MAX_RETRIES = 3;

let pool: ProxyItem[] = [];
let cursor = 0;
let blacklist = new Set<string>();
// IP -> Expiration timestamp (ms)
let rateLimitStore: Record<string, number> = {};
let current: { url: string; addr: string; proto: 'http' | 'socks5' } | null = null;
let lastRefresh = 0;
/** Resolves when the current load finishes, or null if no load is in progress. */
let pendingLoad: Promise<void> | null = null;

function loadRateLimits(): void {
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const content = fs.readFileSync(RATE_LIMIT_FILE, 'utf8');
      rateLimitStore = JSON.parse(content);
      // Clean up already expired entries
      const now = Date.now();
      let changed = false;
      for (const [ip, expiresAt] of Object.entries(rateLimitStore)) {
        if (expiresAt < now) {
          delete rateLimitStore[ip];
          changed = true;
        }
      }
      if (changed) {
        saveRateLimits();
      }
    }
  } catch (e: any) {
    logger.warn(`[proxy-pool] Failed to load rate limits: ${e.message}`);
  }
}

function saveRateLimits(): void {
  try {
    const dir = path.dirname(RATE_LIMIT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(rateLimitStore, null, 2), 'utf8');
  } catch (e: any) {
    logger.warn(`[proxy-pool] Failed to save rate limits: ${e.message}`);
  }
}

// Initial load of rate limits
loadRateLimits();

export function isProxyPoolEnabled(): boolean {
  return process.env.OPENCODE_USE_PROXY_POOL !== 'false';
}

export async function loadPool(): Promise<void> {
  // If a load is already in progress, wait for it instead of returning early
  if (pendingLoad) return pendingLoad;
  pendingLoad = _loadPool();
  try {
    await pendingLoad;
  } finally {
    pendingLoad = null;
  }
}

async function _loadPool(): Promise<void> {
  try {
    const res = await undiciFetch(PROXY_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const all: any[] = await res.json() as any[];
    pool = all
      .filter((p) => p.quality_grade === 'S' && p.status === 'active')
      .sort((a, b) => a.latency - b.latency);
    cursor = 0;
    blacklist.clear();
    current = null;
    lastRefresh = Date.now();
    logger.info(`[proxy-pool] Loaded ${pool.length} S-grade proxies`);
  } catch (e: any) {
    logger.warn(`[proxy-pool] Failed to load pool: ${e.message}`);
  }
}

function selectProxy(): boolean {
  if (current) {
    // If the currently selected proxy is rate limited, clear it
    const expiresAt = rateLimitStore[current.addr];
    if (expiresAt && expiresAt > Date.now()) {
      current = null;
    } else {
      return true;
    }
  }
  const now = Date.now();
  for (let i = 0; i < pool.length; i++) {
    const j = cursor % pool.length;
    cursor = j + 1;
    const p = pool[j];
    
    // Check local session blacklist
    if (blacklist.has(p.address)) {
      continue;
    }

    // Check 6-hour rate limit blacklist
    const expiresAt = rateLimitStore[p.address];
    if (expiresAt && expiresAt > now) {
      logger.debug(`[proxy-pool] Skipping proxy ${p.address} (rate limited for another ${Math.ceil((expiresAt - now) / 60000)} mins)`);
      continue;
    }

    // Clean up expired entry if it exists
    if (expiresAt) {
      delete rateLimitStore[p.address];
      saveRateLimits();
    }

    const url = p.protocol === 'socks5'
      ? `socks5h://${p.address}`
      : `http://${p.address}`;
    current = { url, addr: p.address, proto: p.protocol as 'http' | 'socks5' };
    logger.debug(`[proxy-pool] Selected proxy: ${p.address} (${p.protocol})`);
    return true;
  }
  return false;
}

function drop(addr: string): void {
  blacklist.add(addr);
  logger.debug(`[proxy-pool] Dropped ${addr} (${blacklist.size}/${pool.length})`);
}

function ensurePoolFresh(): void {
  if (pool.length === 0 || Date.now() - lastRefresh > POLL_INTERVAL) {
    loadPool().catch(() => {});
  }
}

export async function fetchWithProxyFallback(
  url: string,
  options: any = {},
  retries = 0,
): Promise<any> {
  if (!isProxyPoolEnabled()) {
    return undiciFetch(url, options);
  }

  if (pool.length === 0) await loadPool();

  if (!selectProxy()) {
    logger.warn('[proxy-pool] No proxy available, falling back to direct');
    return undiciFetch(url, options);
  }

  const { url: proxyUrl, addr, proto } = current!;

  try {
    let response: Response;
    if (proto === 'socks5') {
      response = await socks5Fetch(url, options, proxyUrl);
    } else {
      response = await httpProxyFetch(url, options, proxyUrl);
    }

    const is429 = response.status === 429;
    let isRateLimitBody = false;
    let body = '';
    if (is429 || response.status >= 500) {
      body = await response.text().catch(() => '');
      isRateLimitBody = /rate.*limit/i.test(body) || /FreeUsageLimitError/i.test(body);
      const err = new Error(`Proxy ${addr} returned ${response.status}: ${body.substring(0, 200)}`);
      (err as any).isRateLimit = is429 || isRateLimitBody;
      throw err;
    }
    return response;
  } catch (e: any) {
    logger.warn(`[proxy-pool] Proxy ${addr} failed: ${e.message}`);

    const isRateLimit = e.isRateLimit || /rate.*limit/i.test(e.message) || /FreeUsageLimitError/i.test(e.message);
    if (isRateLimit) {
      const expiresAt = Date.now() + 6 * 60 * 60 * 1000; // 6 hours
      rateLimitStore[addr] = expiresAt;
      saveRateLimits();
      logger.warn(`[proxy-pool] Proxy ${addr} rate limited, blacklisted 6h`);
    }

    drop(addr);
    current = null;
    if (retries < MAX_RETRIES) {
      logger.debug(`[proxy-pool] Retrying with new proxy (attempt ${retries + 2}/${MAX_RETRIES + 1})`);
      return fetchWithProxyFallback(url, options, retries + 1);
    }
    logger.error(`[proxy-pool] All proxy retries exhausted`);
    throw e;
  }
}

async function httpProxyFetch(urlStr: string, options: any, proxyUrl: string): Promise<any> {
  const proxyAgent = new UndiciProxyAgent(proxyUrl);
  try {
    const res: any = await undiciFetch(urlStr, { ...options, dispatcher: proxyAgent });
    const headers = new Headers();
    if (res.headers && typeof res.headers.forEach === 'function') {
      res.headers.forEach((v: string, k: string) => headers.set(k, v));
    }
    return new Response(res.body !== undefined ? (res.body as any) : null, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } finally {
    proxyAgent.close().catch(() => {});
  }
}

async function socks5Fetch(urlStr: string, options: any, proxyUrl: string): Promise<any> {
  const agent = new SocksProxyAgent(proxyUrl, { timeout: 15000 }) as unknown as https.Agent;
  const parsed = new URL(urlStr);
  const isStream = (options.headers as Record<string, string>)?.['accept']?.includes('event-stream');

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (options.headers) {
      const h = options.headers as Record<string, string>;
      for (const k of Object.keys(h)) headers[k.toLowerCase()] = h[k];
    }

    const bodyStr = options.body as string | undefined;

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers,
        agent,
        rejectUnauthorized: false,
        timeout: 30000,
      },
      (res) => {
        if (isStream) {
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              res.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
              res.on('end', () => controller.close());
              res.on('error', (err) => controller.error(err));
            },
            cancel() { res.destroy(); },
          });
          resolve(new Response(stream, {
            status: res.statusCode || 200,
            headers: res.headers as Record<string, string>,
          }));
        } else {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            resolve(new Response(Buffer.concat(chunks), {
              status: res.statusCode || 200,
              headers: res.headers as Record<string, string>,
            }));
          });
          res.on('error', reject);
        }
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('SOCKS5 timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;
export function startProxyPool(): void {
  if (refreshTimer) return;
  loadPool().catch(() => {});
  refreshTimer = setInterval(() => loadPool().catch(() => {}), POLL_INTERVAL);
  logger.info('[proxy-pool] Started (refresh every 5 min)');
}

/**
 * Report that the current proxy failed mid-stream. Blacklists it so the next
 * request picks a different proxy instead of retrying the same failing one.
 */
export function reportFailure(): void {
  if (current) {
    const addr = current.addr;
    drop(addr);
    current = null;
    logger.warn(`[proxy-pool] Reported mid-stream failure for ${addr}, blacklisted for next request`);
  }
}

export function stopProxyPool(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
