'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/Accordion';

const FAQ_ITEMS = [
  {
    id: 'fields',
    question: '排盘需要填写哪些资料？',
    answer: '填写出生日期、北京时间和性别。日期支持公历和农历，闰月请选对应的闰月选项。姓名选填，出生地用于按经度校正时辰。',
  },
  {
    id: 'unknown-time',
    question: '不知道出生时间，可以排盘吗？',
    answer: '可以勾选「不知道出生时间」，系统会以子时排出参考盘。出生时辰会影响命宫和星曜位置，建议在确认时辰后重新排盘。',
  },
  {
    id: 'privacy',
    question: '排盘资料会发送到哪里？',
    answer: '生成命盘完全在浏览器本地完成，无需注册或上传。开启命盘详解或提交追问时，系统会将生成解读所需的命盘信息和提问发送到服务端。',
  },
  {
    id: 'sanfang',
    question: '什么是「三方四正」？',
    answer: '点击命盘任意宫位时，系统会自动高亮该宫位（本宫）及其对宫、两个三合宫，合称三方四正，用于综合判断该宫位的吉凶格局。',
  },
];

export default function FaqAccordion() {
  return (
    <Accordion type="single" collapsible defaultValue="fields" className="w-full">
      {FAQ_ITEMS.map(item => (
        <AccordionItem key={item.id} value={item.id}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
