import type { BirthFormState } from '@/components/BirthForm';
import { formToBirthInfo } from './share';
import { getSiHuaByStem } from './sihua';
import type { Palace, SiHua, ZiweiChart } from './types';

export function hemingBirthInfo(form: BirthFormState | null) {
  if (!form?.year || !form.month || !form.day) throw new Error('请填写完整的出生日期。');
  if (form.unknownTime) throw new Error('紫微合盘需要已知出生时辰。');
  if (!/^\d{1,2}$/.test(form.clockHour) || Number(form.clockHour) > 23 ||
      !/^\d{1,2}$/.test(form.clockMinute) || Number(form.clockMinute) > 59) {
    throw new Error('请填写有效的出生时间。');
  }
  if (!Number.isFinite(form.longitude) || Math.abs(form.longitude) > 180) {
    throw new Error('请核对出生地经度。');
  }
  const { year, month, day, hour, gender } = formToBirthInfo(form);
  return { year, month, day, hour, gender };
}

function palaceLocation({ name, branch }: Palace) {
  return { name, branch };
}

function palaceStars(chart: ZiweiChart, palace: Palace) {
  const own = palace.stars.filter(star => star.type === 'major').map(star => star.name);
  const opposite = own.length ? undefined : chart.palaces.find(p => p.branch === (palace.branch + 6) % 12);
  return {
    palace: palaceLocation(palace),
    own,
    borrowed: opposite?.stars.filter(star => star.type === 'major').map(star => star.name) ?? [],
    borrowedFrom: opposite ? palaceLocation(opposite) : null,
  };
}

const observedStars = ['红鸾', '天喜', '擎羊', '陀罗'];

function compareDirection(source: ZiweiChart, target: ZiweiChart) {
  const sourceSpouse = source.palaces.find(p => p.name === '夫妻' || p.name === '夫妻宫');
  const targetLife = target.palaces.find(p => p.branch === target.mingGongBranch);
  if (!sourceSpouse || !targetLife) throw new Error('命盘缺少命宫或夫妻宫。');

  const spouse = palaceStars(source, sourceSpouse);
  const life = palaceStars(target, targetLife);
  const directMatches = spouse.own.filter(star => life.own.includes(star));
  const lifeStars = new Set([...life.own, ...life.borrowed]);
  const borrowedMatches = [...spouse.own, ...spouse.borrowed]
    .filter(star => lifeStars.has(star) && !directMatches.includes(star));
  const overlay = target.palaces.find(p => p.branch === source.mingGongBranch);

  return {
    lifePalaceOverlay: overlay ? palaceLocation(overlay) : null,
    spouseToLife: { spouse, life, directMatches, borrowedMatches },
    transformations: Object.entries(getSiHuaByStem(source.lunarInfo.yearStem)).map(([kind, star]) => ({
      kind: kind as SiHua,
      star,
      targetPalaces: target.palaces.filter(p => p.stars.some(item => item.name === star)).map(palaceLocation),
    })),
    starOverlays: observedStars.map(star => {
      const sourceBranches = source.palaces.filter(p => p.stars.some(item => item.name === star)).map(p => p.branch);
      return { star, targetPalaces: target.palaces.filter(p => sourceBranches.includes(p.branch)).map(palaceLocation) };
    }),
  };
}

/** 可供界面、报告和模型共用的本命双盘事实。 */
export function compareHeming(chartA: ZiweiChart, chartB: ZiweiChart) {
  const aToB = compareDirection(chartA, chartB);
  const bToA = compareDirection(chartB, chartA);
  const a = chartA.mingGongBranch;
  const b = chartB.mingGongBranch;
  let relation: '同支' | '六合' | '六冲' | null = null;
  if (a === b) relation = '同支';
  else if ((a + b) % 12 === 1) relation = '六合';
  else if (Math.abs(a - b) === 6) relation = '六冲';
  return { aToB, bToA, lifeBranches: { a, b, relation } };
}
