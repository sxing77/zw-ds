/**
 * lib/ai/dataset —— v4.0 解读数据集的查表（事实底座）
 *
 * 支持三种读取模式（按优先级自动选择）：
 *   1. Cloudflare R2 / HTTP Range 压缩包模式（ZIWEI_DATASET_R2_URL）：
 *      仅下载 manifest.json + 2KB 级 year-YYYY.blocks.bin，每次查盘发一次 HTTP Range
 *      拉取单个 Brotli 压缩块（~30–60KB）并在内存解压，支持公开桶、Bearer Token 或 R2 私有桶 SigV4 签名。
 *   2. 本地 Brotli 压缩包模式（ZIWEI_DATASET_PACK_DIR）：
 *      直接读取本地 scripts/pack-dataset-r2.ts 产出的 year-YYYY.brpack，方便上传 R2 前本地实测。
 *   3. 本地原始 JSONL + offsets.bin 模式（ZIWEI_DATASET_DIR + ZIWEI_DATASET_INDEX）：
 *      完全兼容原有按行字节偏移读取流程。
 *
 * 数据缺失 / 索引缺失 / 网络异常 / 键校验失败时一律返回 null，由调用方降级为纯引擎解读。
 */

import 'server-only';

import { createHash, createHmac } from 'node:crypto';
import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { parseKey, rowIndexFromKey, type DatasetRecord } from './dataset-key';

export {
  DATASET_DIMS,
  chartKey,
  guessDimension,
  hourFromClock,
  parseKey,
  pickDimension,
  rowIndexFromKey,
} from './dataset-key';
export type { DatasetDimension, DatasetRecord, ParsedKey } from './dataset-key';

const DATA_DIR = process.env.ZIWEI_DATASET_DIR || 'G:\\紫微斗数解读参数集';
const INDEX_DIR =
  process.env.ZIWEI_DATASET_INDEX || path.join(process.cwd(), '.workbuddy', 'cache', 'dataset-index');
const PACK_DIR = process.env.ZIWEI_DATASET_PACK_DIR?.trim() || '';
const R2_BASE_URL = process.env.ZIWEI_DATASET_R2_URL?.trim().replace(/\/+$/, '') || '';
const R2_TOKEN = process.env.ZIWEI_DATASET_R2_TOKEN?.trim() || '';
const R2_ACCESS_KEY_ID = process.env.ZIWEI_DATASET_R2_ACCESS_KEY_ID?.trim() || '';
const R2_SECRET_ACCESS_KEY = process.env.ZIWEI_DATASET_R2_SECRET_ACCESS_KEY?.trim() || '';

export type DatasetState =
  | { enabled: true; mode: 'r2-pack' | 'local-pack' | 'local-raw'; dataDir: string; indexDir: string; years: number }
  | { enabled: false; reason: string };

interface RawManifestYear {
  rows: number;
  bytes: number;
  mtimeMs: number;
  builtAt: string;
}

interface RawManifest {
  dataDir: string;
  years: Record<string, RawManifestYear>;
}

interface PackedManifestYear {
  rows: number;
  blocks: number;
  rawBytes: number;
  packedBytes: number;
  mtimeMs: number;
  builtAt: string;
}

interface PackedManifest {
  version: 2;
  format: 'brpack';
  blockSize: number;
  years: Record<string, PackedManifestYear>;
}

let rawManifestCache: { stamp: number; data: RawManifest } | null = null;
let packedManifestCache: { stamp: number; data: PackedManifest } | null = null;
const rawOffsetsCache = new Map<number, Uint32Array>();
const blockOffsetsCache = new Map<number, Uint32Array>();

/** 轻量级内存块缓存（最多缓存 64 个已解压块，命中 < 0.1ms） */
const BLOCK_CACHE_LIMIT = 64;
const blockLinesCache = new Map<string, string[]>();

function cacheBlockLines(cacheKey: string, lines: string[]) {
  if (blockLinesCache.has(cacheKey)) {
    blockLinesCache.delete(cacheKey);
  } else if (blockLinesCache.size >= BLOCK_CACHE_LIMIT) {
    const oldest = blockLinesCache.keys().next().value;
    if (oldest !== undefined) blockLinesCache.delete(oldest);
  }
  blockLinesCache.set(cacheKey, lines);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** 极简 AWS S3 SigV4 签名（仅 GET，UNSIGNED-PAYLOAD，兼容 Cloudflare R2 私有桶） */
function buildR2Headers(targetUrl: URL, rangeHeader?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (rangeHeader) headers.Range = rangeHeader;

  if (R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const region = 'auto';
    const service = 's3';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const signEntries: [string, string][] = [
      ['host', targetUrl.host],
      ['x-amz-content-sha256', payloadHash],
      ['x-amz-date', amzDate],
    ];
    if (rangeHeader) signEntries.push(['range', rangeHeader]);
    signEntries.sort((a, b) => a[0].localeCompare(b[0]));

    const canonicalHeaders = signEntries.map(([k, v]) => `${k}:${v}\n`).join('');
    const signedHeaders = signEntries.map(([k]) => k).join(';');
    const canonicalRequest = [
      'GET',
      targetUrl.pathname,
      targetUrl.searchParams.toString(),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
    const kDate = hmac('AWS4' + R2_SECRET_ACCESS_KEY, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    headers['x-amz-date'] = amzDate;
    headers['x-amz-content-sha256'] = payloadHash;
    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  } else if (R2_TOKEN) {
    headers.Authorization = `Bearer ${R2_TOKEN}`;
  }

  return headers;
}

async function fetchR2Bytes(relativePath: string, range?: { start: number; endInclusive: number }): Promise<Buffer | null> {
  if (!R2_BASE_URL) return null;
  const url = new URL(`${R2_BASE_URL}/${relativePath.replace(/^\/+/, '')}`);
  const rangeHeader = range ? `bytes=${range.start}-${range.endInclusive}` : undefined;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildR2Headers(url, rangeHeader),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok && res.status !== 206) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadPackedManifest(): Promise<PackedManifest | null> {
  if (R2_BASE_URL) {
    // R2 manifest 缓存 5 分钟
    if (packedManifestCache && Date.now() - packedManifestCache.stamp < 5 * 60_000) {
      return packedManifestCache.data;
    }
    const buf = await fetchR2Bytes('manifest.json');
    if (!buf) return null;
    try {
      const parsed = JSON.parse(buf.toString('utf8')) as PackedManifest;
      if (parsed?.version !== 2 || parsed?.format !== 'brpack' || !parsed.years) return null;
      packedManifestCache = { stamp: Date.now(), data: parsed };
      return parsed;
    } catch {
      return null;
    }
  }

  if (PACK_DIR) {
    const file = path.join(PACK_DIR, 'manifest.json');
    try {
      const st = await stat(file);
      if (packedManifestCache && packedManifestCache.stamp === st.mtimeMs) return packedManifestCache.data;
      const raw = await readFile(file, 'utf8');
      const parsed = JSON.parse(raw) as PackedManifest;
      if (parsed?.version !== 2 || parsed?.format !== 'brpack' || !parsed.years) return null;
      packedManifestCache = { stamp: st.mtimeMs, data: parsed };
      return parsed;
    } catch {
      return null;
    }
  }

  return null;
}

async function loadBlockOffsets(year: number): Promise<Uint32Array | null> {
  const cached = blockOffsetsCache.get(year);
  if (cached) return cached;
  try {
    const buf = R2_BASE_URL
      ? await fetchR2Bytes(`year-${year}.blocks.bin`)
      : PACK_DIR
        ? await readFile(path.join(PACK_DIR, `year-${year}.blocks.bin`))
        : null;
    if (!buf || buf.byteLength < 8 || buf.byteLength % 4 !== 0) return null;
    const arr = new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    blockOffsetsCache.set(year, arr);
    return arr;
  } catch {
    return null;
  }
}

async function loadRawManifest(): Promise<RawManifest | null> {
  const file = path.join(INDEX_DIR, 'manifest.json');
  try {
    const st = await stat(file);
    if (rawManifestCache && rawManifestCache.stamp === st.mtimeMs) return rawManifestCache.data;
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as RawManifest;
    if (!parsed || typeof parsed !== 'object' || !parsed.years) return null;
    rawManifestCache = { stamp: st.mtimeMs, data: parsed };
    return parsed;
  } catch {
    return null;
  }
}

async function loadRawOffsets(year: number): Promise<Uint32Array | null> {
  const cached = rawOffsetsCache.get(year);
  if (cached) return cached;
  try {
    const buf = await readFile(path.join(INDEX_DIR, `year-${year}.offsets.bin`));
    const arr = new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    rawOffsetsCache.set(year, arr);
    return arr;
  } catch {
    return null;
  }
}

/** 数据集是否可用 —— 路由用它决定「走底座」还是「纯引擎」 */
export async function datasetStatus(): Promise<DatasetState> {
  if (R2_BASE_URL || PACK_DIR) {
    const packed = await loadPackedManifest();
    if (packed) {
      const years = Object.keys(packed.years).length;
      if (years > 0) {
        return {
          enabled: true,
          mode: R2_BASE_URL ? 'r2-pack' : 'local-pack',
          dataDir: R2_BASE_URL || PACK_DIR,
          indexDir: R2_BASE_URL || PACK_DIR,
          years,
        };
      }
    }
  }

  const manifest = await loadRawManifest();
  if (!manifest) {
    return {
      enabled: false,
      reason: `未找到数据集索引（${INDEX_DIR}）。本地可先运行 build-dataset-index.ts，线上可配置 ZIWEI_DATASET_R2_URL。`,
    };
  }
  const years = Object.keys(manifest.years).length;
  if (!years) {
    return { enabled: false, reason: '数据集索引为空，请重新运行 build-dataset-index' };
  }
  return { enabled: true, mode: 'local-raw', dataDir: DATA_DIR, indexDir: INDEX_DIR, years };
}

async function lookupFromPack(k: string, year: number, row: number): Promise<DatasetRecord | null> {
  const manifest = await loadPackedManifest();
  if (!manifest) return null;
  const meta = manifest.years[String(year)];
  if (!meta || row < 0 || row >= meta.rows) return null;

  const blockIndex = Math.floor(row / manifest.blockSize);
  const lineInBlock = row % manifest.blockSize;
  const cacheKey = `${year}:${blockIndex}`;

  let lines = blockLinesCache.get(cacheKey);
  if (!lines) {
    const offsets = await loadBlockOffsets(year);
    if (!offsets || blockIndex + 1 >= offsets.length) return null;
    const start = offsets[blockIndex];
    const end = offsets[blockIndex + 1];
    const len = end - start;
    if (len <= 0) return null;

    let compressed: Buffer | null = null;
    if (R2_BASE_URL) {
      compressed = await fetchR2Bytes(`year-${year}.brpack`, { start, endInclusive: end - 1 });
    } else if (PACK_DIR) {
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        handle = await open(path.join(PACK_DIR, `year-${year}.brpack`), 'r');
        const buf = Buffer.allocUnsafe(len);
        await handle.read(buf, 0, len, start);
        compressed = buf;
      } catch {
        compressed = null;
      } finally {
        await handle?.close().catch(() => {});
      }
    }
    if (!compressed) return null;

    try {
      const text = brotliDecompressSync(compressed).toString('utf8');
      lines = text.split('\n');
      cacheBlockLines(cacheKey, lines);
    } catch {
      return null;
    }
  }

  const line = lines[lineInBlock]?.replace(/\r$/, '');
  if (!line) return null;
  try {
    const rec = JSON.parse(line) as DatasetRecord;
    if (rec.k !== k) {
      console.warn(`[dataset:pack] 键校验失败：期望 ${k}，实际 ${rec.k}（行 ${row + 1}）`);
      return null;
    }
    return rec;
  } catch {
    return null;
  }
}

async function lookupFromRaw(k: string, year: number, row: number): Promise<DatasetRecord | null> {
  const manifest = await loadRawManifest();
  if (!manifest) return null;
  const meta = manifest.years[String(year)];
  if (!meta) return null;

  const offsets = await loadRawOffsets(year);
  if (!offsets || row < 0 || row >= offsets.length) return null;

  const start = offsets[row];
  const end = row + 1 < offsets.length ? offsets[row + 1] : meta.bytes;
  const len = end - start;
  if (len <= 1) return null;

  const file = path.join(DATA_DIR, `year-${year}.jsonl`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(file, 'r');
    const buf = Buffer.allocUnsafe(len);
    await handle.read(buf, 0, len, start);
    const line = buf.toString('utf8').replace(/\r?\n$/, '');
    if (!line) return null;
    const rec = JSON.parse(line) as DatasetRecord;
    if (rec.k !== k) {
      console.warn(`[dataset] 键校验失败：期望 ${k}，实际 ${rec.k}（行 ${row + 1}）`);
      return null;
    }
    return rec;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/**
 * 按 k 取一条完整断语记录。任何异常都返回 null。
 */
export async function lookupChart(k: string): Promise<DatasetRecord | null> {
  const parsed = parseKey(k);
  if (!parsed) return null;
  const row = rowIndexFromKey(parsed);
  if (row < 0) return null;

  if (R2_BASE_URL || PACK_DIR) {
    const fromPack = await lookupFromPack(k, parsed.year, row);
    if (fromPack) return fromPack;
  }
  return lookupFromRaw(k, parsed.year, row);
}
