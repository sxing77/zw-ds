import assert from 'node:assert/strict';
import { readSseData } from '../../lib/ai/read-sse';
import type { BirthFormState } from '../../components/BirthForm';
import { generateChart } from '../../lib/ziwei/algorithm';
import { compareHeming, hemingBirthInfo } from '../../lib/ziwei/heming';
import { formToBirthInfo, formToSearchParams, formToSolarDate, searchParamsToForm } from '../../lib/ziwei/share';
import { lunarMonthDayCount, solarToLunar } from '../../lib/ziwei/lunar-solar';

const form: BirthFormState = {
  name: '甲方',
  year: '2000', month: '1', day: '31',
  clockHour: '23', clockMinute: '30', unknownTime: false,
  province: '', city: '', longitude: 120, gender: 'male',
};

assert.deepEqual(hemingBirthInfo(form), { year: 2000, month: 2, day: 1, hour: 0, gender: 'male' });
assert.deepEqual(hemingBirthInfo({ ...form, longitude: 100 }), { year: 2000, month: 1, day: 31, hour: 11, gender: 'male' });
assert.deepEqual(hemingBirthInfo({ ...form, clockHour: '0', clockMinute: '1', longitude: 100 }), {
  year: 2000, month: 1, day: 30, hour: 11, gender: 'male',
});
assert.deepEqual(hemingBirthInfo({ ...form, clockHour: '0', clockMinute: '1', longitude: 110 }), {
  year: 2000, month: 1, day: 31, hour: 0, gender: 'male',
});
assert.throws(() => hemingBirthInfo({ ...form, month: '2' }), /公历出生日期不存在/);
assert.throws(() => hemingBirthInfo({ ...form, unknownTime: true }), /需要已知出生时辰/);
assert.throws(() => hemingBirthInfo({ ...form, clockMinute: '60' }), /有效的出生时间/);

assert.deepEqual(searchParamsToForm(formToSearchParams(form)), form);
assert.equal(searchParamsToForm(new URLSearchParams('y=2001&m=2&d=29&h=23')), null);
assert.equal(searchParamsToForm(new URLSearchParams('y=2000&m=2&d=29&h=24')), null);

const leapBirth = { ...form, calendar: 'lunar' as const, year: '2023', month: '-2', day: '1' };
const solarBirth = { ...form, year: '2023', month: '3', day: '22' };
assert.deepEqual(formToSolarDate(leapBirth), { year: 2023, month: 3, day: 22 });
assert.deepEqual(solarToLunar(2023, 3, 22), { year: 2023, month: -2, day: 1 });
assert.deepEqual(formToSolarDate({ ...leapBirth, month: '2' }), { year: 2023, month: 2, day: 20 });
assert.equal(lunarMonthDayCount(2023, 2, true), 29);
assert.throws(() => hemingBirthInfo({ ...leapBirth, day: '30' }), /农历出生日期不存在/);
assert.throws(() => hemingBirthInfo({ ...leapBirth, year: '2024' }), /农历出生日期不存在/);
assert.deepEqual(formToBirthInfo(leapBirth), formToBirthInfo(solarBirth));
assert.deepEqual(hemingBirthInfo(leapBirth), { year: 2023, month: 3, day: 23, hour: 0, gender: 'male' });
assert.deepEqual(searchParamsToForm(formToSearchParams(leapBirth)), leapBirth);
assert.equal(searchParamsToForm(new URLSearchParams('y=2023&m=-2&d=1')), null);
assert.equal(searchParamsToForm(new URLSearchParams('y=2023&m=-2&d=30&cal=lunar')), null);

const chartA = generateChart(hemingBirthInfo(form));
const chartB = generateChart(hemingBirthInfo({ ...form, year: '1990', month: '5', day: '12', clockHour: '14', gender: 'female' }));
const result = compareHeming(chartA, chartB);
const swapped = compareHeming(chartB, chartA);
assert.deepEqual(result.aToB, swapped.bToA);
assert.deepEqual(result.bToA, swapped.aToB);
assert.equal(result.aToB.lifePalaceOverlay?.branch, chartA.mingGongBranch);
assert.equal(result.bToA.lifePalaceOverlay?.branch, chartB.mingGongBranch);
assert.deepEqual(result.aToB.transformations.map(t => t.kind), ['禄', '权', '科', '忌']);
assert.deepEqual(result.aToB.starOverlays.map(t => t.star), ['红鸾', '天喜', '擎羊', '陀罗']);
for (const t of result.aToB.transformations) {
  assert.deepEqual(t.targetPalaces.map(p => p.branch),
    chartB.palaces.filter(p => p.stars.some(star => star.name === t.star)).map(p => p.branch));
}

const spouse = chartA.palaces.find(p => p.name === '夫妻' || p.name === '夫妻宫')!;
const opposite = chartA.palaces.find(p => p.branch === (spouse.branch + 6) % 12)!;
const targetLife = chartB.palaces.find(p => p.branch === chartB.mingGongBranch)!;
spouse.stars = [];
opposite.stars = [{ name: '紫微', type: 'major' }];
targetLife.stars = [{ name: '紫微', type: 'major' }];
const matches = compareHeming(chartA, chartB).aToB.spouseToLife;
assert.deepEqual(matches.directMatches, []);
assert.deepEqual(matches.borrowedMatches, ['紫微']);
assert.equal(matches.spouse.borrowedFrom?.branch, opposite.branch);

async function testSse() {
  const text = ': heartbeat\r\ndata: 紫微\r\ndata: 合盘\r\n\r\ndata: [DONE]\n\n';
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const events: string[] = [];
  for await (const event of readSseData(stream)) events.push(event);
  assert.deepEqual(events, ['紫微\n合盘', '[DONE]']);

  const incomplete = new Response('data: first\n\ndata: interrupted').body!;
  const received: string[] = [];
  for await (const event of readSseData(incomplete)) received.push(event);
  assert.deepEqual(received, ['first']);
}

testSse().then(() => console.log('heming regression passed')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
