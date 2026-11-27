# REP — 개인용 오프라인 운동 기록 PWA

아이폰 홈 화면에 추가해 **완전 오프라인**으로 사용할 수 있도록 설계한 개인용 근력 운동 기록 웹앱입니다.

> **Project Goal**  
> **Qwen3.8-27B** 로컬 모델과 다양한 **Skills**, 도메인 특화 미세조정(UI/UX·상태 관리·오프라인 캐싱·예외 케이스 검증)을 결합해, 프로덕션 수준의 완성도와 실사용 편의성을 갖춘 앱을 구축하는 것을 목표로 개발했습니다.

---

## 주요 기능

- **완전 오프라인 PWA**: Workbox Service Worker 프리캐시(앱 셸 + 운동 마스터 JSON) 및 운동 이미지 온디맨드 `CacheFirst` 캐싱으로 비행기 모드에서도 동작
- **로컬 데이터 저장 (IndexedDB)**: 서버·계정 없이 브라우저 내 IndexedDB에 운동 기록, 세트, 루틴, 즐겨찾기, 설정을 영구 저장
- **루틴 관리 & 자동 이어받기**: 루틴 저장·수정·삭제·순서 드래그·스와이프 삭제 지원, 이전 운동의 세트 수·중량(`kg`/`lb`)·반복 횟수·운동별 휴식 시간 자동 불러오기
- **휴식 타이머 & 전역 RestBar**: `endTime` 기반 타이머로 백그라운드 복귀 후에도 정확한 남은 시간 계산, 다른 탭 이동 시 하단 `RestBar` 유지
- **운동 라이브러리 & 근육 맵**: 국문/영문 검색, 장비·부위 필터, 대체 운동 추천, `@emmorts/body-muscles` 기반 타겟 근육 시각화
- **JSON 백업 / 복원**: 전체 데이터를 단일 JSON 파일로 내보내고 복원

---

## 기술 스택

- **Frontend**: React 19, TypeScript, React Router (`HashRouter` + keep-alive 탭)
- **Storage & PWA**: `idb` (IndexedDB), `vite-plugin-pwa` (Workbox)
- **Build & Test**: Vite, Oxlint, Vitest (`jsdom` + `fake-indexeddb`)

---

## 시작하기

```bash
npm install
npm run dev      # 로컬 개발 서버
npm run lint     # 린트 검사 (oxlint)
npx vitest run   # 단위·통합 테스트 (93개)
npm run build    # 프로덕션 빌드 (dist/)
```

---

## 배포 (Cloudflare Pages)

정적 파일(`dist/`)만으로 동작하므로 Cloudflare Pages의 **GitHub 연동** 또는 **Direct Upload**로 무료·무워터마크 배포가 가능합니다.

- **Build command**: `npm run build`
- **Build output directory**: `dist`

---

## Third-party Credits

- **@emmorts/body-muscles v2.1.1** — SVG 근육 일러스트 맵 (`src/components/MuscleMap.tsx`)
  - License: Apache-2.0 (`node_modules/@emmorts/body-muscles/LICENSE` 및 `NOTICE` 참고)
  - Copyright: EmMorts (fork of `vulovix/body-muscles`)
