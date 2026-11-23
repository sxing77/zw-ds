'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { BirthFormState } from '@/components/BirthForm';
import { BirthProfilesProvider } from '@/components/BirthProfiles';
import ChartBoard from '@/components/ChartBoard';
import ChartWorkspace from '@/components/ChartWorkspace';
import HemingWorkspace from '@/components/HemingWorkspace';
import { generateChart } from '@/lib/ziwei/algorithm';
import { BRANCHES, SHICHEN, STEMS } from '@/lib/ziwei/constants';
import { searchParamsToForm } from '@/lib/ziwei/share';
import type { Palace } from '@/lib/ziwei/types';
import styles from './ZiweiSite.module.css';

type WorkspaceMode = 'chart' | 'compatibility';

function ModeSync({ onModeChange }: { onModeChange: (mode: WorkspaceMode) => void }) {
  const mode = useSearchParams().get('mode') === 'compatibility' ? 'compatibility' : 'chart';
  useEffect(() => onModeChange(mode), [mode, onModeChange]);
  return null;
}

interface FeaturedCelebrity {
  id: string;
  name: string;
  category: string;
  description: string;
  birthMeta: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: 'male' | 'female';
  notable: string;
}

const FEATURED_CELEBRITIES: readonly FeaturedCelebrity[] = [
  {
    id: 'jay-chou',
    name: '周杰伦',
    category: '文艺',
    description: '华语流行音乐人',
    birthMeta: '1979年1月18日 · 丑时（腊月二十）',
    year: 1979,
    month: 1,
    day: 18,
    hour: 1,
    gender: 'male',
    notable: '甲子宫贪狼旺度化禄立命，事业宫丙辰七杀庙旺，财帛宫庚申破军得地——杀破狼三方会照，迁移宫戊午紫微帝座入庙相照。',
  },
  {
    id: 'elon-musk',
    name: '马斯克',
    category: '科技',
    description: 'SpaceX 与特斯拉创始人',
    birthMeta: '1971年6月28日 · 辰时（07:30 文献记载）',
    year: 1971,
    month: 6,
    day: 28,
    hour: 4,
    gender: 'male',
    notable: '庚寅宫天机得地、太阴旺度同坐立命，三方会天同、天梁成「机月同梁」兼动星交会，命盘迁移与变动之力极盛。',
  },
  {
    id: 'ren-zhengfei',
    name: '任正非',
    category: '商业',
    description: '华为创始人',
    birthMeta: '1944年10月25日 · 卯时（九月初九）',
    year: 1944,
    month: 10,
    day: 25,
    hour: 3,
    gender: 'male',
    notable: '辛未宫天梁旺度守命，三方太阳、太阴并照；《天纪》论天梁主荫庇与风宪之骨，越历风霜而根基愈坚。',
  },
  {
    id: 'zhang-ailing',
    name: '张爱玲',
    category: '文艺',
    description: '中国现代文学作家',
    birthMeta: '1920年9月30日 · 丑时（八月十九）',
    year: 1920,
    month: 9,
    day: 30,
    hour: 1,
    gender: 'female',
    notable: '甲申宫贪狼独坐立命，对宫武曲相照，命局水二局清冷孤峭，星象与其文学笔触及生平际遇严丝合缝。',
  },
];

const FEATURED_CHARTS = FEATURED_CELEBRITIES.map(person => ({
  person,
  chart: generateChart({
    year: person.year,
    month: person.month,
    day: person.day,
    hour: person.hour,
    gender: person.gender,
    name: person.name,
  }),
}));

type WorkspaceProps = {
  initialMode?: WorkspaceMode;
  sharedForm?: BirthFormState | null;
  purchaseEnabled?: boolean;
};

export default function ZiweiWorkspace(props: WorkspaceProps) {
  return (
    <BirthProfilesProvider>
      <ZiweiMain {...props} />
    </BirthProfilesProvider>
  );
}

function ZiweiMain({ initialMode = 'chart', sharedForm, purchaseEnabled = false }: WorkspaceProps) {
  const [mode, setMode] = useState<WorkspaceMode>(initialMode);
  const [firstPerson, setFirstPerson] = useState<{ form: BirthFormState; revision: number }>();
  const [fragmentForm, setFragmentForm] = useState<BirthFormState | null>(null);
  const chartForm = fragmentForm ?? sharedForm;
  const [showBirthForm, setShowBirthForm] = useState<boolean>(Boolean(chartForm));
  const [celebrityIdx, setCelebrityIdx] = useState<number>(0);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);

  useEffect(() => {
    if (window.location.pathname !== '/chart') return;
    const readFragment = () => {
      const hash = window.location.hash;
      const parsed = hash.startsWith('#birth?') ? searchParamsToForm(new URLSearchParams(hash.slice(7))) : null;
      setFragmentForm(parsed);
      if (parsed) setShowBirthForm(true);
    };
    readFragment();
    window.addEventListener('hashchange', readFragment);
    return () => window.removeEventListener('hashchange', readFragment);
  }, []);

  useEffect(() => {
    if (chartForm) setShowBirthForm(true);
  }, [chartForm]);

  function switchMode(nextMode: WorkspaceMode) {
    if (nextMode === mode) return;
    const url = new URL(window.location.href);
    if (nextMode === 'compatibility') url.searchParams.set('mode', 'compatibility');
    else url.searchParams.delete('mode');
    window.history.pushState(null, '', url);
    setMode(nextMode);
  }

  function useChartForHeming(form: BirthFormState) {
    setFirstPerson(current => ({ form, revision: (current?.revision ?? 0) + 1 }));
    switchMode('compatibility');
    document.getElementById('paipan')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  if (mode === 'compatibility') {
    return (
      <div id="paipan" className={styles.workspace}>
        <Suspense><ModeSync onModeChange={setMode} /></Suspense>
        <div className={styles.modeBanner}>
          <span>当前为双人合盘模式</span>
          <button
            type="button"
            onClick={() => switchMode('chart')}
            className={styles.modeSwitchLink}
          >
            ← 返回单人排盘
          </button>
        </div>
        <HemingWorkspace firstPerson={firstPerson} purchaseEnabled={purchaseEnabled} />
      </div>
    );
  }

  const currentFeatured = FEATURED_CHARTS[celebrityIdx] ?? FEATURED_CHARTS[0];
  const { person, chart } = currentFeatured;
  const mingPalace = chart.palaces.find(p => p.isMingGong) ?? chart.palaces[0];
  const activePalace = selectedPalace ?? mingPalace;
  const activeMajorStars = activePalace.stars
    .filter(s => s.type === 'major')
    .map(s => `${s.name}${s.brightnessRaw || ''}${s.siHua ? `化${s.siHua}` : ''}`);

  return (
    <div id="paipan" className={styles.workspace}>
      <Suspense><ModeSync onModeChange={setMode} /></Suspense>
      <div className={styles.homeHero}>
        <aside className={styles.homeRail} aria-labelledby="home-brand-heading">
          <h1 id="home-brand-heading" className={styles.homeTitle}>
            以《天纪》之法，
            <span>排一张算得准的盘</span>
          </h1>
          <p className={styles.homeLead}>
            生辰差一刻，十二宫皆移。严循倪海厦《天纪》安星法度与明刊《紫微斗数全书》，先校地方真太阳时与历史夏令时，再定命身十干四化。
          </p>

          <div className={styles.homeActions}>
            <button
              type="button"
              className={styles.primaryCta}
              onClick={() => setShowBirthForm(true)}
            >
              {showBirthForm ? '正在录入生辰' : '排我的盘'}
            </button>
            <div className={styles.homeSubLinks}>
              <Link href="/heming" className={styles.textLink}>
                双人合盘
              </Link>
              {showBirthForm && (
                <button
                  type="button"
                  className={styles.textLinkButton}
                  onClick={() => setShowBirthForm(false)}
                >
                  看名人实盘
                </button>
              )}
            </div>
          </div>

          <dl className={styles.homeSpecs} aria-label="排盘校时精度">
            <div>
              <dt>经度校时</dt>
              <dd>全国 2724 区县及海外华人城市逐分修正</dd>
            </div>
            <div>
              <dt>历史夏令时</dt>
              <dd>1986–1991 年大陆夏令时跨界自动提示</dd>
            </div>
            <div>
              <dt>天文定气</dt>
              <dd>八字月柱与节气交节精确到分秒</dd>
            </div>
          </dl>
        </aside>

        <div className={styles.homeStage}>
          {showBirthForm ? (
            <div className={styles.homeFormStage}>
              <div className={styles.homeStageBar}>
                <span>录入生辰 · 本地实时排盘</span>
                <button
                  type="button"
                  className={styles.textLinkButton}
                  onClick={() => setShowBirthForm(false)}
                >
                  ← 返回名人命盘
                </button>
              </div>
              <ChartWorkspace
                key={JSON.stringify(chartForm)}
                sharedForm={chartForm}
                purchaseEnabled={purchaseEnabled}
                onUseForHeming={useChartForHeming}
              />
            </div>
          ) : (
            <div className={`${styles.result} ${styles.celebrityShowcase}`}>
              <div className={styles.celebrityBar}>
                <div className={styles.celebrityMeta}>
                  <h2 className={styles.celebrityName}>
                    {person.name}
                    <small>{person.description}</small>
                  </h2>
                  <p className={styles.celebrityBirth}>
                    {person.birthMeta}｜{chart.wuxingJuName}｜命宫{STEMS[mingPalace.stem]}{BRANCHES[mingPalace.branch]}
                  </p>
                </div>
                <div className={styles.celebritySwitcher} role="tablist" aria-label="切换名人命盘">
                  {FEATURED_CHARTS.map((item, idx) => (
                    <button
                      key={item.person.id}
                      type="button"
                      role="tab"
                      aria-selected={idx === celebrityIdx}
                      className={idx === celebrityIdx ? styles.celebrityTabActive : styles.celebrityTab}
                      onClick={() => {
                        setCelebrityIdx(idx);
                        setSelectedPalace(null);
                      }}
                    >
                      {item.person.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.boardPanel}>
                <ChartBoard
                  chart={chart}
                  onPalaceSelect={p => setSelectedPalace(p)}
                />
              </div>

              <div className={styles.celebrityFoot}>
                <div className={styles.celebrityPalaceReadout}>
                  <span>
                    <strong>{activePalace.name}（{STEMS[activePalace.stem]}{BRANCHES[activePalace.branch]}）</strong>：
                    {activeMajorStars.length > 0 ? activeMajorStars.join('、') : `空宫借对宫${activePalace.borrowedStars?.join('、') || '星曜'}`}
                  </span>
                </div>
                <p className={styles.celebrityNote}>
                  {person.notable}
                  {' '}
                  <button
                    type="button"
                    onClick={() => setShowBirthForm(true)}
                    className="underline decoration-[var(--zw-line)] underline-offset-4 text-[var(--zw-accent)] hover:decoration-[var(--zw-accent)] transition-colors"
                  >
                    排自己的命盘，试读主星批注
                  </button>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
