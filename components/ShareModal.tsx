'use client';

import { useState, type RefObject } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/Dialog';
import type { ZiweiChart } from '@/lib/ziwei/types';
import ShareCardCanvas, { captureShareCard, downloadDataURL } from './ShareCardCanvas';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
  shareUrl: string;
  chart: ZiweiChart | null;
  birth: { year: string; month: string; day: string; hour: string; minute: string; timeUnknown?: boolean; gender: 'male' | 'female'; city?: string };
  highlight?: string;
}

export default function ShareModal({ open, onClose, returnFocusTo, shareUrl, chart, birth, highlight }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState('');

  const copyLink = async () => {
    setNotice('');
    setCopied(false);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setNotice('无法访问剪贴板，请手动复制下方链接。');
    }
  };

  const downloadImage = async () => {
    setNotice('');
    setDownloading(true);
    try {
      const dataURL = await captureShareCard();
      if (!dataURL) {
        setNotice('图片生成失败，请重试。');
        return;
      }
      downloadDataURL(dataURL, `紫微命盘_${Date.now()}.png`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => {
      if (!next) {
        setCopied(false);
        setNotice('');
        onClose();
      }
    }}>
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={event => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
        style={{ background: 'white', maxWidth: '680px', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}
      >
        {/* 顶部标题 */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(184,146,42,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <DialogTitle style={{ fontSize: '14px', color: '#3d2f10', letterSpacing: '0.12em' }}>
            ✦ 分享命盘
          </DialogTitle>
        </div>

        {/* 卡片图预览（实际渲染） */}
        <div style={{ padding: '20px', background: '#fbf6e8', display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
          {chart && (
            <ShareCardCanvas chart={chart} birth={birth} highlight={highlight} />
          )}
        </div>

        <div style={{ padding: '0 20px 12px', textAlign: 'center', fontSize: '11px', color: '#a89b7c', letterSpacing: '0.05em' }}>
          ↑ 朋友圈 / 微信 / 抖音 / 小红书 都能用
        </div>

        {/* 操作区 */}
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={downloadImage} disabled={downloading}
            style={{
              padding: '14px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg, #d4a948 0%, #b8922a 100%)',
              color: 'white', fontSize: '14px', fontWeight: 600, letterSpacing: '0.15em',
              cursor: downloading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(184,146,42,0.3)',
              opacity: downloading ? 0.7 : 1,
            }}
          >
            {downloading ? '生成中…' : '⬇ 下载分享图'}
          </button>

          <button onClick={copyLink}
            style={{
              padding: '14px', borderRadius: '10px',
              border: '1px solid rgba(184,146,42,0.4)', background: 'white',
              color: '#b8922a', fontSize: '14px', fontWeight: 500, letterSpacing: '0.12em',
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ 已复制链接' : '🔗 复制命盘链接'}
          </button>

          {notice && <p role="status" className="text-xs text-red-800">{notice}</p>}
          {notice.startsWith('无法访问剪贴板') && (
            <input readOnly value={shareUrl} aria-label="命盘分享链接" onFocus={event => event.currentTarget.select()}
              className="w-full rounded-md border p-2 text-xs text-stone-900" />
          )}
          <p className="text-xs text-stone-700">链接含排盘用的出生资料，任何拿到链接的人都可以查看这张命盘。</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
