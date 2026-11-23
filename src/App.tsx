import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { CERT_CATALOG, CERT_CATEGORIES, STUDY_AREAS } from './data/certCatalog';
import type {
  CertCatalogItem,
  CertCategory,
  CertResearchResult,
  LearnerLevel,
  SavedCertReport,
  StudyAreaId,
} from './types/cert';
import { ResearchReportView } from './components/ResearchReportView';
import { SavedReportsDrawer } from './components/SavedReportsDrawer';

const HERO_IMAGE_PATH = '/src/assets/images/study_desk_editorial_1795397869785.jpg';
const STORAGE_KEY = 'jagyeok_baekseo_saved_reports_v1';

const LEARNER_LEVELS: LearnerLevel[] = [
  '비전공자·입문',
  '전공자·기본기 보유',
  '단기합격·실전집중',
];

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CertCategory>('전체');
  const [popularOnly, setPopularOnly] = useState(false);

  const [selectedCert, setSelectedCert] = useState<CertCatalogItem | null>(
    CERT_CATALOG[0]
  );
  const [customCertName, setCustomCertName] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<StudyAreaId[]>([
    'concepts',
    'past_exams',
    'lectures',
    'workbooks',
    'interview',
    'stats',
  ]);
  const [learnerLevel, setLearnerLevel] = useState<LearnerLevel>('비전공자·입문');

  const [isLoading, setIsLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [researchResult, setResearchResult] = useState<CertResearchResult | null>(null);

  const [savedReports, setSavedReports] = useState<SavedCertReport[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedCertReport[]) : [];
    } catch {
      return [];
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [zipAvailable, setZipAvailable] = useState(false);

  const areasSectionRef = useRef<HTMLElement | null>(null);
  const reportContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/download-zip', { method: 'HEAD' })
      .then((res) => {
        if (res.ok) setZipAvailable(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedReports));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedReports]);

  useEffect(() => {
    if (!isLoading) {
      setElapsedSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  const filteredCerts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return CERT_CATALOG.filter((cert) => {
      if (selectedCategory !== '전체' && cert.category !== selectedCategory) {
        return false;
      }
      if (popularOnly && !cert.isPopular) {
        return false;
      }
      if (!q) return true;
      const haystacks = [
        cert.name,
        cert.category,
        cert.organizer,
        cert.summary,
        ...cert.aliases,
      ]
        .join(' ')
        .toLowerCase();
      return haystacks.includes(q);
    });
  }, [searchQuery, selectedCategory, popularOnly]);

  const activeCertTitle = customCertName.trim() || selectedCert?.name || '';

  const handleSelectCatalogCert = (cert: CertCatalogItem) => {
    setSelectedCert(cert);
    setCustomCertName('');
    setErrorMsg(null);
    areasSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleUseCustomCert = () => {
    const clean = searchQuery.trim();
    if (!clean) return;
    setCustomCertName(clean);
    setSelectedCert(null);
    setErrorMsg(null);
    areasSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleArea = (id: StudyAreaId) => {
    setSelectedAreas((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const applyAreaPreset = (areas: StudyAreaId[]) => {
    setSelectedAreas(areas);
  };

  const runResearch = async (forceRefresh = false) => {
    if (!activeCertTitle) {
      setErrorMsg('먼저 자격증을 선택하거나 직접 입력해 주세요.');
      return;
    }
    if (selectedAreas.length === 0) {
      setErrorMsg('조회할 학습 영역을 최소 1개 이상 선택해 주세요.');
      return;
    }

    const sortedAreas = [...selectedAreas].sort();
    const clientCacheKey = `jagyeok_cache_v1::${activeCertTitle}::${sortedAreas.join(',')}::${learnerLevel}`;

    if (!forceRefresh) {
      try {
        const rawCached = localStorage.getItem(clientCacheKey);
        if (rawCached) {
          const parsed = JSON.parse(rawCached) as { ts: number; data: CertResearchResult };
          if (Date.now() - parsed.ts < 30 * 60 * 1000 && parsed.data) {
            setErrorMsg(null);
            setResearchResult(parsed.data);
            setTimeout(() => {
              reportContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 60);
            return;
          }
        }
      } catch {
        // Ignore cache read error
      }
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const fetchBatch = async (areasBatch: StudyAreaId[]): Promise<CertResearchResult> => {
        let data: Record<string, unknown> = {};
        let lastRespStatus = 0;

        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1000));
          }
          const resp = await fetch('/api/cert-research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              certName: activeCertTitle,
              organizer: selectedCert?.organizer || '',
              officialUrl: selectedCert?.officialUrl || '',
              selectedAreas: areasBatch,
              learnerLevel,
              forceRefresh,
            }),
          });

          lastRespStatus = resp.status;
          const rawText = await resp.text();
          try {
            data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
          } catch {
            data = {};
          }

          if (resp.ok) {
            return data as unknown as CertResearchResult;
          }

          const isRetryable = [429, 500, 502, 503, 504].includes(resp.status);
          if (!isRetryable || attempt === 1) {
            throw new Error(
              typeof data.error === 'string' && data.error
                ? `[HTTP ${lastRespStatus}] ${data.error}`
                : lastRespStatus === 504
                ? '[HTTP 504] 서버 응답 시간이 초과되었습니다. 영역 수를 줄이거나 잠시 후 다시 조회해 주세요.'
                : `[HTTP ${lastRespStatus || 'ERR'}] 최신 자격증 자료를 조회하지 못했습니다.`
            );
          }
        }
        throw new Error('자격증 자료를 조회하지 못했습니다.');
      };

      let resultData: CertResearchResult;
      if (sortedAreas.length > 2) {
        const chunks: StudyAreaId[][] = [];
        for (let i = 0; i < sortedAreas.length; i += 2) {
          chunks.push(sortedAreas.slice(i, i + 2));
        }
        const batchResults = await Promise.all(chunks.map((c) => fetchBatch(c)));

        const mergedSources = batchResults
          .flatMap((r) => r.sources ?? [])
          .filter((src, idx, arr) => arr.findIndex((x) => x.uri === src.uri) === idx);

        resultData = Object.assign({}, ...batchResults, {
          selectedAreas: sortedAreas,
          overview: batchResults[0].overview,
          verificationNote: batchResults[0].verificationNote,
          sources: mergedSources,
        }) as CertResearchResult;
      } else {
        resultData = await fetchBatch(sortedAreas);
      }

      setResearchResult(resultData);
      try {
        localStorage.setItem(
          clientCacheKey,
          JSON.stringify({ ts: Date.now(), data: resultData })
        );
      } catch {
        // Ignore cache write error
      }

      setTimeout(() => {
        reportContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : '서버 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const currentReportId = researchResult
    ? `${researchResult.certName}::${[...researchResult.selectedAreas].sort().join(',')}::${researchResult.learnerLevel}`
    : '';

  const isCurrentSaved = savedReports.some((r) => r.id === currentReportId);

  const handleToggleSaveCurrent = () => {
    if (!researchResult) return;
    if (isCurrentSaved) {
      setSavedReports((prev) => prev.filter((r) => r.id !== currentReportId));
    } else {
      const categoryLabel =
        selectedCert?.category || researchResult.overview.certType || '맞춤 조회';
      const newItem: SavedCertReport = {
        id: currentReportId,
        certName: researchResult.certName,
        category: categoryLabel,
        savedAt: researchResult.researchedAt,
        result: researchResult,
      };
      setSavedReports((prev) => [newItem, ...prev.filter((r) => r.id !== currentReportId)]);
    }
  };

  const handleLoadSaved = (saved: SavedCertReport) => {
    setResearchResult(saved.result);
    setSelectedAreas(saved.result.selectedAreas);
    setLearnerLevel(saved.result.learnerLevel);
    const matching = CERT_CATALOG.find((c) => c.name === saved.certName) || null;
    setSelectedCert(matching);
    setCustomCertName(matching ? '' : saved.certName);
    setTimeout(() => {
      reportContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleDeleteSaved = (id: string) => {
    setSavedReports((prev) => prev.filter((r) => r.id !== id));
  };

  const quickShortcuts = [
    '정보처리기사',
    '전기기사',
    '컴퓨터활용능력 1급',
    'SQLD (SQL 개발자)',
    '산업안전기사',
    '공인중개사',
    '한국사능력검정시험 (심화)',
    '투자자산운용사',
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            자격백서
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#catalog-section"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              자격증 탐색
            </a>
            <a
              href="#areas-section"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              영역 선택
            </a>
            <a
              href="#report-anchor"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              맞춤 리포트
            </a>
            <a
              href="#verification-section"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              공식 검증 원칙
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums"
            >
              내 보관함 ({savedReports.length})
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-12">
        {/* Hero Two-Column Split */}
        <section className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-7 md:p-10 flex flex-col justify-between space-y-8">
              <div className="space-y-4">
                <div className="text-xs font-medium text-slate-500">
                  한국 공식 시험기관 · 최신 수험서 · 강사 검증 리서치 워크벤치
                </div>
                <h1 className="font-display text-3xl md:text-4xl font-bold text-slate-900 leading-tight [text-wrap:balance]">
                  하루 종일 검색하던 자격증 공부 준비, 필요한 영역만 1분 만에 확인하세요
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                  기출문제와 면접 답변, 핵심 개념, 강사별 사용 교재·공개 합격률, 문제집의 장단점(개념 비중 vs 문제 수)과 연도별 합격률·취업률까지 최신 한국 웹 자료를 실시간으로 교차 검증해 정리합니다.
                </p>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-500">많이 찾는 대표 자격증 바로 선택</div>
                <div className="flex flex-wrap gap-2">
                  {quickShortcuts.map((name) => {
                    const match = CERT_CATALOG.find((c) => c.name === name);
                    if (!match) return null;
                    const isActive = activeCertTitle === match.name;
                    return (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => handleSelectCatalogCert(match)}
                        className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {match.name.replace(/\s*\(.*?\)/g, '')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 relative rounded-xl border border-slate-200 overflow-hidden bg-slate-100 min-h-[260px]">
              {!imageError ? (
                <img
                  src={HERO_IMAGE_PATH}
                  alt="자격증 수험서와 통계 데이터를 정리하는 학습 책상"
                  referrerPolicy="no-referrer"
                  onError={() => setImageError(true)}
                  className="w-full h-full object-cover lg:h-full"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-100 to-slate-200">
                  <BookOpenCheck className="w-12 h-12 text-blue-700 mb-3" />
                  <p className="text-sm font-semibold text-slate-800">한국 자격증 최신 수험 전략 아카이브</p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/85 via-slate-900/45 to-transparent p-6 text-white">
                <div className="text-xs text-slate-200 mb-1">실시간 Google 검색 기반 한국 공식 자료 검증</div>
                <div className="text-sm font-semibold">
                  확인되지 않은 수치는 &apos;공식 미공개&apos;로 표기하여 거짓 정보를 차단합니다
                </div>
              </div>
            </div>
          </div>

          {/* 4-column summary strip below hero */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500 mb-1">수록 한국 자격증</div>
              <div className="font-mono-num text-2xl font-bold text-slate-900">
                {CERT_CATALOG.length}종+
              </div>
              <div className="text-xs text-slate-600 mt-1">목록 외 자격증도 직접 입력 조회</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500 mb-1">맞춤 선택 영역</div>
              <div className="font-mono-num text-2xl font-bold text-slate-900">6개 핵심 영역</div>
              <div className="text-xs text-slate-600 mt-1">개념·기출·인강·문제집·면접·통계</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500 mb-1">교재·인강 분석 기준</div>
              <div className="font-mono-num text-2xl font-bold text-slate-900">비중 &amp; 사용교재</div>
              <div className="text-xs text-slate-600 mt-1">개념/문제 비율 및 강사 교재 매칭</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500 mb-1">자료 신뢰성 원칙</div>
              <div className="font-mono-num text-2xl font-bold text-blue-700">100% 출처 표기</div>
              <div className="text-xs text-slate-600 mt-1">Q-Net·공식기관 한국 원문 링크 제공</div>
            </div>
          </div>
        </section>

        {/* Step 1: 자격증 탐색 & 선택 */}
        <section id="catalog-section" className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-blue-700">STEP 01</div>
              <h2 className="text-2xl font-bold text-slate-900">공부할 자격증을 선택하거나 직접 입력하세요</h2>
              <p className="text-sm text-slate-600">
                약칭(정처기, 컴활, 산안기, 빅분기, 투운사, 한능검 등)으로도 검색할 수 있습니다.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPopularOnly(false)}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  !popularOnly
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                전체 {CERT_CATALOG.length}종
              </button>
              <button
                type="button"
                onClick={() => setPopularOnly(true)}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  popularOnly
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                주요 인기 자격증만
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="자격증 이름 또는 약칭 검색 (예: 정보처리기사, 컴활, 전기기사, 물류관리사, 노무사)"
                className="w-full pl-10 pr-4 py-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={handleUseCustomCert}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>&apos;{searchQuery.trim()}&apos; 직접 조회 대상으로 지정</span>
              </button>
            )}
          </div>

          {/* Category Filter Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {CERT_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Catalog Grid */}
          {filteredCerts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[540px] overflow-y-auto pr-1">
              {filteredCerts.map((cert) => {
                const isSelected = !customCertName && selectedCert?.id === cert.id;
                return (
                  <div
                    key={cert.id}
                    onClick={() => handleSelectCatalogCert(cert)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectCatalogCert(cert);
                      }
                    }}
                    className={`cursor-pointer rounded-lg border p-4 flex flex-col justify-between space-y-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/40'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="truncate">
                          {cert.certType} · {cert.organizer}
                        </span>
                        {isSelected && (
                          <span className="text-blue-700 font-semibold whitespace-nowrap shrink-0">
                            선택됨
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-base text-slate-900">{cert.name}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                        {cert.summary}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 truncate">{cert.examFormat}</span>
                      <a
                        href={cert.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-700 hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <span>공식처</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg p-8 text-center space-y-3 bg-slate-50">
              <p className="text-sm font-medium text-slate-800">
                목록에서 &apos;{searchQuery}&apos;와 일치하는 항목을 찾지 못했습니다.
              </p>
              <p className="text-xs text-slate-600">
                목록에 없는 자격증이라도 아래 버튼을 누르면 Google 검색을 통해 최신 한국 자료를 직접 조회할 수 있습니다.
              </p>
              <button
                type="button"
                onClick={handleUseCustomCert}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>&apos;{searchQuery}&apos; 직접 선택하기</span>
              </button>
            </div>
          )}
        </section>

        {/* Step 2: 학습 영역 및 수험 수준 선택 */}
        <section
          ref={areasSectionRef}
          id="areas-section"
          className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-blue-700">STEP 02</div>
              <h2 className="text-2xl font-bold text-slate-900">
                필요한 정보 영역을 선택하세요
              </h2>
              <p className="text-sm text-slate-600">
                현재 선택된 자격증:{' '}
                <span className="font-bold text-slate-900">
                  {activeCertTitle || '선택되지 않음'}
                </span>
                {selectedCert && (
                  <span className="text-slate-500"> ({selectedCert.organizer})</span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  applyAreaPreset([
                    'concepts',
                    'past_exams',
                    'lectures',
                    'workbooks',
                    'interview',
                    'stats',
                  ])
                }
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                전체 6개 영역
              </button>
              <button
                type="button"
                onClick={() => applyAreaPreset(['lectures', 'workbooks'])}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                인강·문제집 비교만
              </button>
              <button
                type="button"
                onClick={() => applyAreaPreset(['concepts', 'past_exams', 'interview'])}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                개념·기출·면접 대비
              </button>
              <button
                type="button"
                onClick={() => applyAreaPreset(['stats'])}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                합격·경쟁·취업률만
              </button>
            </div>
          </div>

          {/* 6 Area Multi-Select Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {STUDY_AREAS.map((area) => {
              const checked = selectedAreas.includes(area.id);
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => toggleArea(area.id)}
                  className={`text-left rounded-lg border p-4 transition-colors flex items-start justify-between gap-3 ${
                    checked
                      ? 'border-blue-600 bg-blue-50/40'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-slate-900">{area.label}</div>
                    <p className="text-xs text-slate-600 leading-relaxed">{area.description}</p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                      checked
                        ? 'bg-blue-700 border-blue-700 text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && <Check className="w-3.5 h-3.5" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Learner Level + Submit CTA */}
          <div className="pt-4 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                내 수험 수준:
              </span>
              <div className="flex flex-wrap gap-2">
                {LEARNER_LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLearnerLevel(lvl)}
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                      learnerLevel === lvl
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => runResearch(false)}
              disabled={isLoading || !activeCertTitle || selectedAreas.length === 0}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>최신 한국 자료 검색 및 검증 중...</span>
                </>
              ) : (
                <>
                  <span>선택한 {selectedAreas.length}개 영역 최신 자료 조회하기</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">조회 오류 안내</div>
                  <p className="text-xs mt-0.5 leading-relaxed">{errorMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => runResearch(false)}
                disabled={isLoading}
                className="px-3.5 py-2 text-xs font-semibold text-red-800 bg-white border border-red-300 hover:bg-red-100 rounded-md transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                다시 조회하기
              </button>
            </div>
          )}
        </section>

        {/* Step 3: Research Report Output */}
        <div ref={reportContainerRef} id="report-anchor">
          {isLoading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
              <Loader2 className="w-8 h-8 text-blue-700 animate-spin mx-auto" />
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-slate-900">
                  &apos;{activeCertTitle}&apos; 최신 한국 공식 자료를 교차 확인하고 있습니다
                </h3>
                <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
                  선택하신 {selectedAreas.length}개 영역의 공식 출제기준, 강사·교재 비중, 기출·통계 데이터를 검증 중입니다.{' '}
                  <span className="font-mono-num font-semibold text-blue-700">({elapsedSec}초 경과)</span>
                </p>
              </div>
            </div>
          ) : researchResult ? (
            <ResearchReportView
              result={researchResult}
              isSaved={isCurrentSaved}
              onToggleSave={handleToggleSaveCurrent}
              onRefresh={() => runResearch(true)}
              isRefreshing={isLoading}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 md:p-10 text-center space-y-3">
              <ShieldCheck className="w-8 h-8 text-blue-700 mx-auto" />
              <h3 className="text-lg font-bold text-slate-900">
                자격증과 필요한 영역을 선택한 뒤 조회 버튼을 눌러주세요
              </h3>
              <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
                조회 버튼을 누르면 Google 검색을 통해 확인된 최신 한국 자료만 추출하여 리포트를 구성하며, 확인되지 않은 수치(합격률·경쟁률·취업률)는 임의로 생성하지 않고 &apos;공식 미공개&apos;로 구분해 안내합니다.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Quiet Official Verification Footer */}
      <footer id="verification-section" className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-xs text-slate-600">
          <div className="space-y-1 max-w-2xl">
            <div className="font-semibold text-slate-900">
              자격백서 정보 검증 원칙
            </div>
            <p className="leading-relaxed">
              본 서비스는 실시간 Google 검색 그라운딩을 통해 한국 공식 시행처 및 수험 자료를 조회합니다. 원서접수 일정·응시자격·합격기준의 최종 법적 효력은 반드시 각 시행기관 공식 공고를 기준으로 확인하시기 바랍니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <a
              href="https://www.q-net.or.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-700 underline"
            >
              큐넷 (Q-Net)
            </a>
            <a
              href="https://license.korcham.net"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-700 underline"
            >
              대한상공회의소
            </a>
            <a
              href="https://www.dataq.or.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-700 underline"
            >
              한국데이터산업진흥원
            </a>
            <a
              href="https://www.kuksiwon.or.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-700 underline"
            >
              국시원
            </a>
            {zipAvailable && (
              <a
                href="/api/download-zip"
                download="jagyeok-baekseo-github.zip"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>GitHub 소스 (.zip) 다운로드</span>
              </a>
            )}
          </div>
        </div>
      </footer>

      <SavedReportsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        savedReports={savedReports}
        onLoadReport={handleLoadSaved}
        onDeleteReport={handleDeleteSaved}
      />
    </div>
  );
}
