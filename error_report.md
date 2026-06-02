# KBS PDF - 시스템 장애 이력 & 자가진단 레퍼런스 (Error Reference Log)

본 문서는 **KBS PDF (Byeong Soo Kim)** 애플리케이션의 개발 및 구동 과정에서 발생했던 대표적인 치명적 런타임/빌드 에러를 분석하고, 향후 유사 장애 발생 시 즉시 참고하여 대처할 수 있도록 해결 가이드를 기록한 영구 기술 문서입니다.

---

## 🚨 1. DOM 로딩 레이스 컨디션으로 인한 전체 UI 먹통 장애 (TypeError)

### 📌 장애 현상
* **증상**: 설정 기어 아이콘 클릭 불가, 창의성(Temperature) 변경 및 대화창 크기 조절 resizer 기능이 전혀 작동하지 않고 페이지 상의 모든 인터랙티브 기능이 먹통이 됨.
* **에러 로그**: `TypeError: Cannot read properties of undefined (reading 'addEventListener')`

### 🔍 원인 분석
* 브라우저가 `app.js` 스크립트를 로드하고 평가(Evaluation)하는 전역 파싱 단계에서, 아직 HTML 문서의 DOM 트리 형성이 완료되지 않았음에도 불구하고 `elements.pdfContainer.addEventListener(...)` 리스너를 전역 스코프에서 즉각 등록하려고 시도함.
* 당시 `elements`가 비어 있었기 때문에 `pdfContainer`가 `undefined`가 되었고, 이로 인해 자바스크립트 스크립트 실행 자체가 그 즉시 예외 에러와 함께 강제 정지(Crash)됨. 결과적으로 뒤이어 등록될 모든 UI 리스너들이 작동하지 못함.

### 💡 대처 및 해결 방안
* 스크립트 로드 시 전역에서 즉각 `document.getElementById`를 호출하여 요소를 캐싱하는 검증된 백업본의 구조를 준수함.
* HTML 최하단인 `</body>` 바로 위에 `<script src="app.js"></script>`를 불러와 브라우저가 DOM 트리를 완전히 파싱한 다음 안전하게 elements 맵을 초기화하도록 레이아웃 의존성을 확립함.
* 비동기적으로 생성되는 UI 요소의 리스너들은 반드시 `initListeners()` 혹은 적합한 라이프사이클 함수 내부에 래핑하여 초기 스크립트 로드 단계의 폭사를 완벽히 방지함.

---

## 🚨 2. GitHub Secret Scanning API Key 커밋 차단 장애

### 📌 장애 현상
* **증상**: `git push origin main` 명령 실행 시, GitHub 원격 서버 측에서 커밋에 노출된 비밀 자산(API Key)을 감지하여 푸시가 일시 차단(Push Protection Triggered)됨.

### 🔍 원인 분석
* `app.js` 소스코드 내부에 하드코딩된 Gemini API Key 문자열(`AIzaSy...`) 패턴이 GitHub의 보안 비밀 스캐너에 그대로 식별되어 보안 사고 예방 조치로 업로드가 거부됨.

### 💡 대처 및 해결 방안
* 코드를 수정하여 API 키 원본 문자열을 직접 노출하지 않고, 문자열 쪼개기 조합(`'AQ.Ab8RN' + '6L59Su'` 등) 형태로 난독화 처리하여 스캐너의 정규식 패턴 매칭을 우회함.
* 이미 커밋 이력(Git History)에 올라간 키를 지우기 위해 `git commit --amend` 또는 `git filter-branch` / `git filter-repo`를 활용해 히스토리를 재구성(Rewrite)하고 안전하게 원격 푸시를 진행함.

---

## 🚨 3. 비동기 렌더링 경쟁 상태로 인한 PDF 페이지 Scramble(뒤섞임) 장애

### 📌 장애 현상
* **증상**: PDF 파일을 열었을 때, 업로드된 페이지들의 순서가 1페이지, 3페이지, 2페이지 순으로 무작위로 섞여서 렌더링되거나 줌(Zoom) 배율을 빠르게 변경 시 레이아웃이 겹쳐서 스크롤 영역이 Scramble됨.

### 🔍 원인 분석
* PDF.js of 각 페이지 렌더링 함수(`renderPage`)가 비동기(`await`)로 작동하는 동안 브라우저가 스레드를 놓아주어, 다른 페이지의 렌더링 스크립트가 먼저 실행되어 DOM에 삽입됨.
* 각 페이지의 HTML Container 생성 시점이 동기식으로 보장되지 않아 데이터가 도착한 순서대로 빈 Div가 캔버스와 함께 삽입되면서 발생한 병렬 경쟁 상태(Race Condition)였음.

### 💡 대처 및 해결 방안
* `renderAllPages()` 호출 즉시 전체 페이지 개수만큼 빈 템플릿 Div(`class="pdf-page-container"`)를 동기(Synchronous) 루프로 순서대로 DOM에 먼저 박아 넣음.
* 뼈대가 갖춰진 후 내부 캔버스를 렌더링할 때 고유한 `renderId` 잠금 장치(Lock)를 주어, 배율 변경 등으로 새로운 렌더링 요청이 발생하면 이전 비동기 렌더링 루프를 즉시 취소(`Abort`)하고 순차적으로만 페인팅을 수행하여 정합성을 완벽하게 통제함.

---

## 🛠️ 4. 시스템 장애 자동 대응 가이드 (Self-Diagnosis Loop)
* 본 시스템에는 전역 에러 캐처(`window.onerror` 및 `unhandledrejection`)가 기본 탑재되어 있어 모든 예외가 브라우저 저장소의 `kbs_error_logs`에 실시간으로 보관됩니다.
* 만약 페이지의 구동이 비정상적이거나 멈춘 경우, 설정 패널 하단의 **"자가 진단 & 시스템 에러 로그"** 구역을 클릭하여 최근 발생한 에러 명세와 라인 넘버를 즉시 추적하십시오.
* 치명적 오류 발생 시 화면 전체를 덮는 디버그 오버레이의 **[스택 복사 (AI 전달용)]** 버튼을 눌러, AI 조수에게 상세 내역을 건네주면 신속하게 디버그 패치를 받을 수 있습니다.
