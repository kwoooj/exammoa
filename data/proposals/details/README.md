# 시험 상세정보 후보

이 디렉터리는 수집기 또는 승인형 업로드가 만든 후보와 그 승인 상태를 보관한다.

- 후보는 `public/data/`로 복사하지 않는다.
- 파일명은 `{sourceId}.json`이다.
- 원문은 `data/archive/details/{year}/`에 내용 해시와 함께 별도로 보관한다.
- `npm run details:promote -- --source=<id> --approve=<contentHash>`처럼 후보 해시를
  명시한 경우에만 `data/exam-details.seed.json`으로 승격한다.
- 승격 뒤에도 Draft PR 코드 리뷰와 사용자 승인을 거쳐야 운영 브랜치에 병합한다.
- 리뷰 전에는 `status: review-required`, 승격 뒤에는 `status: approved`와 `approvedAt`을
  기록해 같은 후보가 반복해서 Draft PR로 생성되지 않게 한다.

자동 수집 결과가 이곳에 생긴 것만으로는 사용자 화면이 바뀌지 않는다.
