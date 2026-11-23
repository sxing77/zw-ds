'use client';
import { motion } from 'framer-motion';
import type { Palace, Star } from '@/lib/ziwei/types';
import { STEMS, BRANCHES } from '@/lib/ziwei/constants';
import clsx from 'clsx';

interface PalaceCellProps {
  palace: Palace;
  onClick?: () => void;
  onStarClick?: (star: Star) => void;
  isSelected?: boolean;
  isSanFang?: boolean;
  delay?: number;
  /** 叠加四化：星名 → 四化类型（'禄'/'权'/'科'/'忌'） */
  overlayStarSiHua?: Record<string, string>;
  /** 叠加标签：'年'（流年）或 '限'（大限） */
  overlayLabel?: string;
  /** 点击叠加四化 badge 回调 */
  onSiHuaClick?: (starName: string, siHua: string) => void;
}

const SIHUA_STYLES: Record<string, string> = {
  '禄': 'text-[var(--lu)] bg-emerald-500/10 border-emerald-500/30',
  '权': 'text-[var(--quan)] bg-blue-500/10 border-blue-500/30',
  '科': 'text-[var(--ke)] bg-yellow-500/10 border-yellow-500/30',
  '忌': 'text-[var(--ji)] bg-red-500/10 border-red-500/30',
};

const SiHuaBadge = ({
  siHua,
  overlay,
  label,
  onClick,
}: {
  siHua: string;
  overlay?: boolean;
  label?: string;
  onClick?: (e: React.MouseEvent) => void;
}) => {
  const Badge = onClick ? 'button' : 'span';
  return (
    <Badge
      type={onClick ? 'button' : undefined}
      aria-label={onClick ? (label === '限' ? '大限' : '流年') + '化' + siHua : undefined}
      className={clsx(
        'inline-flex items-center text-[9px] px-1 rounded-[2px] border leading-none py-px font-bold ml-1 flex-shrink-0',
        SIHUA_STYLES[siHua],
        overlay && 'border-dashed opacity-80',
        onClick && 'cursor-pointer hover:opacity-100',
      )}
      onClick={onClick}
    >
      {overlay && label && <span className="mr-px opacity-70">{label}</span>}
      {siHua}
    </Badge>
  );
};

export default function PalaceCell({
  palace, onClick, onStarClick, isSelected, isSanFang, delay = 0,
  overlayStarSiHua, overlayLabel, onSiHuaClick,
}: PalaceCellProps) {
  const { branch, stem, name, stars, daXianAge, isCurrentDaXian, isMingGong, isShenGong } = palace;
  const ganzhi = `${STEMS[stem]}${BRANCHES[branch]}`;

  const majorStars = stars.filter(s => s.type === 'major');
  const luckyStars = stars.filter(s => s.type === 'lucky');
  const shaStars = stars.filter(s => s.type === 'sha');

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? name : undefined}
      aria-pressed={onClick ? Boolean(isSelected) : undefined}
      onKeyDown={onClick ? event => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      className="relative flex flex-col p-1.5 cursor-pointer transition-all duration-200 h-full"
      style={{
        minHeight: '90px',
        background: isSelected
          ? 'var(--zw-accent-soft, rgba(140,53,43,0.09))'
          : isSanFang
          ? 'rgba(184,146,42,0.06)'
          : isCurrentDaXian
          ? 'rgba(184,146,42,0.04)'
          : isMingGong
          ? 'rgba(140,53,43,0.03)'
          : 'var(--t-bg)',
        boxShadow: isSelected
          ? 'inset 0 0 0 1.5px var(--zw-accent, #8c352b)'
          : isSanFang
          ? 'inset 0 0 0 1px rgba(184,146,42,0.32)'
          : isCurrentDaXian
          ? 'inset 2.5px 0 0 var(--zw-accent, #8c352b)'
          : 'none',
      }}
    >
      {/* 大限年龄 */}
      {daXianAge && (
        <div className="absolute top-1 right-1 text-[9px] font-mono tabular-nums"
          style={{ color: isCurrentDaXian ? 'var(--t-gold)' : 'var(--t-faint)' }}
        >
          {daXianAge[0]}–{daXianAge[1]}
        </div>
      )}

      {/* 宫名行 */}
      <div className="flex items-center gap-1 mb-0.5 pr-8">
        <span className={clsx('font-serif text-[12px] tracking-wide',
          isMingGong ? 'font-extrabold' : 'font-semibold',
        )}
          style={{ color: isMingGong ? 'var(--zw-accent, var(--t-gold))' : 'var(--t-text)' }}
        >
          {name}
        </span>
        {isMingGong && (
          <span className="text-[9px] text-[var(--zw-accent)] font-semibold leading-tight">· 命</span>
        )}
        {isShenGong && (
          <span className="text-[9px] text-[var(--t-faint)] leading-tight">· 身</span>
        )}
      </div>

      {/* 干支 */}
      <div className="text-[9px] font-mono mb-1" style={{ color: 'var(--t-faint)', opacity: 0.75 }}>{ganzhi}</div>

      {/* 主星 */}
      <div className="flex flex-col gap-0.5 flex-1">
        {majorStars.length === 0 && (
          <span className="text-[10px] italic" style={{ color: 'var(--t-faint)', opacity: 0.6 }}>空宫</span>
        )}
        {majorStars.map((star) => {
          const overlaySiHua = overlayStarSiHua?.[star.name];
          return (
            <div key={star.name} className="flex items-center">
              {onStarClick ? (
                <button type="button"
                  className="text-[13px] leading-tight font-bold tracking-tight cursor-pointer hover:brightness-125"
                  onClick={event => { event.stopPropagation(); onStarClick(star); }}
                  style={{ color: star.brightness === 'dim' ? 'var(--t-text2)' : 'var(--t-text)' }}>
                  {star.name}
                </button>
              ) : (
                <span className="text-[13px] leading-tight font-bold tracking-tight"
                  style={{ color: star.brightness === 'dim' ? 'var(--t-text2)' : 'var(--t-text)' }}>{star.name}</span>
              )}
              {star.siHua && <SiHuaBadge siHua={star.siHua} />}
              {overlaySiHua && (
                <SiHuaBadge
                  siHua={overlaySiHua}
                  overlay
                  label={overlayLabel}
                  onClick={onSiHuaClick ? event => { event.stopPropagation(); onSiHuaClick(star.name, overlaySiHua); } : undefined}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 吉星 */}
      {luckyStars.length > 0 && (
        <div className="flex flex-wrap gap-x-1 mt-0.5">
          {luckyStars.map(s => {
            const overlaySiHua = overlayStarSiHua?.[s.name];
            return (
              <span key={s.name} className="inline-flex items-center text-[10px] text-[var(--quan)] leading-tight">
                {s.name}
                {s.siHua && <SiHuaBadge siHua={s.siHua} />}
                {overlaySiHua && (
                  <SiHuaBadge
                    siHua={overlaySiHua}
                    overlay
                    label={overlayLabel}
                    onClick={onSiHuaClick ? event => { event.stopPropagation(); onSiHuaClick(s.name, overlaySiHua); } : undefined}
                  />
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* 煞星 */}
      {shaStars.length > 0 && (
        <div className="flex flex-wrap gap-x-1">
          {shaStars.map(s => (
            <span key={s.name} className="text-[10px] text-[var(--ji)] leading-tight">
              {s.name}{s.siHua && <SiHuaBadge siHua={s.siHua} />}
            </span>
          ))}
        </div>
      )}

    </motion.div>
  );
}
