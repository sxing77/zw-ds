export type Wuxing = '木' | '火' | '土' | '金' | '水';

export type TenGod =
  | '日主'
  | '比肩'
  | '劫财'
  | '食神'
  | '伤官'
  | '偏财'
  | '正财'
  | '七杀'
  | '正官'
  | '偏印'
  | '正印';

export interface HiddenStemItem {
  stem: string;
  wuXing: Wuxing;
  tenGod: TenGod;
  weight: '本气' | '中气' | '余气';
}

export interface BaziPillar {
  label: '年柱' | '月柱' | '日柱' | '时柱';
  ganZhi: string;
  stem: string;
  branch: string;
  stemWuXing: Wuxing;
  branchWuXing: Wuxing;
  tenGodStem: TenGod;
  hiddenStems: HiddenStemItem[];
  naYin: string;
  diShi: string;      // 十二长生（日干对各支）
  ziZuo: string;      // 自坐十二长生（本柱天干对本柱地支）
  xunKong: string;    // 空亡
  shenSha: string[];  // 神煞
}

export interface DaYunItem {
  index: number;
  ganZhi: string;
  stem: string;
  branch: string;
  tenGodStem: TenGod;
  tenGodBranch: TenGod;
  naYin: string;
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
}

export interface GanZhiRelation {
  type: '天干五合' | '天干相冲' | '地支六合' | '地支三合' | '地支三会' | '地支六冲' | '地支相刑' | '地支相害';
  pillars: string[];
  description: string;
}

export interface WuxingBreakdown {
  counts: Record<Wuxing, number>;
  scores: Record<Wuxing, number>;
  percentages: Record<Wuxing, number>;
  dayMasterElement: Wuxing;
  dayMasterYinYang: '阳' | '阴';
  samePartyScore: number; // 同党（印星 + 比劫）占比 %
  otherPartyScore: number; // 异党（官杀 + 食伤 + 财星）占比 %
  strength: '身强' | '中和偏强' | '中和偏弱' | '身弱';
  favorableElements: Wuxing[]; // 喜用五行
  unfavorableElements: Wuxing[]; // 忌神五行
  tiaoHouYongShen: string[]; // 穷通宝鉴调候用神
  geJuName: string; // 月令主格局
  geJuDescription: string;
}

export interface ClassicalReferences {
  ditiansui: {
    title: string;
    verse: string;
    explanation: string;
  };
  qiongtong: {
    title: string;
    season: string;
    tiaoHou: string[];
    summary: string;
  };
  sanmingRizhu: {
    ganZhi: string;
    naYin: string;
    grade: '上等' | '中等' | '下等';
    summary: string;
    timingHint?: string;
  };
  zipingGeju: {
    name: string;
    summary: string;
  };
}

export interface BaziBirthInput {
  name?: string;
  year: number;
  month: number;
  day: number;
  /** 时辰地支索引 0(子) - 11(亥) */
  hour: number;
  gender: 'male' | 'female';
  province?: string;
  city?: string;
  longitude?: number;
}

export interface BaziPatternSignal {
  name: string;
  level: '吉格' | '留意' | '双面';
  pillars: string[];
  summary: string;
  classicQuote?: string;
}

export interface LiuNianSignal {
  year: number;
  ganZhi: string;
  tenGodStem: TenGod;
  daYunGanZhi: string;
  tags: string[];
  importance: '高' | '中' | '平';
  hint: string;
}

export interface BaziChart {
  birthInfo: BaziBirthInput;
  lunarDateText: string;
  solarTermsHint: string;
  pillars: [BaziPillar, BaziPillar, BaziPillar, BaziPillar];
  taiYuan: string;
  mingGong: string;
  shenGong: string;
  wuxing: WuxingBreakdown;
  relations: GanZhiRelation[];
  patterns: BaziPatternSignal[];
  riShiHint: string;
  upcomingYears: LiuNianSignal[];
  daYunStartAge: number;
  daYunStartYear: number;
  daYuns: DaYunItem[];
  currentDaYunIndex: number;
  classicalRefs: ClassicalReferences;
}
