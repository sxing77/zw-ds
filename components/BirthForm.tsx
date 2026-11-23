'use client';
import { useState, useMemo, useEffect, useId, useRef, useCallback } from 'react';
import styles from './BirthForm.module.css';
import { BirthProfileControls } from './BirthProfiles';
import type { BirthInfo } from '@/lib/ziwei/types';
import { SHICHEN } from '@/lib/ziwei/constants';
import { PROVINCES } from '@/lib/ziwei/cities';
import { calcTrueSolarBranch, formToBirthInfo, formToSolarDate, type BirthCalendar } from '@/lib/ziwei/share';
import { LUNAR_YEAR_MIN, leapMonthOfLunarYear, lunarMonthDayCount, solarToLunar } from '@/lib/ziwei/lunar-solar';
import { BIRTH_NAME_LIMIT, LAST_BIRTH_YEAR, type BirthFormState } from '@/lib/ziwei/birth-form';

export type { BirthFormState } from '@/lib/ziwei/birth-form';
const lunarMonthNames = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const chineseDigits = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function lunarDayName(day: number): string {
  if (day === 20) return '二十';
  if (day === 30) return '三十';
  if (day <= 10) return '初' + chineseDigits[day - 1];
  return (day < 20 ? '十' : '廿') + chineseDigits[day % 10 - 1];
}

interface BirthFormProps {
  onSubmit: (info: BirthInfo) => void;
  loading?: boolean;
  initialData?: Partial<BirthFormState>;
  onFormSave?: (data: BirthFormState) => void;
  /** 隐藏内部「立即起盘」按钮（合盘等场景由父级统一触发） */
  hideSubmit?: boolean;
}

function initialForm(initialData?: Partial<BirthFormState>): BirthFormState {
  return {
    name: initialData?.name ?? '',
    year: initialData?.year ?? '',
    month: initialData?.month ?? '',
    day: initialData?.day ?? '',
    ...(initialData?.calendar === 'lunar' ? { calendar: 'lunar' } : {}),
    clockHour: initialData?.clockHour ?? '8',
    clockMinute: initialData?.clockMinute ?? '0',
    unknownTime: initialData?.unknownTime ?? false,
    province: initialData?.province ?? '',
    city: initialData?.city ?? '',
    longitude: initialData?.longitude ?? 120,
    utcOffsetMinutes: initialData?.utcOffsetMinutes,
    gender: initialData?.gender ?? 'male',
  };
}

export default function BirthForm({ onSubmit, loading, initialData, onFormSave, hideSubmit }: BirthFormProps) {
  const fieldId = useId();
  const formElement = useRef<HTMLFormElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(() => initialForm(initialData));

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [calendarError, setCalendarError] = useState('');

  // 表单状态变化时实时同步给父级（合盘等场景下父级靠这个收集双方数据）
  useEffect(() => {
    onFormSave?.({ ...form });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const cityList = useMemo(() => {
    const prov = PROVINCES.find(p => p.name === form.province);
    return prov ? prov.cities : [];
  }, [form.province]);

  const utcOffset = form.utcOffsetMinutes ?? 480;
  const standardMeridian = (utcOffset / 60) * 15;

  const branch = useMemo(() => {
    if (form.unknownTime) return 0;
    return calcTrueSolarBranch(
      parseInt(form.clockHour) || 0,
      parseInt(form.clockMinute) || 0,
      form.longitude,
      utcOffset,
    );
  }, [form.clockHour, form.clockMinute, form.longitude, utcOffset, form.unknownTime]);

  const offsetMin = Math.round((form.longitude - standardMeridian) * 4);
  const shichenInfo = SHICHEN[branch];

  // ─── 校验逻辑 ───────────────────────────────────────────
  const calendar = form.calendar ?? 'solar';
  const isLunar = calendar === 'lunar';
  const year = Number(form.year);
  const month = Number(form.month);
  const leapMonth = useMemo(() => isLunar && year ? leapMonthOfLunarYear(year) : 0, [isLunar, year]);
  const monthDays = isLunar
    ? (year && month ? lunarMonthDayCount(year, Math.abs(month), month < 0) : 0)
    : (year && month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0);
  const solarDate = useMemo(
    () => formToSolarDate({ year: form.year, month: form.month, day: form.day, calendar }),
    [form.year, form.month, form.day, calendar],
  );

  const errors = {
    year: !form.year ? '请选择出生年份'
      : year < LUNAR_YEAR_MIN || year > LAST_BIRTH_YEAR ? '年份范围：' + LUNAR_YEAR_MIN + '–' + LAST_BIRTH_YEAR
      : '',
    month: !form.month ? '请选择月份' : '',
    day: !form.day ? '请选择日期'
      : form.year && form.month && !solarDate ? (isLunar ? '该农历日期不存在' : '该公历日期不存在')
      : '',
  };

  const applyProfile = useCallback((profile: BirthFormState) => {
    setForm(profile);
    setTouched({});
    setSubmitAttempted(false);
    setCalendarError('');
  }, []);

  function switchCalendar(next: BirthCalendar) {
    if (next === calendar) return;
    const converted = solarDate && (next === 'lunar'
      ? solarToLunar(solarDate.year, solarDate.month, solarDate.day)
      : solarDate);
    const withinRange = converted && converted.year >= LUNAR_YEAR_MIN && converted.year <= LAST_BIRTH_YEAR;
    if (solarDate && !withinRange) {
      setCalendarError('这一天超出了另一种历法的可选年份范围。');
      return;
    }
    setCalendarError('');
    setForm({
      ...form,
      calendar: next,
      year: withinRange ? String(converted.year) : form.year,
      month: withinRange ? String(converted.month) : '',
      day: withinRange ? String(converted.day) : '',
    });
    setTouched({});
    setSubmitAttempted(false);
  }

  function updateDate(key: 'year' | 'month' | 'day', value: string) {
    const next = { ...form, [key]: value };
    if (key === 'year' && isLunar && Number(next.month) < 0 &&
        leapMonthOfLunarYear(Number(next.year)) !== Math.abs(Number(next.month))) {
      next.month = '';
    }
    if (key !== 'day' && next.day && !formToSolarDate(next)) next.day = '';
    setCalendarError('');
    setForm(next);
    setTouched(current => ({ ...current, [key]: true }));
  }

  const handleProvince = (prov: string) => {
    const provData = PROVINCES.find(p => p.name === prov);
    const firstCity = provData?.cities[0];
    setForm({
      ...form,
      province: prov,
      city: firstCity?.name || '',
      longitude: firstCity?.longitude ?? 120,
      utcOffsetMinutes: firstCity?.utcOffsetMinutes,
    });
  };

  const handleCity = (cityName: string) => {
    const prov = PROVINCES.find(p => p.name === form.province);
    const cityData = prov?.cities.find(c => c.name === cityName);
    setForm({
      ...form,
      city: cityName,
      longitude: cityData?.longitude ?? 120,
      utcOffsetMinutes: cityData?.utcOffsetMinutes,
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitAttempted(true);
    setTouched({ year: true, month: true, day: true });
    const invalidField = (['year', 'month', 'day'] as const).find(field => errors[field]);
    if (invalidField) {
      const input = e.currentTarget.elements.namedItem(invalidField);
      if (input instanceof HTMLSelectElement) input.focus();
      return;
    }
    onFormSave?.({ ...form });
    onSubmit(formToBirthInfo(form));
  };

  const dateFields = [
    { key: 'year', label: '出生年份', placeholder: '年份', options: Array.from(
      { length: LAST_BIRTH_YEAR - LUNAR_YEAR_MIN + 1 }, (_, i) => [LAST_BIRTH_YEAR - i, String(LAST_BIRTH_YEAR - i)] as const,
    ) },
    { key: 'month', label: '出生月份', placeholder: '月份', options: Array.from({ length: 12 }, (_, i) => {
      const value = i + 1;
      const label = isLunar ? lunarMonthNames[i] + '月' : value + ' 月';
      const regular = [value, label] as const;
      return value === leapMonth ? [regular, [-value, '闰' + label] as const] : [regular];
    }).flat() },
    { key: 'day', label: '出生日期（日）', placeholder: '日期', options: Array.from(
      { length: monthDays }, (_, i) => [i + 1, isLunar ? lunarDayName(i + 1) : i + 1 + ' 日'] as const,
    ) },
  ] as const;
  const timeFields = [
    { key: 'clockHour', label: '出生小时', count: 24, unit: '时' },
    { key: 'clockMinute', label: '出生分钟', count: 60, unit: '分' },
  ] as const;

  return (
    <form ref={formElement} className={styles.form} onSubmit={handleSubmit} autoComplete="off" noValidate>
      <BirthProfileControls
        form={form}
        hasValidDate={Boolean(solarDate && !errors.year)}
        apply={applyProfile}
        focusDate={() => {
          setSubmitAttempted(true);
          const invalid = (['year', 'month', 'day'] as const).find(field => errors[field]);
          const field = formElement.current?.elements.namedItem(invalid ?? 'year');
          if (field instanceof HTMLSelectElement) field.focus();
        }}
        focusName={() => {
          nameInput.current?.closest('details')?.setAttribute('open', '');
          nameInput.current?.focus();
        }}
      />
      <fieldset className={styles.fieldset}>
        <legend>出生日期</legend>
        <div className={styles.calendar} role="group" aria-label="出生日期历法">
          <button type="button" aria-pressed={!isLunar} onClick={() => switchCalendar('solar')}>公历（阳历）</button>
          <button type="button" aria-pressed={isLunar} onClick={() => switchCalendar('lunar')}>农历（阴历）</button>
        </div>
        <div className={styles.dateGrid}>
          {dateFields.map(({ key, label, placeholder, options }) => {
            const error = (touched[key] || submitAttempted) && errors[key];
            const errorId = `${fieldId}-${key}-error`;
            return (
              <div key={key}>
                <select
                  name={key}
                  aria-label={label}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  required
                  disabled={key === 'day' && !monthDays}
                  value={form[key]}
                  onChange={e => updateDate(key, e.target.value)}
                >
                  <option value="">{placeholder}</option>
                  {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
                {error && <p className={styles.error} id={errorId} role="alert">{error}</p>}
              </div>
            );
          })}
        </div>
        {calendarError && <p className={styles.error} role="alert">{calendarError}</p>}
        {isLunar && solarDate && (
          <p className={styles.hint} role="status">对应公历 {solarDate.year} 年 {solarDate.month} 月 {solarDate.day} 日</p>
        )}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>
          出生时间{' '}
          <small>
            {utcOffset === 480
              ? '北京时间'
              : `当地时间 (UTC${utcOffset >= 0 ? '+' : ''}${utcOffset / 60})`}
          </small>
        </legend>
        <div className={styles.pair}>
          {timeFields.map(({ key, label, count, unit }) => (
            <select
              key={key}
              aria-label={label}
              value={form[key]}
              disabled={form.unknownTime}
              onChange={e => setForm({ ...form, [key]: e.target.value })}
            >
              {Array.from({ length: count }, (_, value) => (
                <option key={value} value={value}>{String(value).padStart(2, '0')} {unit}</option>
              ))}
            </select>
          ))}
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={form.unknownTime} onChange={e => setForm({ ...form, unknownTime: e.target.checked })} />
          <span>{hideSubmit ? '时辰不详（紫微合盘需要已知时辰）' : '时辰不详，暂用子时排参考盘'}</span>
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>性别</legend>
        <div className={styles.pair}>
          {(['male', 'female'] as const).map(gender => (
            <label key={gender} className={styles.radio}>
              <input
                type="radio"
                name={`${fieldId}-gender`}
                checked={form.gender === gender}
                onChange={() => setForm({ ...form, gender })}
              />
              {gender === 'male' ? '男' : '女'}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>出生地点 <small>选填 · 用于时辰校正</small></legend>
        <div className={styles.pair}>
          <select aria-label="出生省份" value={form.province} onChange={e => handleProvince(e.target.value)}>
            <option value="">省份 / 直辖市</option>
            {PROVINCES.map(province => <option key={province.name} value={province.name}>{province.name}</option>)}
          </select>
          <select aria-label="出生城市" value={form.city} onChange={e => handleCity(e.target.value)} disabled={!form.province}>
            <option value="">城市</option>
            {cityList.map(city => <option key={city.name} value={city.name}>{city.name}</option>)}
          </select>
        </div>
        {form.province && !form.unknownTime && (
          <p className={styles.hint} role="status">
            经度时差 {offsetMin > 0 ? '+' : ''}{offsetMin} 分钟 · {shichenInfo.name}（{shichenInfo.range}）
          </p>
        )}
      </fieldset>

      <details className={styles.optional} open={form.name ? true : undefined}>
        <summary>添加姓名 <small>选填</small></summary>
        <input
          ref={nameInput}
          type="text"
          aria-label="姓名"
          placeholder="姓名或称呼"
          maxLength={BIRTH_NAME_LIMIT}
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
      </details>

      {!hideSubmit && (
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? '正在生成命盘…' : '生成命盘'} <span aria-hidden="true">→</span>
        </button>
      )}
    </form>
  );
}
