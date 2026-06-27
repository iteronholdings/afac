# 아르벤팩토리 / TaskHarbor — 재사용 홈페이지 템플릿 명세서

> 이 문서 하나로 **다른 사이트에 그대로 복제·재사용**할 수 있도록, 기능·연동서비스·잡기능을 **하나도 빠짐없이** 정리한 인벤토리다. (2026-06 업그레이드 반영 — R2 대용량 업로드·백그라운드 잡·노-LLM 텍스트생성·날짜배분 등. §2-bis 참고)

---

## 0. 이 템플릿이 뭔가
3-역할(리뷰어 / 업체 / 관리자) **풀스택 SaaS 보일러플레이트**. 단일 포트에서 React SPA + tRPC API + MySQL이 함께 돈다. 회원가입·로그인, 역할별 포털, 결제(예치금/가상계좌), 채팅, 파일 업로드, 관리자 콘솔, 마케팅 랜딩까지 다 들어있어서 **"로그인-결제-대시보드"가 필요한 어떤 사이트든** 출발점으로 쓸 수 있다.

---

## 1. 기술 스택
| 영역 | 사용 |
|---|---|
| 런타임 | Node.js + **tsx**(dev) / **esbuild**(prod 번들) |
| 서버 | **Express** (단일 포트, Vite 미들웨어 겸용) |
| API | **tRPC v11** (`publicProcedure`/`protectedProcedure`/`businessProcedure`/`adminProcedure`) + **superjson** |
| DB | **MySQL2** + **Drizzle ORM** (+ drizzle-kit) |
| 인증 | **jose**(JWT) + **bcryptjs** + 쿠키 세션 + 외부 OAuth 서버 |
| 프론트 | **React 19** + **wouter**(라우팅) + **@tanstack/react-query** + tRPC client |
| UI | **Tailwind** + **Radix UI** 전체 + lucide-react + sonner(토스트) + framer-motion + recharts(차트) |
| 폼 | react-hook-form + zod + @hookform/resolvers + input-otp |
| 파일/기타 | **jszip**(ZIP 해체/재압축), **xlsx**(엑셀), **@aws-sdk/client-s3**(스토리지), date-fns, nanoid |

빌드: `vite build`(클라) + `esbuild server/_core/index.ts`(서버) → `dist/`. 배포는 push→Railway 자동.

---

## 2. 아키텍처 핵심 패턴 (재사용 시 그대로 가져갈 것)
- **단일 포트**: `server/_core/index.ts`에서 Express가 `/api/trpc` + Vite(dev)/정적(prod)를 한 포트(3000)로 서빙. Railway 등에서 `PORT` 주입되면 **포트스캔 금지**하고 그 값 그대로 bind(안 그러면 "train has not arrived" 404).
- **지연 마이그레이션**: `server/db.ts`의 `getDb()`가 최초 호출 시 `runMigrations` 1회 실행 — `ALTER TABLE ... ADD COLUMN`(중복은 `ER_DUP_FIELDNAME` 무시) + `CREATE TABLE IF NOT EXISTS` + ENUM `MODIFY`. **마이그레이션 파일 없이** 코드만 고치고 서버 재시작하면 스키마가 따라온다.
- **역할 게이트**: `_core/trpc.ts`의 4단계 procedure로 권한 분리. `user`(리뷰어) / `business`(업체) / `admin`.
- **세션**: 쿠키 기반 JWT, `_core/context.ts`가 매 요청 `ctx.user` 주입.
- **이미지/파일 저장**: base64 data URL을 longtext 컬럼에 직접 저장(썸네일·인증샷). Express body limit `100mb`. **단, base64-in-DB는 MySQL `max_allowed_packet`(기본 64MB) 때문에 ~40MB가 한계** → 대용량은 §2-bis R2 패턴 사용.

---

## 2-bis. ★ 재사용 패턴 (2026-06 업그레이드 — 검증 완료)

> 이번 세션에서 실전 검증된 고가치 패턴들. 새 사이트에서 그대로 가져다 쓰면 된다.

### (a) 대용량 파일 = Cloudflare R2 직접 업로드 (base64-DB 한계 우회)
`server/storage.ts` + `_core/storageProxy.ts`. 흐름:
1. **브라우저 → R2 presigned PUT 직접 업로드**: 클라가 `campaign.zipUploadUrl`(presign 발급, businessProcedure)로 URL 받아 `fetch(url,{method:"PUT",body:file})`. tRPC JSON body(33% 팽창)·DB packet 한계를 우회 → **GB급 가능**. ContentType 미서명으로 헤더 불일치 회피.
2. **저장 참조**: 컬럼엔 `r2:<key>` 문자열만. (base64 레거시도 계속 지원 — `r2KeyOf()`로 분기)
3. **다운로드**: `/manus-storage/<key>?dl=<파일명>` 프록시가 307→서명 URL 리다이렉트(`storageGetSignedUrl`, ResponseContentDisposition로 파일명 강제). GET은 CORS 불필요(top-level navigation).
4. **CORS**(브라우저 PUT용): R2 버킷에 AllowedOrigins=[사이트도메인, localhost], Methods=[GET,PUT,HEAD], Headers=[*]. 안 하면 PUT preflight 실패.
5. **완료 시 삭제(비용 최소화 B안)**: 캠페인 closed/반려/삭제 시 원본+패킷 R2 키 삭제(`cleanupCampaignStorage`).
6. **폴백**: presign 실패(스토리지 미설정)면 ≤45MB는 base64로 자동 폴백 → 배포 시점 무관하게 안 깨짐.
- 헬퍼: `storagePut / storageGetSignedPutUrl / storageGetBytes / storageDelete / storageGetSignedUrl(downloadName) / isStorageConfigured`.

### (b) 무거운 작업은 백그라운드 + 키별 직렬화 (가입 즉시 응답)
수십초~수분 걸리는 작업(대용량 ZIP 분해·R2 업로드)을 요청에서 떼어내 **응답 후 실행**(Railway 상주 Node라 프라미스 계속 돎). `participation.ts`의 `scheduleAssignPacket`: `Map<key, Promise>`로 **키별 체인** → 동시 호출 시 겹침 0(중복처리·경쟁 방지), 새 호출은 직전 작업 뒤 한 번 더 → 누락 0. 클라는 §(f) 조건부 폴링으로 완료 감지.

### (c) 타임존 함정 — `toISOString()` 금지, 로컬 포맷 써라
`new Date("2026-07-03").toISOString().slice(0,10)`은 **UTC라 KST에서 하루 밀린다**(07-02). 날짜 'YYYY-MM-DD' 만들 땐 항상 로컬 기반 `fmtLocal(d)`(getFullYear/Month/Date) 사용. 서버에서 KST 판단은 `new Date(Date.now()+9*3600*1000)` 후 `getUTCHours()/toISOString()`.

### (d) 목록 페이로드 경량화 — 무거운 컬럼 제거
list 엔드포인트는 `{...row}` 그대로 내리지 말 것. base64 ZIP/큰 blob이 섞이면 **응답이 수십 MB**(실측 admin 목록 70MB→로딩 지연). `const {photoGuideZip, ...rest}=row; return {...rest, hasPhotoGuideZip:!!photoGuideZip}` 처럼 **존재 플래그만** 노출. (myBusiness/listAll/mine 전부 이 방식)

### (e) 노-LLM 텍스트 생성 (페르소나 기반, 비용 0)
`server/reviewDraft.ts`: 14개 페르소나(말투)별 문장 풀에서 무작위 조합+어순 셔플 → 매번 다른 자연스러운 한국어 생성. API 키·비용 0. "다양한 말투의 리뷰/문구 자동생성" 같은 데 그대로 재사용. (진짜 LLM 원하면 `_core/llm.ts`에 키 연결)

### (f) 조건부 react-query 폴링 — 백그라운드 완료만 감지
`refetchInterval: query => query.state.data?.some(대기조건) ? 8000 : false` — 백그라운드 작업 대기 중에만 폴링하고 끝나면 멈춤. (사진 패킷 준비되면 버튼 자동 노출에 사용)

### (g) 업로드 진행 중 제출 차단
대용량 비동기 업로드(presigned PUT) 중 사용자가 다음/제출로 넘어가면 키 누락 발생 → `uploading` 상태로 **다음·제출 버튼 비활성** + 가드. (안 하면 R2엔 올라갔는데 레코드엔 안 붙는 고아 발생)

### (h) 중복 계정(부계정) 차단 = 전화번호 조인
`countCampaignParticipantsByPhone(campaignId, phone, excludeUserId)` — participations⋈users 조인으로 같은 번호 다른 계정 참여를 차단. (번호 없으면 통과)

### (i) 날짜 배분 스케줄 + 당일 노출
`schedule` JSON `{날짜:정원}`에서 가입 시 이른 날짜부터 선착순 `assignedDate` 자동배정(`pickAssignedDate`), 당일이면 "🔔 오늘 진행" 배지. 당일 마감 컷오프(예: 오후 2시)는 클라 검증 + 서버 KST 가드.

### (j) 통합 ZIP 분배 2모드
통합 ZIP 안에 **리뷰어별 .zip이 있으면 그 내부 zip을 그대로** 1명씩(재압축X), 없으면 **최상위 폴더별 re-zip**(`assignPacketsForCampaign`).

---

## 3. 디렉터리 지도
```
server/
  _core/            플랫폼 스캐폴드(아래 §8) + index.ts(부트), trpc.ts, context.ts, db접근
  routers/          도메인 API (auth, campaign, participation, deposit, ...)
  routers.ts        appRouter 조립
  db.ts             Drizzle 헬퍼 + 마이그레이션
  portone.ts        ★ PortOne 결제 연동
  depositCredit.ts  ★ 가상계좌 입금→예치금 반영(멱등)
drizzle/schema.ts   10개 테이블 정의
client/src/
  App.tsx           라우트 맵
  pages/            화면(공개/리뷰어/업체(client)/관리자(admin))
  components/       레이아웃·다이얼로그·위젯(아래 §7)
  lib/              trpc.ts, workflow.ts, utils.ts
.claude/            launch.json(dev서버), skills/run-taskharbor
```

---

## 4. 라우트 맵 (프론트, `App.tsx`)
**공개**: `/`(랜딩) · `/onboarding` · `/404`
**리뷰어 포털**(URL 난독화 `/afreviewer`): `/afreviewer/login` · `/afreviewer/signup` · `/home` · `/campaigns` · `/my`(내 활동)
**업체 포털**(`/client`): `/client/login` · `/client/signup` · `/client/dashboard`(홈) · `/client/campaigns` · `/client/campaign/new`(신청 위저드) · `/client/consulting` · `/client/deposit`
**관리자**(`/admin`): `/admin`(캠페인) · `/admin/participations` · `/admin/settlement` · `/admin/businesses` · `/admin/members` · `/admin/consulting`

> 리뷰어 로그인 경로를 `/afreviewer`로 숨긴 건 셀러에게 노출 안 하려는 의도. 랜딩 footer에서도 리뷰어 링크 제거.

---

## 5. 데이터 모델 (10 테이블, `drizzle/schema.ts`)
| 테이블 | 용도 |
|---|---|
| `users` | 회원(role: user/business/admin), 비번해시, 은행계좌, memberCode(A-001…), depositBalance, reviewerAgreedAt |
| `campaigns` | 캠페인(상품/키워드/슬롯, photoCount·textCount·starCount, 일정·schedule, photoGuideZip, status 6종) |
| `campaign_drafts` | 캠페인 신청 임시저장(서버측, JSON data) |
| `participations` | 리뷰어 참여(상태머신 applied→…→paid, 인증샷 3종, reviewType, assignedPacket/Name, **reviewDraft**(AI원고), **assignedDate**(날짜배분)) |
| `messages` | 참여 단위 메시지(리뷰어↔운영) |
| `direct_messages` | 리뷰어↔관리자 DM(FloatingChat) |
| `business_messages` | 업체↔리뷰어 DM(BusinessChatDialog) |
| `consulting_requests` | 상위노출 컨설팅 문의 |
| `deposit_transactions` | 예치금 거래 장부(charge/deduct/campaign/refund) |
| `deposit_requests` | 충전요청(manual/vbank, 세금계산서 정보, 가상계좌 정보) |

---

## 6. API 표면 (tRPC, `appRouter`)
- **auth**: me, signup, login, checkLoginId, agreeReviewerTerms, logout
- **campaign**: listPreview/listOpen/get/listAll, create/update/remove/setStatus(관리자), fetchProductMeta, request(예치금 차감 신청·당일마감 가드), myBusiness, **saveDraft/myDrafts/getDraft/deleteDraft**, **zipUploadUrl**(R2 presigned PUT 발급), assignZipPackets(ZIP→리뷰어 배정), campaignParticipants
- **push**: publicKey/subscribe/unsubscribe (웹 푸시 VAPID)
- **participation**: mine, myPacket, join(★사진→글자→별점 선착순 자동배정), submitSearch/Purchase/ReviewProof, listAll/setStatus(관리자)
- **deposit**: me, config(vbank 활성여부), requestCharge(수동), initVbankCharge/syncVbank(가상계좌), myRequests
- **admin**: listMembers, setRole/setMemberCode/setMemberPassword, listBusinesses, adjustDeposit, depositLog, listDepositRequests/processDepositRequest(충전요청 승인), settlementList
- **message / directMessage / businessMessage**: list/send/markRead/unreadCount(채팅 3종)
- **consulting**: create/list/setStatus
- **upload**: image
- **system**: notifyOwner(관리자)

---

## 7. 화면·컴포넌트 인벤토리
**레이아웃**: ClientLayout(업체 사이드바+예치금), AdminLayout, DashboardLayout(리뷰어), AuthLayout, SiteHeader
**핵심 위젯**: CampaignWizard(4스텝 신청+자동저장), WorkflowStepper(진행상태), FloatingChat(리뷰어↔운영 FAB), BusinessChatDialog/ChatDialog, ChargeRequestDialog(충전/가상계좌), DepositHistory, PasswordResetButton, CampaignCard, CampaignFormDialog, ProofThumb(인증샷), ReviewerGuide, ImageUploader, Map, AIChatBox, ManusDialog, BrandLogo, ErrorBoundary, ComponentShowcase(UI 카탈로그)

---

## 8. ★ 연동서비스 / 잡기능 — 하나도 빠짐없이

### 8-A. 제품 외부 연동 (실제 운영 중)
| 서비스 | 위치 | 역할 | 필요 키/설정 |
|---|---|---|---|
| **MySQL** | `DATABASE_URL` | 메인 DB (Railway 호스팅) | `DATABASE_URL` |
| **PortOne(포트원) V2** | `server/portone.ts`, `depositCredit.ts`, 웹훅 `/api/portone/webhook` | 예치금 **가상계좌 자동충전**(발급→입금→웹훅→반영, 멱등+금액검증). 키 없으면 수동 충전요청으로 자동 폴백 | `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY`, `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET` |
| **Cloudflare** | (대시보드) | DNS + 무료 SSL + 루트→www 리다이렉트 규칙(apex CNAME 플래트닝) | 네임서버 이전 |
| **Railway** | push→자동배포 | 호스팅/도메인/볼륨(MySQL). `PORT` 주입 | GitHub 연동 |
| **OAuth 서버** | `_core/oauth.ts` | 외부 OAuth 로그인 | `OAUTH_SERVER_URL`, `OWNER_OPEN_ID` |
| **Cloudflare R2(S3 호환)** | `server/storage.ts`, `_core/storageProxy.ts`(`/manus-storage/*`) | 대용량 파일 = 브라우저 presigned PUT 직접 업로드 + 서명URL 프록시 서빙 + 완료 시 삭제(§2-bis a). base64-DB 한계 우회 | `S3_ENDPOINT/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET` + 버킷 CORS |

### 8-B. 플랫폼 스캐폴드 (`_core/`, 바로 쓸 수 있게 배선된 잡기능들)
> Manus WebDev 템플릿 기반의 **선배선 연동 헬퍼**. 키만 꽂으면 동작. 새 사이트에서 안 쓰면 무시하면 되고, 필요하면 즉시 활용.
- **`llm.ts`** — LLM 호출 헬퍼 (Forge API). 챗봇/요약/분류 등.
- **`imageGeneration.ts`** — 이미지 생성 (내부 ImageService).
- **`voiceTranscription.ts`** — 음성→텍스트(STT).
- **`map.ts`** — Google Maps 연동 (`@types/google.maps`, `Map.tsx` 컴포넌트).
- **`dataApi.ts`** — 외부 데이터 API 게이트웨이 (예: `Youtube/search`).
- **`notification.ts`** + **`systemRouter.notifyOwner`** — 운영자 알림 발송.
- **`heartbeat.ts`** — **크론 스케줄러**(6-field, 초 단위, UTC). 정기작업.
- **`sdk.ts`** — 내부 SDK 헬퍼.
- **`oauth.ts` / `cookies.ts` / `context.ts`** — 인증·세션 배선.

### 8-C. 프로덕트 내장 "잡기능"
- **임시저장 2종**: ① localStorage 자동저장/복원(버튼 없음, 이탈 시 안내 팝업) ② 서버 draft `?draft=id` 이어쓰기(크로스기기, ClientHome 목록)
- **썸네일 Ctrl+V 붙여넣기** 업로드 + 파일 업로드
- **ZIP 패킷 분배**: 통합 ZIP을 리뷰어별로 해체해 photo 리뷰어에게 자동 배정 — 내부 .zip 그대로/폴더 re-zip 2모드(§2-bis j), 가입 시 **백그라운드 배정**(§2-bis b)
- **AI 리뷰 원고 자동생성**: 14말투 페르소나, 노-LLM, 사진/글자 리뷰어에 가입 시 자동배정(§2-bis e)
- **리뷰어 타입 선착순 자동배정**(사진→글자→별점) + **날짜 배분 자동배정**(§2-bis i)
- **중복 계정 차단**(전화번호, §2-bis h) · **당일 진행 마감 컷오프**(KST 가드)
- **웹 푸시 알림**: VAPID + service worker(`client/public/sw.js`) + Push API, 채팅/이벤트 시 푸시(`server/webpush.ts`, `routers/push.ts`, `lib/push.ts`, `ChatNotifier`/`PushPrompt`)
- **예치금 원장**: 충전/차감/결제/환불 내역, 잔액, 충전요청+세금계산서 발급정보+관리자 승인
- **회원코드 자동발급**(A-001…), **관리자 비밀번호 재설정**
- **채팅 3종**: 참여단위·리뷰어↔관리자·업체↔리뷰어 (5초 폴링, 이미지 첨부+압축)
- **정산**: approved 참여자 + 리뷰어 계좌 목록
- **상위노출 컨설팅 문의** 폼→관리자 탭 적재
- **반응형/모바일**: 사이드바 햄버거, FAB 겹침 방지(본문 하단 패딩), 그리드 반응형
- **랜딩 SEO/마케팅**: 히어로·가격표·FAQ 아코디언·신뢰 지표

---

## 9. 환경변수(.env) 레퍼런스
```
DATABASE_URL=mysql://user:pass@host:port/db    # 필수
JWT_SECRET=...                                  # 세션 서명
OAUTH_SERVER_URL=...                            # OAuth(쓸 경우)
OWNER_OPEN_ID=...                               # 최상위 관리자 식별
PORT=3000                                       # 플랫폼이 주입(로컬 생략 가능)
VITE_APP_ID=...                                 # 프론트 앱 식별
# 가상계좌 결제(선택 — 없으면 수동 충전요청으로 폴백)
PORTONE_STORE_ID=...
PORTONE_CHANNEL_KEY=...
PORTONE_API_SECRET=...
PORTONE_WEBHOOK_SECRET=...
# R2/S3 스토리지(선택, 대용량 업로드): S3_ENDPOINT/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET (+버킷 CORS 설정)
# 웹 푸시(선택): VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT
```
> `.env`는 **절대 커밋 금지**(gitignore됨).

---

## 10. 새 사이트로 재사용하는 순서
1. 레포 복제 → `pnpm install`
2. 새 MySQL 준비 → `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID` 세팅
3. `pnpm dev` → 최초 실행 시 테이블 자동 생성(지연 마이그레이션)
4. 브랜딩 교체: `BrandLogo`, 색상 토큰(oklch CSS 변수), `Landing.tsx` 카피
5. 도메인 모델 조정: 안 쓰는 라우터/테이블 제거, 필요한 것 추가(같은 패턴으로)
6. 결제 켜려면 PortOne 키 4개 → `.env` → 자동으로 가상계좌 활성
7. 배포: GitHub→Railway 연결, `.env` 주입, 도메인은 §11

---

## 11. 배포 + 도메인 플레이북 (실전 검증됨)
- **Railway**: GitHub `main` push → 자동 빌드/배포. `PORT` 주입 그대로 사용.
- **커스텀 도메인 한계**: Railway 무료/Trial 플랜은 **커스텀 도메인 1개**. www를 쓰면 루트(apex)는 직접 못 붙임.
- **apex(루트) 도메인 해법** = **Cloudflare**:
  1. 네임서버를 Cloudflare로 이전(레지스트라에서 변경, 전파 1~3h).
  2. www: `CNAME www → <railway-target>` **DNS only(회색)** + `TXT _railway-verify.www` → Railway가 인증서 발급.
  3. 루트: `CNAME afac.kr → <railway-target>`을 **Proxied(주황)**로 + **Redirect Rule**(템플릿 "Redirect from root to WWW") `afac.kr/* → https://www.afac.kr/${1}` 301. → 루트는 Cloudflare 무료 SSL로 받고 www로 리다이렉트(플랜 업그레이드 불필요).
  4. 메일 MX 레코드는 DNS only로 유지(프록시 X).
- **흔한 함정**: 브라우저 "주의 요함/CERT_COMMON_NAME_INVALID"은 보통 **Railway에 해당 도메인 미등록**(엣지가 `*.up.railway.app` 인증서를 줌). 도메인을 Railway에 추가하거나 위 Cloudflare 리다이렉트로 우회.

---

## 12. 테스트/운영 메모
- 빌드 검증: `pnpm build`(esbuild/vite, transpile-only — 기존 `_core`의 forgeApi 타입 에러는 무시됨, 배포 무관).
- 로컬 구동/스모크: `.claude/skills/run-taskharbor`.
- 테스트 계정: `biz_test01`/`rv_test01` (test123).
- DB는 운영(Railway)과 공유될 수 있으니 테스트 데이터는 즉시 정리.
