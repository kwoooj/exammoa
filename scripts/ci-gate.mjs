#!/usr/bin/env node
// 수집 결과를 커밋해도 되는지 판정한다. 의존성 없음.
//
// `collect.mjs` 는 **서로 다른 두 이유**로 종료코드 1 을 낸다. CI 가 이 둘을 뭉치면
// 안 된다. 한쪽은 커밋해야 하고 다른 한쪽은 커밋하면 사용자 데이터가 깨진다.
//
//   소스 실패 (failedSources)
//     직전 값이 stale 로 유지된다. 산출물은 유효하고, 낡았다는 사실이 화면에
//     표시된다 (FR-DAT-07). → 커밋한 다음 빨간불을 켠다.
//
//   그룹 갈림 (groupSplitCount > 0)
//     foldGroups 가 groupId 를 `xxx--슬러그` 로 **바꿔서** 내보낸다. 사용자가
//     localStorage 에 저장한 ExamPlan.sessionId 와 공유된 ?p= 링크가 존재하지 않는
//     회차를 가리키게 된다. 낡은 데이터보다 나쁘다 — 사람이 시드를 고쳐야 하는
//     상황이므로 자동 커밋 대상이 아니다. → 커밋하지 않고 빨간불만 켠다.
//
// 이 판정을 YAML 인라인 셸에 두지 않는 이유는 테스트할 수 없기 때문이다.
//
//   node scripts/ci-gate.mjs              배치용. 커밋 여부·빨간불 여부를 출력한다
//   node scripts/ci-gate.mjs --pr         PR 검사용. 커밋 불가 사유일 때만 종료코드 1
//   node scripts/ci-gate.mjs --pr <경로>  다른 meta.json 을 읽는다
//
// `--pr` 은 종료 조건이 다르다. 저장소에 이미 들어와 있는 산출물을 보는 것이므로
// stale 소스는 정상이다 (배치가 정당하게 커밋한 결과다). 반면 그룹 갈림은 시드가
// 낡았다는 뜻이라 머지를 막아야 한다 — CLAUDE.md 의 "PR 전 체크: groupSplitCount 0".

import { readFile, appendFile } from 'node:fs/promises';
import { PUBLISHED } from './lib/store.mjs';

/**
 * @param {object|null} meta  data/published/meta.json. 읽지 못했으면 null
 * @returns {{commit:boolean, fail:boolean, headline:string, lines:string[]}}
 */
export function decide(meta) {
  if (!meta || typeof meta !== 'object') {
    return {
      commit: false,
      fail: true,
      headline: '산출물이 없다',
      lines: ['`meta.json` 을 읽지 못했다. 수집이 산출물을 쓰기 전에 죽었다는 뜻이다.'],
    };
  }

  const sources = Object.entries(meta.sources ?? {});
  const broken = sources.filter(([, s]) => s.health !== 'ok');
  const splits = meta.groupSplits ?? [];
  const splitCount = meta.groupSplitCount ?? splits.length;

  const lines = [
    `그룹 ${meta.groupCount ?? '?'}개 · 회차 ${meta.sessionCount ?? '?'}건 · 이벤트 ${meta.eventCount ?? '?'}개 · 노출 종목 ${meta.examCount ?? '?'}개`,
    sources.length
      ? `소스: ${sources.map(([id, s]) => `${id}=${s.health}(${s.sessionCount ?? 0})`).join(' · ')}`
      : '소스 기록이 없다.',
  ];
  if (meta.staleCount) lines.push(`낡은 회차 ${meta.staleCount}건 — 화면에 낡았다고 표시된다.`);

  if (splitCount > 0) {
    return {
      commit: false,
      fail: true,
      headline: `그룹 ${splitCount}건이 갈렸다 — 커밋하지 않는다`,
      lines: [
        ...lines,
        '',
        '`groupId` 가 바뀌면 사용자가 저장한 계획과 공유된 `?p=` 링크가 없는 회차를 가리킨다.',
        '`data/groups.seed.json` 을 사람이 고쳐야 한다:',
        ...splits.map(s => `- \`${s.groupId}\` → ${(s.variants ?? []).map(v => `\`${v.groupId}\`(${(v.examSlugs ?? []).length}종목)`).join(', ')}`),
      ],
    };
  }

  if (broken.length) {
    return {
      commit: true,
      fail: true,
      headline: `소스 ${broken.length}건 실패 — 직전 값을 유지한 채 커밋한다`,
      lines: [
        ...lines,
        '',
        '사라지는 것보다 낡았다고 밝히며 보여주는 것이 낫다 (FR-DAT-07).',
        ...broken.map(([id, s]) => `- \`${id}\` — ${s.health}${s.error ? `: ${s.error}` : ''}`),
      ],
    };
  }

  return { commit: true, fail: false, headline: '수집 정상', lines };
}

/** GitHub Actions 요약 마크다운 */
export function summary(d) {
  const mark = d.fail ? (d.commit ? '⚠️' : '❌') : '✅';
  return [`### ${mark} ${d.headline}`, '', ...d.lines, ''].join('\n');
}

/**
 * 배치 커밋 제목. 한 줄이어야 한다 — GITHUB_OUTPUT 은 줄바꿈을 값의 끝으로 읽는다.
 * 무엇이 들어왔는지 제목만 보고 알 수 있어야 로그를 뒤지지 않는다.
 */
export function subject(d, meta) {
  const day = String(meta?.fetchedAt ?? '').slice(0, 10) || '날짜불명';
  const tail = d.fail ? ' (일부 실패)' : '';
  return `데이터 갱신 ${day} — 회차 ${meta?.sessionCount ?? '?'}건${tail}`
    .replace(/[\r\n]+/g, ' ');
}

// ---- 실행 -------------------------------------------------------------

if (import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2);
  const prMode = args.includes('--pr');
  const path = args.find(a => !a.startsWith('--')) ?? `${PUBLISHED}/meta.json`;

  let meta = null;
  try {
    meta = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    // decide() 가 null 을 산출물 없음으로 처리한다
  }

  const d = decide(meta);
  console.log(summary(d));

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary(d)}\n`);
  }

  if (prMode) {
    if (!d.commit) process.exitCode = 1;
  } else if (process.env.GITHUB_OUTPUT) {
    // 커밋 여부와 빨간불 여부를 여기서 정한다. 셸에서 다시 판정하지 않는다.
    // 커밋 스텝이 뒤에 있으므로 이 스텝은 실패로 끝나지 않는다 — 빨간불은 마지막 스텝이 켠다.
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `commit=${d.commit}\nfail=${d.fail}\nsubject=${subject(d, meta)}\n`,
    );
  } else if (d.fail) {
    process.exitCode = 1;
  }
}
