/**
 * 数据集偏移索引构建
 *
 * year-YYYY.jsonl 每行一张盘，行顺序固定：
 *   按日期升序 → 每天 24 行 → 每个时辰 male 在前、female 在后
 * 所以「行号」可以由出生信息纯算出（见 lib/ai/dataset.ts 的 rowIndexFromBirth），
 * 但「行号 → 字节偏移」必须实际扫一遍文件才知道 —— 这个脚本就是干这件事。
 *
 * 产出：
 *   <INDEX_DIR>/year-YYYY.offsets.bin  uint32 LE 数组，第 i 项 = 第 i+1 行的起始字节偏移
 *   <INDEX_DIR>/manifest.json          每年的时间戳与行数，用于判断索引是否过期
 *
 * 用法：
 *   npx tsx scripts/build-dataset-index.ts --years 1990,1991
 *   npx tsx scripts/build-dataset-index.ts --all
 *   npx tsx scripts/build-dataset-index.ts --all --force
 *
 * 环境变量：
 *   ZIWEI_DATASET_DIR    数据集目录，默认 G:\紫微斗数解读参数集
 *   ZIWEI_DATASET_INDEX  索引目录，默认 <cwd>/.workbuddy/cache/dataset-index
 */

import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.ZIWEI_DATASET_DIR || 'G:\\紫微斗数解读参数集';
const INDEX_DIR = process.env.ZIWEI_DATASET_INDEX || path.join(process.cwd(), '.workbuddy', 'cache', 'dataset-index');

interface ManifestEntry {
  rows: number;
  bytes: number;
  mtimeMs: number;
  builtAt: string;
}

interface Manifest {
  dataDir: string;
  years: Record<string, ManifestEntry>;
}

function parseArgs(argv: string[]): { years: number[] | 'all'; force: boolean } {
  let years: number[] | 'all' = 'all';
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') years = 'all';
    else if (a === '--force') force = true;
    else if (a === '--years') {
      const v = argv[++i] ?? '';
      years = v
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1900 && n <= 2100);
      if (!years.length) throw new Error('--years 需要逗号分隔的年份，例如 --years 1990,1991');
    }
  }
  return { years, force };
}

/** 扫一个文件，返回每一行的起始字节偏移 */
async function scanOffsets(file: string): Promise<{ offsets: number[]; bytes: number }> {
  const offsets: number[] = [];
  let globalOffset = 0;
  let lineStart = 0;
  const stream = createReadStream(file, { highWaterMark: 8 * 1024 * 1024 });
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    let idx = chunk.indexOf(0x0a);
    while (idx !== -1) {
      offsets.push(lineStart);
      lineStart = globalOffset + idx + 1;
      idx = chunk.indexOf(0x0a, idx + 1);
    }
    globalOffset += chunk.length;
  }
  // 末行无换行符时补上
  if (lineStart < globalOffset) offsets.push(lineStart);
  return { offsets, bytes: globalOffset };
}

async function loadManifest(): Promise<Manifest> {
  try {
    const raw = await readFile(path.join(INDEX_DIR, 'manifest.json'), 'utf8');
    const parsed = JSON.parse(raw) as Manifest;
    if (parsed && typeof parsed === 'object' && parsed.years) return parsed;
  } catch {
    /* 首次构建 */
  }
  return { dataDir: DATA_DIR, years: {} };
}

async function main() {
  const { years, force } = parseArgs(process.argv.slice(2));
  await mkdir(INDEX_DIR, { recursive: true });
  const manifest = await loadManifest();
  manifest.dataDir = DATA_DIR;

  const all = await (async () => {
    const { readdir } = await import('node:fs/promises');
    const names = await readdir(DATA_DIR);
    return names
      .map((n) => n.match(/^year-(\d{4})\.jsonl$/)?.[1])
      .filter((s): s is string => Boolean(s))
      .map(Number)
      .sort((a, b) => a - b);
  })();

  if (!all.length) {
    console.error(`数据集目录里没有 year-YYYY.jsonl：${DATA_DIR}`);
    process.exit(1);
  }

  const targets = years === 'all' ? all : years.filter((y) => all.includes(y));
  const skipped = years === 'all' ? [] : years.filter((y) => !all.includes(y));
  if (skipped.length) console.warn(`跳过（文件不存在）：${skipped.join(', ')}`);

  console.log(`数据集：${DATA_DIR}`);
  console.log(`索引目录：${INDEX_DIR}`);
  console.log(`待处理：${targets.length} 个年份（数据集共 ${all.length} 个）\n`);

  let built = 0;
  let reused = 0;
  const t0 = Date.now();

  for (const y of targets) {
    const file = path.join(DATA_DIR, `year-${y}.jsonl`);
    const outBin = path.join(INDEX_DIR, `year-${y}.offsets.bin`);
    const st = await stat(file);
    const prev = manifest.years[String(y)];

    if (!force && prev && prev.bytes === st.size && prev.mtimeMs === st.mtimeMs) {
      try {
        await stat(outBin);
        reused++;
        continue;
      } catch {
        /* 索引文件被删了，重建 */
      }
    }

    const tick = Date.now();
    const { offsets, bytes } = await scanOffsets(file);
    const arr = Uint32Array.from(offsets);
    await writeFile(outBin, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    manifest.years[String(y)] = {
      rows: offsets.length,
      bytes,
      mtimeMs: st.mtimeMs,
      builtAt: new Date().toISOString(),
    };
    built++;
    console.log(
      `  ${y}  ${offsets.length} 行  ${(bytes / 1024 / 1024).toFixed(0)} MB  ${Date.now() - tick} ms`,
    );
  }

  await writeFile(path.join(INDEX_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(
    `\n完成：新建 ${built} 个，复用 ${reused} 个，耗时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`,
  );
  const sz = await totalSize();
  console.log(`索引总大小：${(sz.bytes / 1024 / 1024).toFixed(2)} MB（${sz.length} 个文件）`);
}

async function totalSize(): Promise<{ bytes: number; length: number }> {
  const { readdir } = await import('node:fs/promises');
  const names = await readdir(INDEX_DIR);
  let bytes = 0;
  for (const n of names) {
    const s = await stat(path.join(INDEX_DIR, n));
    bytes += s.size;
  }
  return { bytes, length: names.length };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
