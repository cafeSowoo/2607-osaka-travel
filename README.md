# 2607 Osaka Travel Desk

오사카 여행 일정, 예약, 체크리스트를 관리하는 개인용 React + Vite PWA입니다.

## 개발

```bash
npm install
npm run dev
```

Supabase 없이 실행하면 데모 모드와 로컬 캐시로 동작합니다.

## Supabase 설정

1. Supabase 프로젝트에서 Google OAuth를 활성화합니다.
2. `supabase/migrations`의 SQL을 적용합니다. 기존 Supabase 프로젝트를 함께 쓸 수 있도록 앱 테이블은 `osaka_` prefix를 사용합니다.
3. `.env.example`을 참고해 `.env.local`을 만듭니다.
4. Supabase Auth Redirect URL에 `http://localhost:5173`과 GitHub Pages 배포 URL을 추가합니다.

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
```

## 배포

GitHub Pages 배포를 전제로 `base: './'`와 hash URL을 사용합니다. GitHub Actions에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` secret을 등록하세요.

Supabase Auth URL Configuration에는 개발 URL `http://127.0.0.1:5173/**`, `http://localhost:5173/**`와 GitHub Pages 배포 URL을 추가하세요. Google OAuth provider의 callback URL은 Supabase 프로젝트 URL 기준 `https://<project-ref>.supabase.co/auth/v1/callback`입니다.

```bash
npm run build
```

## 주요 기능

- Day1~Day5 일정표
- PC 표 편집 + 우측 상세 패널
- 모바일 오늘 일정 카드 + 하단 탭
- 항공/호텔 예약 카드
- 체크리스트
- JPY 기본 예산 + KRW 전환
- PWA 앱 셸 캐시
- Supabase Google 로그인 + RLS 스키마
