# Byeong Soo Kim - AI Attention PDF Reader 📖✨

> **귀찮은 논문 읽기를 쉽고 스마트하게!**  
> **Byeong Soo Kim**은 마우스 영역 드래그 인식, 실시간 AI 해설, 나의 질문 성향 학습, 그리고 컴퓨터 비전 지식 베이스가 결합된 초경량 브라우저 기반 논문 리더기입니다.

---

## 🚀 핵심 기능 (Features)

### 1. 🎯 마우스 영역 어텐션 포커스 (Attention Focus)
* 툴바의 **영역 어텐션 모드 (`crop` 아이콘)**를 활성화하면 마우스가 십자선(`crosshair`)으로 변경됩니다.
* 논문의 그림(Figure), 수식(Formula), 표(Table) 또는 복잡한 텍스트 블록을 마우스로 드래그하여 지정하면, 영역 내의 글자를 자동 추출하여 즉시 질문하거나 퀵 메뉴(`해설`, `요약`)로 다이렉트 분석을 실행할 수 있습니다.

### 2. 🖥️ 초고화질 Retina/High-DPI 렌더링
* 흐릿하고 깨지는 캔버스 출력을 근본적으로 해결하기 위해 **2.0배 고해상도 백킹 스케일(Backing Scale) 기법**을 적용했습니다.
* 4K 모니터나 맥북 레티나 디스플레이에서도 논문의 작은 글씨와 복잡한 다이어그램이 종이 인쇄물처럼 깨끗하게 표현됩니다.

### 3. 🎓 나의 연구 관심사 프로파일 학습 (Dynamic Research Profiler)
* 대화 내용을 지속적으로 학습하여 사용자가 주로 관심 있어 하는 연구 영역, 수학적 수식 증명 선호 여부, 코드 구현지향형 설명 선호 등의 **연구 성향**을 학습합니다.
* 매 질문 횟수 누적에 따라 실시간으로 프로파일 카드에 결과가 시각화되며, 학습된 프로파일 데이터가 Gemini 시스템 명령어(System Instructions)에 동적으로 반영되어 사용할수록 나에게 완벽하게 맞춤화된 해설을 제공합니다.

### 4. 🗺️ 컴퓨터 비전(CV) 지식 아틀라스 RAG 연동
* YOLO, Vision Transformer (ViT), CLIP, SAM, IoU, NeRF, ResNet, InfoNCE 등 컴퓨터 비전 분야의 주요 아키텍처 및 손실함수, 평가지표 데이터베이스가 내장되어 있습니다.
* 사용자가 질문하면 로컬 키워드 매칭을 통해 관련 사전 지식을 사이드바에 즉각 연동하고, Gemini가 이를 참고하여 보다 높은 전문성의 LLM Insight를 제공합니다.
* **용어 영문 보존**: 컴퓨터 비전 분야 고유대명사(*Bounding Box*, *Feature Map*, *Self-Attention* 등)는 번역하지 않고 영문 원본 표기 그대로 노출하여 전문 학술적 가독성을 지켰습니다.

### 5. 🧮 KaTeX 기반 실시간 수식(LaTeX) 시각화 & 대화 최적화
* 논문의 꽃인 복잡한 수식이 `$$` 또는 `$` 기호 채로 방치되는 불편함을 완벽히 해결했습니다. **KaTeX 수식 엔진**을 탑재하여 대화창에 나타나는 모든 수식을 논문 인쇄물처럼 미려한 학술 수식 폰트와 레이아웃으로 실시간 변환 렌더링해 줍니다.
* 하드코딩된 기계적 글자 수 차단을 걷어내고 **분석의 완결성을 보장**하도록 프롬프트를 개선했습니다. 핵심 요약은 깔끔하게 제공하되, 수식 유도나 알고리즘 설명 과정에서 문장이 중간에 잘려 미완성으로 끝나는 현상 없이 끝까지 완성도 높은 해설을 송출하여 깊이 있는 연속 질문이 가능합니다.

### 6. 🚨 자동 이중 재시도 및 로컬 영구 복원
* API 호출 과부하(`429`) 감지 시 **자동으로 3초 대기 후 2회 재시도**를 실행하여 대화가 끊기지 않도록 보호합니다.
* 모든 대화 데이터는 브라우저의 `localStorage`에 자동 보존되므로 새로고침을 하더라도 언제든지 **최근 대화 기록**에서 복구하여 이어 읽을 수 있습니다.

---

## 🛠️ 기술 스택 (Tech Stack)

* **Frontend**: HTML5, Vanilla CSS3 (Custom Glassmorphism), Vanilla JavaScript (ES6)
* **Libraries (CDN)**:
  * [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla PDF Rendering Engine)
  * [Marked.js](https://marked.js.org/) (Markdown Parser)
  * [KaTeX & Auto-Render](https://katex.org/) (Fast Math Equation Renderer)
  * [FontAwesome v6](https://fontawesome.com/) (Premium Icons)

---

## 💻 실행 방법 (How to Run)

본 프로그램은 서버 환경이나 설치가 전혀 필요 없는 **100% 클라이언트 사이드** 애플리케이션입니다.

1. 본 저장소의 코드를 다운로드 받거나 클론합니다.
   ```bash
   git clone https://github.com/qudtnkim/kbs-pdf-reader.git
   ```
2. 폴더 내의 **`index.html`** 파일을 웹 브라우저(Chrome, Whale, Edge 등)에 드래그하여 실행합니다.
3. 설정 창에 API Key가 기본 탑재되어 있으므로, 읽고 싶은 논문 PDF 파일을 끌어다 놓기만 하면 즉시 분석이 시작됩니다!

---

## ✉️ 문의 및 관리자 (Contact)
* **관리자 이메일**: [qudtnkim@gmail.com](mailto:qudtnkim@gmail.com)
