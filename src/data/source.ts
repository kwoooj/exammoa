/**
 * 정적 JSON 네 개를 읽어 온다.
 *
 * **공용 코드에 `fetch` 가 등장하지 않는다.** 브라우저와 사전 렌더가 같은 코드로
 * 돌아야 하는데, 사전 렌더에는 브라우저도 네트워크도 없다. 다른 것은 "파일 하나를
 * 어떻게 가져오는가" 뿐이므로 그 함수만 주입받는다. 나머지 — 검증, 오류 문구,
 * 인덱싱 — 는 한 벌이다. 두 벌이면 반드시 어긋나고, 어긋난 쪽은 사전 렌더라
 * 아무도 모른다.
 *
 * 화면정의 §15.3 은 수집 실패와 화면 로딩 실패를 구분하라고 한다. 여기서 던지는
 * 것은 **화면 로딩 실패**다 — 다시 시도 버튼을 붙일 수 있는 종류. 수집 실패는
 * 산출물 안의 `meta.sources` 로 들어오고 `freshness.ts` 가 읽는다.
 */

import type { ExamsFile, GroupsFile, MetaFile, SessionsFile } from '../types.ts';

export type DataFile = 'exams' | 'groups' | 'sessions' | 'meta';

export const DATA_FILES: readonly DataFile[] = ['exams', 'groups', 'sessions', 'meta'];

export type JsonReader = (file: DataFile) => Promise<unknown>;

export interface RawData {
  exams: ExamsFile;
  groups: GroupsFile;
  sessions: SessionsFile;
  meta: MetaFile;
}

/**
 * 어느 파일에서 났는지 들고 다닌다. "데이터를 못 읽었어요" 만으로는 고칠 수 없다.
 *
 * 생성자 파라미터 프로퍼티(`constructor(readonly file: ...)`)를 쓰지 않는다.
 * `node --test` 는 타입을 벗겨내기만 하고 변환하지 않아서 그 문법을 거절한다.
 */
export class DataError extends Error {
  file: DataFile;

  constructor(file: DataFile, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DataError';
    this.file = file;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * 모양만 본다. 필드 하나하나를 검사하지 않는 이유는 이 JSON 을 만드는 것이
 * 같은 저장소의 배치이고, 그쪽에 `ci-gate` 라는 더 엄한 검사가 이미 있어서다.
 * 여기서 보는 것은 "다른 파일을 받아왔다" 수준의 사고다 — 404 페이지의 HTML 이나
 * 캐시가 돌려준 옛 형식.
 */
function expectArray(file: DataFile, value: unknown, key: string): void {
  if (!isObject(value) || !Array.isArray(value[key])) {
    throw new DataError(file, `${file}.json 의 모양이 예상과 다릅니다 (${key} 배열 없음)`);
  }
}

export async function loadRaw(read: JsonReader): Promise<RawData> {
  const read1 = async (file: DataFile): Promise<unknown> => {
    try {
      return await read(file);
    } catch (cause) {
      throw new DataError(file, `${file}.json 을 읽지 못했습니다`, { cause });
    }
  };

  const [exams, groups, sessions, meta] = await Promise.all(DATA_FILES.map(read1));

  expectArray('exams', exams, 'exams');
  expectArray('exams', exams, 'categories');
  expectArray('groups', groups, 'groups');
  expectArray('sessions', sessions, 'sessions');
  if (!isObject(meta) || typeof meta['fetchedAt'] !== 'string') {
    throw new DataError('meta', 'meta.json 의 모양이 예상과 다릅니다 (fetchedAt 없음)');
  }

  return {
    exams: exams as ExamsFile,
    groups: groups as GroupsFile,
    sessions: sessions as SessionsFile,
    meta: meta as unknown as MetaFile,
  };
}

/** 브라우저용. 사전 렌더는 `readFile` 로 만든 리더를 넣는다 */
export const httpReader: JsonReader = async file => {
  const res = await fetch(`/data/${file}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
