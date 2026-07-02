# 아르벤팩토리 — AI 수익화 서비스 실행 문서

> 이터론이 이미 보유한 자산(아르벤팩토리 리뷰/캠페인 플랫폼 + 연결 도구)으로 **바로 매출을 붙일 수 있는** 3개 서비스의 수익모델·화면흐름·구현계획.
> 우선순위: **① 광고 소재 공장 → ③ 기존 고객 광고대행 업셀 → ② 상세페이지 자동제작**
> (문서 기준일: 2026-07)

---

## 0. 이미 손에 있는 무기 (재사용 자산)

| 자산 | 위치 | 새 서비스에서의 역할 |
|---|---|---|
| 3-역할 풀스택 SaaS 보일러플레이트 | 전체 (`server/_core`, `client`) | 로그인·결제(예치금/가상계좌)·역할게이트·파일업로드·관리자콘솔을 **그대로 재사용** |
| 역할 게이트 | `server/_core/trpc.ts` | `user`(리뷰어) / `business`(업체) / `admin` — 신규 서비스도 같은 게이트로 권한 분리 |
| 컨설팅 의뢰 라우터 | `server/routers/consulting.ts` | **③ 광고대행 업셀의 원형** — 셀러가 의뢰 제출 → 관리자 상태관리 패턴 그대로 확장 |
| LLM 호출 | `server/_core/llm.ts` (`callLLM`) | 카피/상세페이지/스크립트 텍스트 생성 |
| 이미지 생성 | `server/_core/imageGeneration.ts` (`generateImage`) | 상세페이지 연출컷·광고 이미지 소재 (내부 Forge API, 편집도 지원) |
| 카테고리 감지 로직 | `server/reviewDraft.ts` | 식품/뷰티/전자/리빙/육아/펫 등 **카테고리별 톤 분기** — 상세페이지에 이식 |
| R2 대용량 업로드 | `server/storage.ts`, `_core/storageProxy.ts` | 영상 소재(GB급) 업로드/다운로드 |
| 백그라운드 잡 + 키별 직렬화 | `participation.ts` `scheduleAssignPacket` | 영상 렌더·소재 배치 생성처럼 수십초 걸리는 작업을 응답 후 처리 |
| Meta 광고 MCP (2종) | 연결된 MCP | 캠페인/광고세트/소재 생성, 카탈로그, 타겟, A/B, 인사이트 |
| Higgsfield MCP | 연결된 MCP | 영상/이미지/음성/3D 생성, 마케팅스튜디오, **바이럴 예측** |
| Gmail / Slack / Drive MCP | 연결된 MCP | 리포트 발송, 소재 납품, 알림 |

> 핵심: 세 서비스 모두 **새로 지을 게 별로 없다.** 기존 보일러플레이트 위에 라우터/테이블 몇 개 + MCP 연동만 얹는 구조.

---

## ① 광고 소재 공장 (최우선 · 상품성 1위)

### 한 줄 정의
상품 정보 하나 넣으면 **영상 5종 + 이미지 10종 + 훅카피 20종**을 생성하고, 바이럴 예측으로 상위 소재만 골라 **Meta에 자동 업로드·A/B 세팅**까지 해주는 파이프라인.

### 왜 차별화되나
경쟁사는 "제작"에서 끝난다. 우리는 **생성 → 사전 성과예측 → 업로드 → 실측 → 재생산**의 루프를 닫는다. 소재가 광고 성과 데이터로 돌아오고, 그 데이터가 다음 소재를 만든다.

### 수익모델
- **구독형 (권장)**: 월 정액으로 소재 N세트 + 운영. 예) 라이트 50만/월(소재만), 프로 150만/월(소재+업로드+주간 리포트).
- **성과연동 옵션**: 광고비의 10~15% 대행 수수료 (프로 상위 플랜).
- **건별**: 소재 패키지 1세트 단품 판매 (신규 유입용 미끼상품).

### 대상 고객
아르벤팩토리 기존 업체 고객 → 중소 이커머스 셀러 → 퍼포먼스 대행 필요한 브랜드.

### 화면 흐름 (business 포털)
1. **소재 의뢰 생성**: 상품명·URL·카테고리·핵심 셀링포인트·톤·타겟(성별/연령/관심사) 입력, 원본 이미지/영상 업로드(R2).
2. **생성 진행(백그라운드)**: 잡 큐에 등록 → "준비 중" 즉시 표시 → 완료 시 폴링으로 갱신 (`scheduleAssignPacket` 패턴 재사용).
3. **소재 검수 보드**: 생성된 영상/이미지/카피를 카드로 나열. 각 카드에 **바이럴 예측 점수**(Higgsfield `virality_predictor`) 배지. 셀러가 승인/반려/수정요청.
4. **Meta 배포**: 승인된 소재를 캠페인/광고세트에 자동 매핑, A/B로 세팅 (Meta MCP `create_campaign`/`create_adset`/`create_ad_creative`/`bulk_create_ads`).
5. **성과 리포트**: 주간 인사이트(`get_insights`) → 대시보드 차트(recharts) + Gmail/Slack 발송. 저성과 소재 자동 페이즈아웃, 상위 소재 기반 재생산 제안.

### 데이터 모델 (신규 테이블 — 지연 마이그레이션으로 추가)
- `ad_creative_orders`: id, businessId, productName, productUrl, category, sellingPoints, tone, targetSpec(json), status(`queued|generating|review|approved|deployed|reporting|done`), createdAt.
- `ad_creative_assets`: id, orderId, type(`video|image|copy`), storageRef(`r2:<key>` 또는 text), viralityScore, status(`pending|approved|rejected`), metaCreativeId.
- `ad_campaign_links`: id, orderId, metaCampaignId, metaAdSetId, metrics(json), syncedAt.

### 구현 계획 (단계)
1. **라우터 스캐폴딩** `server/routers/adCreative.ts` — `create`(businessProcedure), `myOrders`, `listAssets`, `approveAsset`, admin `deploy`. `routers.ts`에 등록.
2. **생성 파이프라인** `server/adCreative/pipeline.ts`
   - 카피: `callLLM` — 카테고리별 훅 프레임워크(문제제기/후기형/비교형/혜택형) × N.
   - 이미지: `generateImage` — 연출컷/배경 합성 (원본 이미지 편집 모드).
   - 영상: Higgsfield `generate_video` (필요시 `models_explore`로 모델 추천).
   - 예측: `virality_predictor`로 점수화 → 상위만 승인 후보 노출.
3. **백그라운드 잡**: `scheduleGenerate(orderId)` — 키별 직렬화로 중복/누락 0.
4. **Meta 연동** `server/adCreative/meta.ts` — 승인 소재 업로드 + 캠페인/세트/A/B 생성 래퍼.
5. **리포트 잡**: 크론(하루 1회) 인사이트 pull → 링크 테이블 갱신 → 리포트 렌더/발송.
6. **프론트**: `client` business 포털에 소재의뢰 폼 + 검수보드 + 리포트 대시보드.

### 리스크/주의
- Meta 광고 계정 권한/토큰 프로비저닝 (고객 계정 접근 동의 플로우 필요).
- 영상 생성 비용·시간 → 잡 큐 + 세트 상한으로 통제.
- 소재 저작권/광고심의(과장·의료·건기식) → 카피 생성 시 금칙어 필터.

---

## ③ 기존 고객 광고대행 업셀 (최우선 · 가장 빠른 현금)

### 한 줄 정의
아르벤팩토리에서 **리뷰 캠페인이 끝난 상품**의 고객에게, 그 리뷰 자산(인증샷·리뷰원고)을 소재로 **"광고까지 대신 돌려드립니다"** 업셀. 신규 고객 획득 없이 **기존 업체 객단가만 올린다.**

### 왜 최우선(현금 속도)
- 이미 결제·업체 계정·상품 데이터가 다 있음 → **콜드스타트 0**.
- `consultingRouter`가 이미 "셀러 의뢰 → 관리자 처리" 파이프를 갖고 있어 **거의 복붙 확장**.
- ①의 소재 공장이 완성되기 전에도 **수동 반자동**으로 먼저 매출을 낼 수 있음.

### 수익모델
- **셋업비 + 월 운영비**: 초기 셋업 30~50만 + 월 운영 30~100만.
- **광고비 대행 수수료**: 집행액의 10~15%.
- **예치금 연동**: 이미 있는 예치금(`deposit`) 시스템으로 광고비 충전/차감 처리 → 정산 자동화.

### 화면 흐름
1. **업셀 진입점**: 리뷰 캠페인 `approved/paid` 상태 업체에게 "이 상품 광고 대행받기" CTA 노출 (캠페인 상세/마이비즈니스).
2. **광고 의뢰 폼**: 목표(전환/도달), 예산, 기간, 랜딩 URL, 타겟. 리뷰 자산은 **자동 첨부**(해당 캠페인의 인증샷/리뷰원고 pull).
3. **관리자 처리 보드**: 의뢰 목록 + 상태(`new|proposal|running|reporting|done`). 관리자가 제안서 확정 → (초기엔 수동으로 Meta 세팅, 이후 ①파이프 연결).
4. **집행/정산**: 예치금에서 광고비 차감, 수수료 자동 계산, 주간 리포트 발송.

### 데이터 모델
- `ad_agency_requests`: id, businessId, sourceCampaignId(리뷰 캠페인 연결), objective, budget, period, landingUrl, targetSpec(json), status, memo, createdAt.
- 정산은 기존 `deposit`/`depositCredit.ts` 재사용 (광고비 차감 유형 추가).

### 구현 계획
1. **`consultingRouter` 복제·확장** → `server/routers/adAgency.ts` (`create`/`mine`/admin `list`/`setStatus`/`attachReport`).
2. **리뷰 자산 브릿지**: 캠페인 → 인증샷/리뷰원고 조회 헬퍼로 의뢰에 자동 첨부.
3. **업셀 CTA**: 리뷰 완료 캠페인 화면에 조건부 버튼 (`approved|paid`).
4. **정산 훅**: `depositCredit`에 `ad_spend`/`agency_fee` 트랜잭션 유형 추가.
5. **(2차) ①과 연결**: 수동 운영을 소재 공장 파이프라인으로 대체.

### 리스크/주의
- 초기엔 **수동 운영 전제로 출시**(MVP), 자동화는 ① 완성 후 붙임 → 출시 지연 없이 매출 먼저.
- 광고 성과 미보장 고지·계약서(수수료/환불 규정) 필요 — 이미 있는 환불규정 페이지 확장.

---

## ② 상세페이지 자동제작 SaaS (별도 스핀아웃)

### 한 줄 정의
상품 사진 + 기본정보를 넣으면 **카테고리 맞춤 카피 + 섹션 구성 + 연출 이미지**로 완성된 상세페이지를 만들어 이미지/HTML로 내려주는 SaaS.

### 왜 별도 SaaS인가
아르벤팩토리 회원이 아니어도 쓸 수 있는 **범용 툴** → TAM이 가장 큼. 보일러플레이트를 복제해 **독립 도메인 서비스**로 스핀아웃하기 좋다. (`TEMPLATE.md`가 복제 절차를 이미 문서화)

### 수익모델
- **건별**: 페이지당 3~5만원 (크레딧 차감).
- **정액 구독**: 월 N페이지 + 리비전. 예) 스타터 9.9만/월(10페이지).
- **화이트라벨**: 대행사/사입업체에 API·대량 크레딧 공급.

### 화면 흐름
1. **입력**: 상품명·카테고리·핵심 스펙·타겟·톤, 상품 사진 업로드(R2).
2. **생성**: 카테고리 감지(`reviewDraft.ts` 로직 이식) → 섹션 템플릿 선택(후킹/문제제기/특징/스펙표/후기/CTA) → `callLLM`로 섹션별 카피 → `generateImage`로 배경합성·연출컷.
3. **에디터**: 섹션 드래그 재배열, 카피 인라인 수정, 이미지 재생성(부분 편집).
4. **내보내기**: 스티치된 세로 상세이미지(JPG) + HTML + 개별 에셋 ZIP 다운로드 (jszip 재사용).

### 데이터 모델
- `detailpage_projects`: id, ownerId, productName, category, tone, targetSpec(json), status, createdAt.
- `detailpage_sections`: id, projectId, order, type, copy, imageRef.
- 크레딧: `deposit`/크레딧 시스템 재사용.

### 구현 계획
1. 보일러플레이트 복제(신규 repo/도메인) — `TEMPLATE.md` §복제 절차.
2. `server/routers/detailPage.ts` — `create`/`generate`/`updateSection`/`export`.
3. `server/detailPage/compose.ts` — 카테고리 분기 + 섹션 템플릿 + LLM/이미지 조합.
4. 스티칭/HTML 익스포트 유틸.
5. 프론트 에디터 (섹션 리스트 + 인라인 편집 + 미리보기).

### 리스크/주의
- 이미지 품질 편차 → 섹션 템플릿을 고정 프레임으로 잡아 일관성 확보.
- 폰트/브랜드 일관성 → 브랜드킷(로고·컬러·폰트) 입력 옵션.

---

## 전체 로드맵 (권장 실행 순서)

| 단계 | 기간(감) | 내용 | 매출 시점 |
|---|---|---|---|
| **Sprint 0** | 즉시 | ③ 업셀 MVP: `adAgency.ts` 라우터 + 리뷰완료 CTA + 수동 운영. 정산은 예치금 재사용 | **가장 빠름** — 기존 고객 대상 즉시 |
| **Sprint 1** | 2~3주 | ① 소재 공장 코어: 생성 파이프라인(카피/이미지/영상) + 검수보드 + 바이럴 예측 | 소재 구독 판매 시작 |
| **Sprint 2** | +2주 | ① Meta 자동 배포 + 주간 리포트 → ③ 업셀을 소재 공장에 연결(수동→자동) | 대행 수수료 매출 |
| **Sprint 3** | 별도 트랙 | ② 상세페이지 SaaS 스핀아웃 (보일러플레이트 복제 + 에디터) | 범용 신규 유입 |

### 첫 삽 (다음 액션)
1. **③ `adAgency.ts` 라우터 스캐폴딩** — `consultingRouter` 복제 확장 (가장 확실한 매출을 가장 빠르게).
2. **① 파이프라인 인터페이스 정의** — `AdCreativeAsset` 타입 + 잡 큐 골격.
3. 위 둘을 각각 별도 PR로 쌓아 순차 릴리스.

> 이 문서는 계획서다. 실제 라우터/테이블/프론트 구현은 Sprint 단위로 별도 커밋·PR로 진행한다.
