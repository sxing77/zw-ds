/**
 * 将本地 scripts/pack-dataset-r2.ts 产出的 r2-pack 目录批量上传至 Cloudflare R2 私有桶
 * （使用 Node 原生 S3 SigV4 签名，零第三方依赖，支持断点续传与 4 并发）
 *
 * 读取环境变量（自动加载 .env.local）：
 *   ZIWEI_DATASET_R2_URL                例如 https://<AccountID>.r2.cloudflarestorage.com/ziwei
 *   ZIWEI_DATASET_R2_ACCESS_KEY_ID      R2 API Token Access Key ID（需对象读写权限）
 *   ZIWEI_DATASET_R2_SECRET_ACCESS_KEY  R2 API Token Secret Access Key
 *   ZIWEI_DATASET_PACK_DIR              默认 G:\紫微斗数解读参数集\r2-pack
 *
 * 用法：
 *   npx tsx scripts/upload-dataset-r2.ts
 *   npx tsx scripts/upload-dataset-r2.ts --concurrency 4
 *   npx tsx scripts/upload-dataset-r2.ts --force
 */

import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

function loadEnvLocal() {
  const envFile = path.join(process.cwd(), '.env.local');
  if (!existsSync(envFile)) return;
  const content = readFileSync(envFile, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const BASE_URL = (process.env.ZIWEI_DATASET_R2_URL || '').trim().replace(/\/+$/, '');
const ACCESS_KEY_ID = (process.env.ZIWEI_DATASET_R2_ACCESS_KEY_ID || '').trim();
const SECRET_ACCESS_KEY = (process.env.ZIWEI_DATASET_R2_SECRET_ACCESS_KEY || '').trim();
const PACK_DIR = (process.env.ZIWEI_DATASET_PACK_DIR || 'G:\\紫微斗数解读参数集\\r2-pack').trim();

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function signHeaders(method: 'HEAD' | 'PUT', targetUrl: URL, payloadHash: string, extra?: Record<string, string>) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';

  const entries: [string, string][] = [
    ['host', targetUrl.host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', amzDate],
  ];
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      entries.push([k.toLowerCase(), v]);
    }
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  const canonicalHeaders = entries.map(([k, v]) => `${k}:${v}\n`).join('');
  const signedHeaders = entries.map(([k]) => k).join(';');
  const canonicalRequest = [
    method,
    targetUrl.pathname,
    targetUrl.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac('AWS4' + SECRET_ACCESS_KEY, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const headers: Record<string, string> = {
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    ...extra,
  };
  return headers;
}

async function remoteSize(key: string): Promise<number | null> {
  const url = new URL(`${BASE_URL}/${key}`);
  const headers = signHeaders('HEAD', url, 'UNSIGNED-PAYLOAD');
  const res = await fetch(url, { method: 'HEAD', headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length'));
  return Number.isFinite(len) ? len : null;
}

async function uploadFile(fileName: string, force: boolean): Promise<'skipped' | 'uploaded'> {
  const fullPath = path.join(PACK_DIR, fileName);
  const st = await stat(fullPath);

  if (!force) {
    const existing = await remoteSize(fileName);
    if (existing === st.size) return 'skipped';
  }

  const body = await readFile(fullPath);
  const contentType = fileName.endsWith('.json')
    ? 'application/json; charset=utf-8'
    : 'application/octet-stream';
  const url = new URL(`${BASE_URL}/${fileName}`);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const headers = signHeaders('PUT', url, 'UNSIGNED-PAYLOAD', {
        'content-type': contentType,
      });
      const res = await fetch(url, {
        method: 'PUT',
        headers,
        body,
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${errText.slice(0, 200)}`);
      }
      return 'uploaded';
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
  }
  throw lastErr;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const concIdx = args.indexOf('--concurrency');
  const concurrency = concIdx >= 0 ? Math.max(1, Math.min(8, Number(args[concIdx + 1]) || 4)) : 4;

  if (!BASE_URL || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    console.error('缺少 R2 环境变量，请先在 .env.local 配置：');
    console.error('  ZIWEI_DATASET_R2_URL=https://<AccountID>.r2.cloudflarestorage.com/<BucketName>');
    console.error('  ZIWEI_DATASET_R2_ACCESS_KEY_ID=...');
    console.error('  ZIWEI_DATASET_R2_SECRET_ACCESS_KEY=...');
    process.exit(1);
  }

  const allEntries = (await readdir(PACK_DIR))
    .filter(name => name.endsWith('.brpack') || name.endsWith('.blocks.bin') || name === 'manifest.json')
    .sort();

  // manifest.json 放在最后上传，确保线上不会读到不完整索引
  const dataFiles = allEntries.filter(name => name !== 'manifest.json');
  const hasManifest = allEntries.includes('manifest.json');

  if (!dataFiles.length) {
    console.error(`目录 ${PACK_DIR} 中未找到 .brpack / .blocks.bin 文件。`);
    process.exit(1);
  }

  console.log(`本地目录: ${PACK_DIR}`);
  console.log(`目标 R2:  ${BASE_URL}`);
  console.log(`文件总数: ${allEntries.length} 个（并发 ${concurrency}，已存在同名同大小文件自动跳过）\n`);

  let cursor = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const startedAt = Date.now();

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= dataFiles.length) break;
      const name = dataFiles[idx];
      const t0 = Date.now();
      try {
        const result = await uploadFile(name, force);
        if (result === 'skipped') {
          skipped++;
        } else {
          uploaded++;
          const sec = ((Date.now() - t0) / 1000).toFixed(1);
          console.log(`[${uploaded + skipped}/${dataFiles.length}] 已上传 ${name} (${sec}s)`);
        }
      } catch (err) {
        failed++;
        console.error(`[失败] ${name}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (failed > 0) {
    console.error(`\n有 ${failed} 个文件上传失败，未上传 manifest.json。请重新运行本脚本续传。`);
    process.exit(1);
  }

  if (hasManifest) {
    await uploadFile('manifest.json', true);
    console.log(`[完成] 已上传 manifest.json`);
  }

  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n全部同步完成！本次上传 ${uploaded} 个，跳过已存在 ${skipped} 个，总耗时 ${totalSec}s`);
}

void main();
