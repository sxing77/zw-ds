'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { draftKey, readCheckoutDraft, type CheckoutDraft } from '@/lib/commerce/client';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import { readSseData } from '@/lib/ai/read-sse';
import { generateChart } from '@/lib/ziwei/algorithm';
import { compareHeming, hemingBirthInfo } from '@/lib/ziwei/heming';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import HemingResult from './HemingResult';
import styles from './ZiweiSite.module.css';

// ─── AiContent 渲染器（与 InsightPanel 一致）────────────────
function AiContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {lines.map((line, i) => {
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/);
        if (sectionMatch) {
          return (
            <div key={i} style={{ paddingTop: i === 0 ? 0 : '14px', paddingBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ac)', letterSpacing: '0.04em' }}>
                【{sectionMatch[1]}】
              </span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} style={{ height: '4px' }} />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <div key={i} style={{ fontSize: '13px', lineHeight: 1.75, color: 'var(--tx-2)' }}>
            {parts.map((part, j) =>
              j % 2 === 0
                ? part
                : <strong key={j} style={{ fontWeight: 500, color: 'var(--tx-0)' }}>{part}</strong>
            )}
          </div>
        );
      })}
      {streaming && (
        <span style={{
          display: 'inline-block', width: '7px', height: '13px',
          background: 'var(--ac)', opacity: 0.5, borderRadius: '2px',
          animation: 'pulse 1s ease-in-out infinite',
          verticalAlign: 'middle', marginLeft: '2px',
        }} />
      )}
    </div>
  );
}

export default function HemingWorkspace({ firstPerson, purchaseEnabled }: {
  firstPerson?: { form: BirthFormState; revision: number }; purchaseEnabled: boolean;
}) {
  const [formA, setFormA] = useState<BirthFormState | null>(null);
  const [formB, setFormB] = useState<BirthFormState | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [draftAnalysis, setDraftAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [question, setQuestion] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    birthA: BirthInfo;
    birthB: BirthInfo;
    chartA: ZiweiChart;
    chartB: ZiweiChart;
    comparison: ReturnType<typeof compareHeming>;
  } | null>(null);
  const resultHeading = useRef<HTMLDivElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const previousTurn = useRef<{ question?: string; answer: string } | null>(null);

  useEffect(() => () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  useEffect(() => {
    if (result) {
      resultHeading.current?.focus({ preventScroll: true });
      resultHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [result]);

  function updateForm(side: 'A' | 'B', form: BirthFormState) {
    if (side === 'A') setFormA(form);
    else setFormB(form);
    activeRequest.current?.abort();
    activeRequest.current = null;
    previousTurn.current = null;
    setAnalyzing(false);
    setAnalysis('');
    setDraftAnalysis('');
    setQuestion('');
    setFormError(null);
    setAnalysisError('');
    setResult(null);
  }

  function calculateResult() {
    setFormError(null);
    let party = '甲方';
    try {
      const birthA = hemingBirthInfo(formA);
      const chartA = generateChart(birthA);
      party = '乙方';
      const birthB = hemingBirthInfo(formB);
      const chartB = generateChart(birthB);
      setResult({ birthA, birthB, chartA, chartB, comparison: compareHeming(chartA, chartB) });
    } catch (error) {
      setFormError(party + '：' + (error instanceof Error ? error.message : '请核对出生资料。'));
    }
  }

  async function runAnalysis(questionInput?: string) {
    if (activeRequest.current || !result) return;
    const questionText = questionInput?.trim();
    if (questionInput !== undefined && !questionText) return;
    setAnalysisError('');
    const { birthA, birthB } = result;
    const controller = new AbortController();
    activeRequest.current = controller;
    setAnalyzing(true);
    setDraftAnalysis('');

    try {
      const res = await fetch('/api/heming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthA, birthB, question: questionText, previous: questionText ? previousTurn.current : undefined }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === 'string' ? body.error : '合盘服务暂时不可用，请重试。');
      }
      if (!res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
        throw new Error('合盘服务返回异常，请重试。');
      }

      let text = '';
      let complete = false;
      for await (const data of readSseData(res.body)) {
        if (activeRequest.current !== controller) return;
        if (data === '[DONE]') {
          complete = true;
          break;
        }
        const event = JSON.parse(data);
        if (typeof event?.error === 'string') throw new Error(event.error);
        if (typeof event?.delta?.text === 'string') {
          text += event.delta.text;
          setDraftAnalysis(text);
        }
      }
      if (activeRequest.current !== controller) return;
      if (!complete || !text.trim()) throw new Error('合盘分析未完成，请重试。');
      setAnalysis(text);
      previousTurn.current = { question: questionText, answer: text.slice(0, 8000) };
      setQuestion('');
      analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (activeRequest.current === controller) {
        const message = error instanceof Error && !(error instanceof SyntaxError || error instanceof TypeError)
          ? error.message
          : '分析暂时不可用，请重试。';
        setAnalysisError(message);
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setDraftAnalysis('');
        setAnalyzing(false);
      }
    }
  }

  const visibleAnalysis = draftAnalysis || analysis;

  function tryAiFromPreview() {
    analysisRef.current?.focus({ preventScroll: true });
    analysisRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (!analysis && !activeRequest.current) void runAnalysis();
  }

  function startPurchase() {
    if (!result) return;
    function forCheckout({ year, month, day, hour, gender }: BirthInfo) {
      return { year, month, day, hour, gender };
    }
    const birthA = forCheckout(result.birthA);
    const birthB = forCheckout(result.birthB);
    const saved = readCheckoutDraft();
    const samePair = saved && JSON.stringify([saved.birthA, saved.birthB]) === JSON.stringify([birthA, birthB]);
    const draft: CheckoutDraft = { birthA, birthB, requestId: samePair ? saved.requestId : crypto.randomUUID(), expiresAt: Date.now() + 15 * 60_000 };
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
    window.location.assign('/checkout/compatibility');
  }

  const developmentReading = process.env.NODE_ENV === 'development' && !purchaseEnabled;

  return (
    <section className={styles.hemingWorkspace} aria-labelledby="heming-heading">
      <div className={styles.hemingIntro}>
        <h1 id="heming-heading">紫微斗数双人合盘</h1>
        <p>填写双方的出生日期与时辰，免费查看两张命盘以及宫位、主星和四化的对应。</p>
        {purchaseEnabled && <Link href="/account/reports" className={styles.sampleLink}>我的报告</Link>}
      </div>
      <div className={styles.hemingGrid}>
        {/* 甲方 */}
        <div className={styles.hemingCard}>
          <span className={styles.hemingLabel}>甲方 — A</span>
          <BirthForm
            key={firstPerson?.revision}
            initialData={firstPerson?.form}
            hideSubmit
            onSubmit={() => {}}
            onFormSave={form => updateForm('A', form)}
          />
        </div>

        {/* 乙方 */}
        <div className={styles.hemingCard}>
          <span className={styles.hemingLabel}>乙方 — B</span>
          <BirthForm
            hideSubmit
            onSubmit={() => {}}
            onFormSave={form => updateForm('B', form)}
          />
        </div>
      </div>

      {!result && <div className={styles.hemingStart}>
        <button type="button" className={styles.hemingPrimary} onClick={calculateResult}>查看免费合盘</button>
        {formError && <p role="alert" className={styles.hemingError}>{formError}</p>}
      </div>}

      {result && <div ref={resultHeading} tabIndex={-1} role="region" aria-label="免费合盘结果">
        <HemingResult
          chartA={result.chartA}
          chartB={result.chartB}
          comparison={result.comparison}
          onTryAi={developmentReading ? tryAiFromPreview : undefined}
          hasAiReading={Boolean(analysis) || analyzing}
          onPurchase={purchaseEnabled ? startPurchase : undefined}
        />
      </div>}

      {result && developmentReading && <div ref={analysisRef} role="region" tabIndex={-1} className={styles.hemingCard} aria-labelledby="heming-ai-heading">
        <h2 id="heming-ai-heading" className={styles.hemingAiHeading}>合盘详解</h2>
        {!analysis && !analyzing && <button type="button" className={styles.secondaryButton} onClick={() => runAnalysis()}>
          {analysisError ? '重试合盘详解' : '生成合盘详解'}
        </button>}

        {analyzing && !analysis && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '40px 0', color: 'var(--zw-muted)', fontSize: '13px' }}>
            <div style={{
              width: '14px', height: '14px',
              border: '2px solid var(--zw-line)', borderTopColor: 'var(--zw-accent)',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            正在对比双方命盘…
          </div>
        )}

        {visibleAnalysis && <AiContent text={visibleAnalysis} streaming={analyzing && Boolean(draftAnalysis)} />}

        {analysisError && (
          <div role="alert" style={{ padding: '12px 16px', borderRadius: '2px', border: '1px solid var(--zw-line)', background: 'var(--zw-panel)', fontSize: '13px', color: 'var(--zw-muted)', marginTop: '12px' }}>
            {analysisError}
          </div>
        )}
      </div>}

      {/* ═══ 针对合盘的追问聊天框（仅分析完成后显示）═══════════ */}
      {analysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: 'var(--zw-muted)', marginBottom: '4px' }}>
            针对此次合盘继续追问
          </div>

          {/* 快捷问题 */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              '感情匹配度如何？',
              '适合合伙创业吗？',
              '两人结婚是否合适？',
              '哪方面最容易产生矛盾？',
              '财运是否互补？',
            ].map(q => (
              <button
                key={q}
                onClick={() => { setQuestion(q); runAnalysis(q); }}
                disabled={analyzing}
                className="border border-[var(--zw-line)] bg-transparent text-[var(--zw-muted)] hover:border-[var(--zw-accent)] hover:text-[var(--zw-ink)] transition-colors rounded-[2px] px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {q}
              </button>
            ))}
          </div>

          {/* 输入框 + 追问按钮 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && !analyzing) runAnalysis(question);
              }}
              maxLength={2000}
              placeholder="继续追问，如：哪几年是两人感情关键期？"
              disabled={analyzing}
              className="input-base"
              style={{ fontSize: '13px', flex: 1 }}
            />
            <button
              onClick={() => runAnalysis(question)}
              disabled={analyzing || !question.trim()}
              style={{
                padding: '10px 20px', borderRadius: '2px', border: 'none',
                background: analyzing ? 'var(--zw-soft)' : 'var(--zw-button)',
                color: analyzing ? 'var(--zw-muted)' : '#fff',
                fontSize: '13px', fontWeight: 500,
                cursor: analyzing ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {analyzing ? '分析中…' : '继续追问'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
