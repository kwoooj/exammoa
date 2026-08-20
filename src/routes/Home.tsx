import { useMemo } from 'react';
import {
  BookOpenText,
  Briefcase,
  CalendarBlank,
  CaretRight,
  Code,
  GearFine,
  GraduationCap,
  GridFour,
  HardHat,
  Translate,
} from '@phosphor-icons/react';
import type { AppData } from '../data/index.ts';
import { buildRows, byCategory, openNow, startingSoon } from '../lib/browse.ts';
import { EMPTY_EXAMS_QUERY, toExamsSearch } from '../lib/query.ts';
import { ROUTE_PATHS, examPath } from '../lib/routes.ts';
import { rangeLabel } from '../lib/dates.ts';
import { feeLabel } from '../lib/fees.ts';
import { Link } from '../router/Link.tsx';
import { EventDateTime } from '../components/EventDateTime.tsx';
import { FavoriteButton } from '../components/FavoriteButton.tsx';
import { useFavorites } from '../lib/favorites.ts';

function categoryIcon(id: string) {
  const props = { size: 31, weight: 'regular' as const, 'aria-hidden': true };
  switch (id) {
    case 'it': return <Code {...props} />;
    case 'office': return <Briefcase {...props} />;
    case 'safety': return <HardHat {...props} />;
    case 'eng': return <GearFine {...props} />;
    case 'service': return <GraduationCap {...props} />;
    case 'skill': return <BookOpenText {...props} />;
    case 'lang': return <Translate {...props} />;
    default: return <GridFour {...props} />;
  }
}

function providerMark(agency: string, category: string) {
  if (/YBM/i.test(agency)) {
    return <img src="/brands/ybm.svg" alt="" />;
  }
  if (agency.includes('한국산업인력공단')) {
    return <img src="/brands/qnet.svg" alt="" />;
  }
  return categoryIcon(category);
}

function longDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()];
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

export function Home({ data, today }: { data: AppData; today: string }) {
  const { favorites } = useFavorites();
  const rows = useMemo(() => buildRows({ ...data, today }), [data, today]);
  const groupedOpen = useMemo(() => openNow(rows, 3, 1), [rows]);
  const soon = useMemo(() => startingSoon(rows, 3), [rows]);
  const categories = useMemo(() => byCategory(rows, data.categories, 3), [rows, data.categories]);
  const openRows = groupedOpen.flatMap(group => group.rows);
  const featuredRows = openRows.length > 0 ? openRows : soon;
  const favoriteRows = favorites
    .map(slug => rows.find(row => row.exam.slug === slug))
    .filter((row): row is (typeof rows)[number] => Boolean(row));
  const calendarHref = `${ROUTE_PATHS.calendar}?view=favorites`;

  return (
    <>
      <section className="homeIntro" aria-labelledby="home-title">
        <div>
          <h1 id="home-title">안녕하세요, 시험모아입니다.</h1>
          <p>원하는 시험을 쉽게 찾고, 접수 일정까지 한곳에서 관리하세요.</p>
        </div>
        <p className="homeIntro__date">
          <time dateTime={today}>{longDate(today)}</time>
          <span>오늘 기준</span>
        </p>
      </section>

      <div className="homeGrid">
        <section className="homePanel categoryPanel" aria-labelledby="category-title">
          <div className="panelHead">
            <h2 id="category-title">분야별 시험 찾기</h2>
          </div>
          <div className="categoryGrid">
            {categories.map(({ category, rows: exampleRows }) => (
              <Link
                key={category.id}
                to={`${ROUTE_PATHS.exams}${toExamsSearch({ ...EMPTY_EXAMS_QUERY, category: category.id })}`}
                className="categoryTile"
              >
                <span className="categoryTile__icon">{categoryIcon(category.id)}</span>
                <strong>{category.name}</strong>
                <span>{exampleRows.map(row => row.exam.short ?? row.exam.name).slice(0, 2).join(', ')}</span>
              </Link>
            ))}
            <Link to={ROUTE_PATHS.exams} className="categoryTile">
              <span className="categoryTile__icon"><GridFour size={31} aria-hidden="true" /></span>
              <strong>전체 시험</strong>
              <span>{data.meta.examCount}개 시험 한눈에 보기</span>
            </Link>
          </div>
          <Link to={ROUTE_PATHS.exams} className="panelMore">
            모든 분야 보기 <CaretRight size={16} aria-hidden="true" />
          </Link>
        </section>

        <section className="homePanel openPanel" aria-labelledby="open-title">
          <div className="panelHead">
            <h2 id="open-title">{openRows.length > 0 ? '지금 접수 중' : '곧 접수 시작'}</h2>
            <Link to={`${ROUTE_PATHS.exams}${toExamsSearch({ ...EMPTY_EXAMS_QUERY, status: openRows.length > 0 ? 'open' : 'upcoming' })}`}>
              전체 보기 <CaretRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <ul className="openList">
            {featuredRows.map(row => (
              <li key={row.exam.slug} className="openItem">
                <span className="openItem__icon">{providerMark(row.agency, row.exam.category)}</span>
                <div className="openItem__body">
                  <div className="openItem__top">
                    <Link to={examPath(row.exam.slug)}>{row.exam.name}</Link>
                    <span className={row.status.emphasis ? 'statusTag statusTag--active' : 'statusTag'}>
                      {row.status.label}
                    </span>
                  </div>
                  <p>{row.agency}</p>
                  <dl>
                    <div><dt>접수</dt><dd>{row.nextReg ? rangeLabel(row.nextReg.start, row.nextReg.end, 'short') : '일정 확인 중'}</dd></div>
                    <div><dt>시험일</dt><dd>{row.nextExam ? rangeLabel(row.nextExam.start, row.nextExam.end, 'short') : '일정 확인 중'}</dd></div>
                    <div className="openItem__fee"><dt>응시료</dt><dd>{feeLabel(row.exam) ?? '공식 확인'}</dd></div>
                  </dl>
                </div>
                <Link to={examPath(row.exam.slug)} className="iconLink" aria-label={`${row.exam.name} 상세 일정`}>
                  <CaretRight size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="homePanel favoritesPanel" aria-labelledby="favorites-title">
        <div className="panelHead panelHead--favorites">
          <h2 id="favorites-title">관심 시험 <span className="countBadge">{favoriteRows.length}</span></h2>
          {favoriteRows.length > 0 && (
            <Link to={calendarHref} className="favoritesCalendarLink">
              <CalendarBlank size={18} aria-hidden="true" /> 캘린더로 보기
            </Link>
          )}
        </div>

        {favoriteRows.length === 0 ? (
          <div className="favoritesEmpty">
            <p>관심 있는 시험을 별표로 저장해 보세요.</p>
            <Link to={ROUTE_PATHS.exams} className="btn">시험 찾아보기</Link>
          </div>
        ) : (
          <div className="tableScroll">
            <table className="favoritesTable">
              <thead>
                <tr><th>시험명</th><th>주관 기관</th><th>현재 상태</th><th>다음 접수</th><th>시험일</th><th>응시료</th></tr>
              </thead>
              <tbody>
                {favoriteRows.map(row => (
                  <tr key={row.exam.slug}>
                    <td>
                      <FavoriteButton slug={row.exam.slug} name={row.exam.name} />
                      <Link to={examPath(row.exam.slug)}>{row.exam.name}</Link>
                    </td>
                    <td>{row.agency}</td>
                    <td><span className={row.status.emphasis ? 'statusTag statusTag--active' : 'statusTag'}>{row.status.label}</span></td>
                    <td>{row.nextReg ? <EventDateTime start={row.nextReg.start} end={row.nextReg.end} timing={row.nextReg.timing} style="short" /> : '—'}</td>
                    <td>{row.nextExam ? <EventDateTime start={row.nextExam.start} end={row.nextExam.end} timing={row.nextExam.timing} style="short" /> : '—'}</td>
                    <td className="favoritesTable__fee">{feeLabel(row.exam) ?? '공식 확인'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
