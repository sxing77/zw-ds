export const reportChapters = ['双方关系总览', '夫妻宫与主星', '四化与相处模式', '互补、摩擦与沟通'] as const;
export const reportAmountCents = 699;
export const reportFollowupLimit = 2;

export type ReportKind = 'ziwei' | 'bazi' | 'compatibility';

export interface ReportProductSpec {
  kind: ReportKind;
  title: string;
  subtitle: string;
  amountCents: number;
  followupLimit: number;
  chapters: readonly { title: string; summary: string }[];
}

export const REPORT_PRODUCTS: Record<ReportKind, ReportProductSpec> = {
  ziwei: {
    kind: 'ziwei',
    title: '紫微命盘详批全书',
    subtitle: '依倪海厦《天纪》与《紫微斗数全集》编次，系统推演格局、财官、六亲与岁运节点。',
    amountCents: reportAmountCents,
    followupLimit: reportFollowupLimit,
    chapters: [
      { title: '命身格局与主星总论', summary: '定调先天性情、命身双宫联动与三方四正强弱' },
      { title: '财官事业与迁徙机缘', summary: '官禄、财帛、迁移三宫交互，定位发力赛道与求财方式' },
      { title: '夫妻感情与六亲缘分', summary: '夫妻宫星曜与四化引动，解析伴侣特质与相处课题' },
      { title: '十年大限与近三年流年节点', summary: '点明当前大限转折、化忌冲照年份与趋吉避凶时机' },
    ],
  },
  bazi: {
    kind: 'bazi',
    title: '八字子平精批全案',
    subtitle: '依《穷通宝鉴》《三命通会》原典推演，厘清用神喜忌、事业财路与大运流年进退。',
    amountCents: reportAmountCents,
    followupLimit: reportFollowupLimit,
    chapters: [
      { title: '四柱八字与日主强弱', summary: '真太阳时与节气四柱校核，定明五行旺衰与身强身弱' },
      { title: '《穷通宝鉴》调候与格局用神', summary: '月令寒暖燥湿取用，辨明喜用神、忌神与成格高低' },
      { title: '事业财运与婚姻宫位', summary: '十神配置、日支夫妻宫与食伤财官交互推演' },
      { title: '大运流年吉凶与岁运节点', summary: '拆解当前大运走势、关键流年冲合与进退策略' },
    ],
  },
  compatibility: {
    kind: 'compatibility',
    title: '完整合盘报告',
    subtitle: '双向对照双方命盘叠宫与生年四化，读懂感情磨合、合伙分工与长久相处之道。',
    amountCents: reportAmountCents,
    followupLimit: reportFollowupLimit,
    chapters: [
      { title: reportChapters[0], summary: '双方命宫地支关系与整体契合度定调' },
      { title: reportChapters[1], summary: '甲方夫妻宫看乙方命宫、乙方夫妻宫看甲方命宫双向对照' },
      { title: reportChapters[2], summary: '生年禄权科忌落入对方十二宫的实际引力与消耗点' },
      { title: reportChapters[3], summary: '分歧触发场景、沟通切入点与长期相处建议' },
    ],
  },
};

export type ReportChapter = { title: string; body: string };
export type ReportFollowup = { question: string; answer: string };
export const orderLabels = {
  pending: '待付款', paid: '已付款', refunding: '退款处理中', refunded: '已退款', expired: '结账已过期',
};
