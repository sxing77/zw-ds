/**
 * 将本地原始 year-YYYY.jsonl 语料按块 Brotli 压缩，生成适合 Cloudflare R2（<10GB 免费档）
 * 按 HTTP Range 随机读取的紧凑包：
 *
 * 产出（写入 --out 目录，默认 <ZIWEI_DATASET_DIR>/r2-pack）：
 *   year-YYYY.brpack      连续拼接的 Brotli 压缩块
 *   year-YYYY.blocks.bin  uint32 LE 数组（长度 = 块数 + 1），记录每块起始字节与末尾总字节
 *   manifest.json         元数据（version: 2, format: 'brpack', blockSize, years）
 *
 * 用法示例：
 *   npx tsx scripts/pack-dataset-r2.ts --years 1990
 *   npx tsx scripts/pack-dataset-r2.ts --years 1975-2005
 *   npx tsx scripts/pack-dataset-r2.ts --all --quality 6
 *   npx tsx scripts/pack-dataset-r2.ts --all --out D:\ziwei-r2-pack --force
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';

const DATA_DIR = process.env.ZIWEI_DATASET_DIR || 'G:\\紫微斗数解读参数集';

interface PackedYearMeta {
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
  years: Record<string, PackedYearMeta>;
}

interface CliOptions {
  years: number[] | 'all';
  outDir: string;
  blockSize: number;
  quality: number;
  force: boolean;
}

function parseYearsArg(raw: string): number[] {
  const result = new Set<number>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = trimmed.match(/^(\d{4})-(\d{4})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end || start < 1900 || end > 2100) {
        throw new Error(`无效年份区间：${trimmed}`);
      }
      for (let y = start; y <= end; y++) result.add(y);
    } else {
      const y = Number(trimmed);
      if (!Number.isInteger(y) || y < 1900 || y > 2100) {
        throw new Error(`无效年份：${trimmed}`);
      }
      result.add(y);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

function parseArgs(argv: string[]): CliOptions {
  let years: number[] | 'all' = 'all';
  let outDir = process.env.ZIWEI_DATASET_PACK_DIR || path.join(DATA_DIR, 'r2-pack');
  let blockSize = 16;
  let quality = 6;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') years = 'all';
    else if (a === '--force') force = true;
    else if (a === '--years') years = parseYearsArg(argv[++i] ?? '');
    else if (a === '--out') outDir = argv[++i] || outDir;
    else if (a === '--block-size') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1 || n > 128) throw new Error('--block-size 需为 1–128 整数');
      blockSize = n;
    } else if (a === '--quality') {
      const q = Number(argv[++i]);
      if (!Number.isInteger(q) || q < 1 || q > 11) throw new Error('--quality 需为 1–11 整数');
      quality = q;
    }
  }

  return { years, outDir, blockSize, quality, force };
}

function fmtMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function discoverYears(): Promise<number[]> {
  const entries = await readdir(DATA_DIR);
  const years: number[] = [];
  for (const name of entries) {
    const m = name.match(/^year-(\d{4})\.jsonl$/);
    if (m) years.push(Number(m[1]));
  }
  return years.sort((a, b) => a - b);
}

async function loadExistingManifest(outDir: string, blockSize: number): Promise<PackedManifest> {
  try {
    const raw = await readFile(path.join(outDir, 'manifest.json'), 'utf8');
    const parsed = JSON.parse(raw) as PackedManifest;
    if (parsed?.version === 2 && parsed?.format === 'brpack' && parsed.blockSize === blockSize && parsed.years) {
      return parsed;
    }
  } catch { /* fresh manifest */ }
  return { version: 2, format: 'brpack', blockSize, years: {} };
}

async function packYear(
  year: number,
  outDir: string,
  blockSize: number,
  quality: number,
): Promise<PackedYearMeta> {
  const srcFile = path.join(DATA_DIR, `year-${year}.jsonl`);
  const srcStat = await stat(srcFile);
  const packFile = path.join(outDir, `year-${year}.brpack`);
  const blocksFile = path.join(outDir, `year-${year}.blocks.bin`);

  const offsets: number[] = [0];
  let writtenBytes = 0;
  let totalRows = 0;
  let blockLines: string[] = [];

  const writer = createWriteStream(packFile);
  const writeChunk = (buf: Buffer) =>
    new Promise<void>((resolve, reject) => {
      if (writer.write(buf)) {
        resolve();
        return;
      }
      const onDrain = () => {
        writer.off('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        writer.off('drain', onDrain);
        reject(err);
      };
      writer.once('drain', onDrain);
      writer.once('error', onError);
    });

  const flushBlock = async () => {
    if (!blockLines.length) return;
    const rawBuf = Buffer.from(blockLines.join('\n'), 'utf8');
    const compressed = brotliCompressSync(rawBuf, {
      params: {
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
        [zlibConstants.BROTLI_PARAM_QUALITY]: quality,
      },
    });
    await writeChunk(compressed);
    writtenBytes += compressed.length;
    if (writtenBytes > 0xffffffff) {
      throw new Error(`year-${year}.brpack 超过 uint32 上限（4GB），无法写入 blocks.bin`);
    }
    offsets.push(writtenBytes);
    blockLines = [];
  };

  const rl = readline.createInterface({
    input: createReadStream(srcFile, { encoding: 'utf8', highWaterMark: 4 * 1024 * 1024 }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    blockLines.push(line);
    totalRows += 1;
    if (blockLines.length >= blockSize) {
      await flushBlock();
    }
  }
  await flushBlock();

  await new Promise<void>((resolve, reject) => {
    writer.end(() => resolve());
    writer.on('error', reject);
  });

  const u32 = new Uint32Array(offsets);
  await writeFile(blocksFile, Buffer.from(u32.buffer, u32.byteOffset, u32.byteLength));

  return {
    rows: totalRows,
    blocks: offsets.length - 1,
    rawBytes: srcStat.size,
    packedBytes: writtenBytes,
    mtimeMs: srcStat.mtimeMs,
    builtAt: new Date().toISOString(),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await mkdir(opts.outDir, { recursive: true });

  const targetYears = opts.years === 'all' ? await discoverYears() : opts.years;
  if (!targetYears.length) {
    console.error(`未在 ${DATA_DIR} 找到 year-YYYY.jsonl 文件。`);
    process.exit(1);
  }

  const manifest = await loadExistingManifest(opts.outDir, opts.blockSize);
  console.log(`源目录: ${DATA_DIR}`);
  console.log(`输出目录: ${opts.outDir}`);
  console.log(`配置: blockSize=${opts.blockSize}, brotli quality=${opts.quality}, 待处理年份=${targetYears.length}`);

  let sumRaw = 0;
  let sumPacked = 0;
  const startedAll = Date.now();

  for (const year of targetYears) {
    const srcFile = path.join(DATA_DIR, `year-${year}.jsonl`);
    let srcStat;
    try {
      srcStat = await stat(srcFile);
    } catch {
      console.warn(`[跳过] 缺少 ${srcFile}`);
      continue;
    }

    const prev = manifest.years[String(year)];
    if (!opts.force && prev && prev.rawBytes === srcStat.size && prev.mtimeMs === srcStat.mtimeMs) {
      sumRaw += prev.rawBytes;
      sumPacked += prev.packedBytes;
      console.log(`[跳过已打包] ${year}: ${fmtMB(prev.rawBytes)} -> ${fmtMB(prev.packedBytes)}`);
      continue;
    }

    const t0 = Date.now();
    const meta = await packYear(year, opts.outDir, opts.blockSize, opts.quality);
    manifest.years[String(year)] = meta;
    // 每完成一年立即落盘 manifest，支持随时中断续跑
    await writeFile(path.join(opts.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    const ratio = (meta.rawBytes / Math.max(1, meta.packedBytes)).toFixed(2);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    sumRaw += meta.rawBytes;
    sumPacked += meta.packedBytes;
    console.log(
      `[完成] ${year}: ${meta.rows} 行 (${meta.blocks} 块) | ${fmtMB(meta.rawBytes)} -> ${fmtMB(meta.packedBytes)} (${ratio}x, ${sec}s)`,
    );
  }

  const totalSec = ((Date.now() - startedAll) / 1000).toFixed(1);
  const totalRatio = (sumRaw / Math.max(1, sumPacked)).toFixed(2);
  console.log(`\n全部完成: ${fmtMB(sumRaw)} -> ${fmtMB(sumPacked)} (总压缩比 ${totalRatio}x, 总耗时 ${totalSec}s)`);
}

void main();
