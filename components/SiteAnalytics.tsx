'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const privatePath = /^\/(?:account|checkout|ops|api)(?:\/|$)/;

function publicPageEvent<T extends { url: string }>(event: T): T | null {
  const url = new URL(event.url, window.location.origin);
  if (url.origin !== window.location.origin || privatePath.test(url.pathname)) return null;
  return { ...event, url: url.origin + url.pathname };
}

export default function SiteAnalytics() {
  return <><Analytics beforeSend={publicPageEvent} /><SpeedInsights beforeSend={publicPageEvent} /></>;
}
