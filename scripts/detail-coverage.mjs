#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { checkExamDetails } from './lib/detail-check.mjs';
import { DETAIL_ADAPTERS } from './lib/detail-adapters.mjs';
import { checkDetailSources } from './lib/detail-source-check.mjs';

export function buildDetailCoverage(examSeed, detailSeed, sourceSeed, options = {}) {
  const visible = (examSeed?.exams ?? []).filter(exam => exam.tier !== 'X');
  const slugs = visible.map(exam => exam.slug);
  const sourceResult = checkDetailSources(sourceSeed, slugs, {
    knownAdapters: options.knownAdapters ?? [...DETAIL_ADAPTERS.keys()],
    requireAllRegistered: options.strict ?? false,
  });
  const sourceIds = new Set((sourceSeed?.sources ?? []).map(source => source.id));
  const detailResult = checkExamDetails(detailSeed, slugs, {
    sourceIds,
    requireAllPublished: options.strict ?? false,
  });
  const details = new Map((detailSeed?.details ?? []).map(detail => [detail.examSlug, detail]));
  const byCategory = (examSeed?.categories ?? []).map(category => {
    const categoryExams = visible.filter(exam => exam.category === category.id);
    const published = categoryExams.filter(exam => details.get(exam.slug)?.catalogStatus === 'published').length;
    return { id: category.id, name: category.name, total: categoryExams.length, published, missing: categoryExams.length - published };
  }).filter(row => row.total > 0);
  const published = slugs.filter(slug => details.get(slug)?.catalogStatus === 'published');
  const planned = slugs.filter(slug => details.get(slug)?.catalogStatus === 'planned');
  const missing = slugs.filter(slug => !details.has(slug));
  const registered = new Set(sourceResult.coverage.registered);
  const activeAutomatic = new Set(sourceResult.coverage.activeAutomatic);
  const activeManual = new Set(sourceResult.coverage.activeManual);

  return {
    ok: sourceResult.ok && detailResult.ok,
    strict: options.strict ?? false,
    visibleExamCount: visible.length,
    details: {
      published: published.length,
      planned: planned.length,
      missing: missing.length,
      missingSlugs: missing,
    },
    sources: {
      registered: registered.size,
      activeAutomatic: activeAutomatic.size,
      activeManual: activeManual.size,
      uncovered: sourceResult.coverage.uncovered.length,
      uncoveredSlugs: sourceResult.coverage.uncovered,
    },
    byCategory,
    problems: [
      ...sourceResult.problems.map(problem => `출처: ${problem}`),
      ...detailResult.problems.map(problem => `상세: ${problem}`),
    ],
  };
}

export function formatDetailCoverage(report) {
  const lines = [
    `노출 시험 ${report.visibleExamCount}개`,
    `상세정보: 공개 ${report.details.published} · 계획 ${report.details.planned} · 누락 ${report.details.missing}`,
    `공식 출처: 등록 ${report.sources.registered} · 자동 활성 ${report.sources.activeAutomatic} · 승인형 입력 ${report.sources.activeManual} · 미등록 ${report.sources.uncovered}`,
    '',
    '카테고리별 상세정보',
    ...report.byCategory.map(row => `- ${row.name}: ${row.published}/${row.total} (누락 ${row.missing})`),
  ];
  if (report.problems.length) lines.push('', '계약 오류', ...report.problems.map(problem => `- ${problem}`));
  if (report.strict && report.ok) lines.push('', '전체 상세정보·출처 게이트 통과');
  return lines.join('\n');
}

async function run() {
  const [examSeed, detailSeed, sourceSeed] = await Promise.all([
    readFile('data/exams.seed.json', 'utf8').then(JSON.parse),
    readFile('data/exam-details.seed.json', 'utf8').then(JSON.parse),
    readFile('data/detail-sources.seed.json', 'utf8').then(JSON.parse),
  ]);
  const strict = process.argv.includes('--strict');
  const report = buildDetailCoverage(examSeed, detailSeed, sourceSeed, { strict });
  console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) : formatDetailCoverage(report));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await run();
