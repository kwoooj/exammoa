/**
 * 클라이언트 이동에서 머리말을 맞춘다.
 *
 * 사전 렌더가 첫 HTML 에 제목·설명·canonical 을 박아 주지만, 그 뒤 사용자가 링크를
 * 눌러 옮겨 다닐 때는 문서가 새로 오지 않는다. 그대로 두면 탭 제목이 처음 들어온
 * 페이지에 머물러, 탭 여러 개를 띄운 사람이 어느 것이 어느 시험인지 구분하지 못한다.
 * 즐겨찾기와 공유도 틀린 제목으로 저장된다.
 *
 * 크롤러를 위한 것이 아니다 — 그쪽은 이미 사전 렌더된 HTML 을 읽는다.
 */

import { useEffect } from 'react';
import type { HeadMeta } from '../lib/head.ts';

function setMeta(selector: string, attr: 'content' | 'href', value: string): void {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

export function useHead(head: HeadMeta): void {
  useEffect(() => {
    document.title = head.title;
    setMeta('meta[name="description"]', 'content', head.description);
    setMeta('link[rel="canonical"]', 'href', head.canonical);
    setMeta('meta[property="og:title"]', 'content', head.title);
    setMeta('meta[property="og:description"]', 'content', head.description);
    setMeta('meta[property="og:url"]', 'content', head.canonical);
  }, [head.title, head.description, head.canonical]);
}
