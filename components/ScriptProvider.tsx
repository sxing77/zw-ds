'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as OpenCC from 'opencc-js';

export type ChineseScript = 'zh-Hans' | 'zh-Hant';

const ScriptContext = createContext<{
  script: ChineseScript;
  toggleScript: () => void;
}>({ script: 'zh-Hans', toggleScript: () => {} });

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);

function shouldSkipNode(node: Node | null): boolean {
  let cur: Node | null = node;
  while (cur) {
    if (cur instanceof HTMLElement) {
      if (SKIP_TAGS.has(cur.tagName) || cur.hasAttribute('data-no-convert')) {
        return true;
      }
    }
    cur = cur.parentNode;
  }
  return false;
}

export function ScriptProvider({ children }: { children: React.ReactNode }) {
  const [script, setScript] = useState<ChineseScript>('zh-Hans');
  const [mounted, setMounted] = useState(false);
  const originalMap = useRef<WeakMap<Text, string>>(new WeakMap());
  const converterRef = useRef<((text: string) => string) | null>(null);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('ziwei-script');
    if (saved === 'zh-Hant' || saved === 'zh-Hans') {
      setScript(saved);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('ziwei-script', script);
    document.documentElement.lang = script === 'zh-Hant' ? 'zh-TW' : 'zh-CN';

    if (script === 'zh-Hans') {
      // 还原所有已转换的文本节点
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        const orig = originalMap.current.get(node);
        if (orig !== undefined && node.nodeValue !== orig) {
          node.nodeValue = orig;
        }
        node = walker.nextNode() as Text | null;
      }
      return;
    }

    if (!converterRef.current) {
      converterRef.current = OpenCC.Converter({ from: 'cn', to: 't' });
    }
    const toHant = converterRef.current;

    const convertTextNode = (textNode: Text) => {
      if (shouldSkipNode(textNode.parentNode)) return;
      const val = textNode.nodeValue;
      if (!val || !/[\u4e00-\u9fff]/.test(val)) return;

      const converted = toHant(val);
      if (converted !== val) {
        if (!originalMap.current.has(textNode)) {
          originalMap.current.set(textNode, val);
        } else {
          // 若 React 更新了文本内容，重新记录原始简体文本
          const prevOrig = originalMap.current.get(textNode)!;
          if (toHant(prevOrig) !== val) {
            originalMap.current.set(textNode, val);
          }
        }
        textNode.nodeValue = converted;
      }
    };

    const convertSubtree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        convertTextNode(root as Text);
        return;
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n = walker.nextNode() as Text | null;
      while (n) {
        convertTextNode(n);
        n = walker.nextNode() as Text | null;
      }
    };

    convertSubtree(document.body);

    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) {
          convertTextNode(m.target as Text);
        } else if (m.type === 'childList') {
          m.addedNodes.forEach(node => convertSubtree(node));
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [script, mounted]);

  const toggleScript = () => {
    setScript(s => (s === 'zh-Hans' ? 'zh-Hant' : 'zh-Hans'));
  };

  return (
    <ScriptContext.Provider value={{ script, toggleScript }}>
      {children}
    </ScriptContext.Provider>
  );
}

export const useChineseScript = () => useContext(ScriptContext);
