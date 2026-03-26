# CanvasExportTool4u Unified Toolkit

Chrome 확장 하나에서 아래 2가지 기능을 함께 사용합니다.

- **Canvas Saver**: 현재 탭의 캔버스 페이지를 PNG로 순차 저장
- **DRM Debugger**: DRM 관련 네트워크 요청 모니터링/차단/모킹

---

## 1) 설치 방법 (Chrome)

1. Chrome 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** ON
3. **압축해제된 확장 프로그램을 로드** 클릭
4. 이 폴더(`CanvasExportTool4u_unified`) 선택
5. 툴바에서 확장 아이콘 클릭 → 팝업 열림

> 팝업 파일: `merged_popup.html`

---

## 2) 기본 사용 흐름

1. 대상 웹페이지 탭을 먼저 열고 활성화
2. 확장 아이콘 클릭
3. 상단 탭에서 기능 선택
   - **Canvas Saver**
   - **DRM Debugger**

---

## 3) Canvas Saver 사용법

### 빠른 시작

1. 캔버스가 보이는 페이지 탭을 활성화
2. 팝업에서 **Canvas Saver** 탭 선택
3. 필요하면 설정 수정
4. **시작** 클릭
5. 저장 진행 중에는 상태 박스에서 진행 상황 확인
6. 중단하려면 **중지** 클릭

### 버튼 설명

- **설정 저장**: 현재 입력값을 `chrome.storage.local`에 저장
- **시작**: 활성 탭에 저장 작업 시작
- **중지**: 저장 작업 중단
- **상태 새로고침**: 현재 상태(실행 여부, 저장 수, 오류) 갱신

### 주요 설정값 설명

- **Page selector**: 페이지 블록을 찾는 CSS 선택자 (기본: `.page`)
- **Canvas selector**: 각 페이지 내부 캔버스를 찾는 선택자 (기본: `canvas`)
- **Page number attribute**: 페이지 번호를 읽을 속성명 (기본: `data-page-number`)
- **Filename prefix**: 저장 파일명 접두사 (기본: `page`)
- **Render wait (ms)**: 렌더 후 캡처 전 대기 시간
- **Min blob size**: 너무 작은(비정상) 이미지를 건너뛰기 위한 최소 크기
- **Auto scroll**: 자동 스크롤 저장 사용 여부 (**기본 체크됨**)
- **Scroll step (px)**: 자동 스크롤 1회 이동량
- **Scroll interval (ms)**: 자동 스크롤 간격

### 저장 파일명 형식

- `<prefix>-0001.png`, `<prefix>-0002.png` ...

---

## 4) DRM Debugger 사용법

### 빠른 시작

1. DRM 테스트 대상 페이지(예: CanvasExportTool4u 도메인/로컬) 열기
2. 팝업에서 **DRM Debugger** 탭 선택
3. **DRM 테스트 모드** 토글 ON
4. 모드 선택
   - **모니터링**: 요청 기록만
   - **차단**: DRM 패턴 요청 차단 규칙 적용
   - **모킹**: 모킹 이벤트 로깅 중심
5. 하단 로그/통계 확인

### 버튼 설명

- **에이전트 점검**: 로컬 DRM Agent 포트(7777/8443/9443/7443) 연결 확인
- **로그 내보내기**: 현재 로그를 `.txt`로 저장
- **초기화**: 로그/통계 초기화

### DevTools 패널

확장에는 DevTools 전용 패널도 포함되어 있습니다.

1. 대상 페이지에서 `F12` (DevTools 열기)
2. 상단 탭에서 **🛡 DRM** 선택

---

## 5) 자주 겪는 문제

### Q1. "활성 탭을 찾을 수 없음" 오류

- 팝업을 띄우기 전에 대상 페이지 탭이 활성화되어 있는지 확인
- 새 탭으로 전환 후 다시 시도

### Q2. Canvas Saver가 저장을 안 함

- `Page selector`, `Canvas selector`가 현재 페이지 구조와 맞는지 확인
- `Render wait` 값을 늘려 렌더 완료 후 캡처되도록 조정
- `Min blob size`가 너무 큰지 확인

### Q3. DRM 로그가 안 보임

- DRM 테스트 모드 ON 여부 확인
- 대상 요청이 DRM 패턴(markany/webdrm/madrm/maws 등)에 해당하는지 확인
- 대상 URL이 확장 동작 범위인지 확인

### Q4. 에이전트 점검이 모두 실패

- 로컬 DRM Agent 실행 여부 확인
- 방화벽/보안 프로그램이 포트(7777/8443/9443/7443)를 막지 않는지 확인

---

## 6) 프로젝트 파일 핵심 구조

- `manifest.json`: 확장 진입점/권한
- `merged_popup.html|css|js`: 통합 팝업 UI/로직
- `merged_background.js`: 백그라운드 엔트리
- `canvas_background.js`, `canvas_content.js`: Canvas Saver 동작
- `drm_background.js`, `drm_content.js`, `drm_page_world.js`: DRM 디버깅 동작
- `drm_devtools.html|js`, `drm_panel.html|js`: DevTools 패널

---

## 7) 참고

- 이 프로젝트는 MV3(Manifest V3) 기반입니다.
- 설정/상태 일부는 `chrome.storage.local`에 저장됩니다.
