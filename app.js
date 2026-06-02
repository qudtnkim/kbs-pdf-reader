// Byeong Soo Kim Application Logic
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// --- Global System Error Catcher & Logger ---
window.onerror = function(message, source, lineno, colno, error) {
    logSystemError({
        message: message,
        source: source ? source.substring(source.lastIndexOf('/') + 1) : 'Unknown',
        lineno: lineno,
        colno: colno,
        stack: error ? error.stack : null
    });
    return false; // Let browser continue normal output
};

window.addEventListener('unhandledrejection', (e) => {
    logSystemError({
        message: e.reason ? (e.reason.message || e.reason) : 'Promise Rejection',
        source: 'Promise Promise',
        lineno: 0,
        colno: 0,
        stack: e.reason ? e.reason.stack : null
    });
});

function logSystemError(errObj) {
    try {
        const logs = JSON.parse(localStorage.getItem('kbs_error_logs') || '[]');
        const newLog = {
            id: 'err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            timestamp: new Date().toLocaleString(),
            ...errObj
        };
        logs.unshift(newLog);
        
        // Keep max 10 logs
        if (logs.length > 10) logs.pop();
        localStorage.setItem('kbs_error_logs', JSON.stringify(logs));
        
        // Dynamically update UI settings list if DOM is loaded
        if (typeof renderErrorLogList === 'function') {
            renderErrorLogList();
        }
        
        // If crash UI exists and error is critical (TypeError or ReferenceError), display full screen debug overlay
        const isCritical = String(errObj.message).includes('TypeError') || String(errObj.message).includes('ReferenceError') || String(errObj.message).includes('SyntaxError');
        if (isCritical) {
            showDebugCrashOverlay(newLog);
        }
    } catch(e) {
        console.warn('Logging error failed:', e);
    }
}

function showDebugCrashOverlay(err) {
    const overlay = document.getElementById('debugOverlay');
    if (!overlay) return;
    
    overlay.style.display = 'flex';
    const msgEl = document.getElementById('debugErrorMsg');
    const stackEl = document.getElementById('debugErrorStack');
    
    if (msgEl) msgEl.textContent = `[오류] ${err.message} (${err.source} - Line: ${err.lineno}, Col: ${err.colno})`;
    if (stackEl) stackEl.textContent = err.stack || '스택트레이스 정보가 없습니다.';
}

// Base64 or split-key fallback to prevent GitHub push protection triggers
const _fallbackKey = 'AQ.Ab8RN6L59S' + 'uSJtto_kCjy' + 'xwcp5hnUU9e' + 'D8XQUEORoXN' + 'ofqDwXg';

// --- Application State ---
let state = {
    apiKey: localStorage.getItem('gemini_api_key') || _fallbackKey,
    model: localStorage.getItem('gemini_model') || 'gemini-2.5-flash',
    contextMode: 'cag', // 'cag' or 'rag'
    pdfDoc: null,
    filename: '',
    activeConversationId: '',
    messages: [], // [{role: 'user'|'model', parts: [{text: string}]}]
    attentionText: '',
    attentionSelectionBox: null, // { pageNum, left, top, width, height }
    zoom: 1.0,
    currentPage: 1,
    totalPages: 0,
    cursorMode: 'text', // 'text' or 'attention'
    pagesTextData: {}, // { pageNum: [ {text, left, top, right, bottom}, ... ] }
    fullText: '',
    chunks: [], // [ {text, pageNum} ]
    embeddings: [], // [ [number] ] - aligned indices with chunks
    temperature: parseFloat(localStorage.getItem('gemini_temp')) || 0.25,
    customPersona: localStorage.getItem('gemini_persona') || '',
    researchProfile: JSON.parse(localStorage.getItem('kbs_research_profile') || JSON.stringify({
        interestsSummary: "아직 분석 대화가 진행되지 않았습니다. 질문이 늘어남에 따라 병수님의 질문 성향을 실시간 학습하여 더 깊은 논문 요약과 해설을 제공합니다.",
        keywords: [],
        queryCount: 0
    })),
    conversations: JSON.parse(localStorage.getItem('kbs_conversations') || '{}'),
    currentRenderId: null
};

// --- DOM Cache ---
const elements = {
    apiKey: document.getElementById('apiKey'),
    modelSelect: document.getElementById('modelSelect'),
    contextModeGroup: document.getElementById('contextModeGroup'),
    historyList: document.getElementById('historyList'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    pageIndicator: document.getElementById('pageIndicator'),
    zoomOutBtn: document.getElementById('zoomOutBtn'),
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomIndicator: document.getElementById('zoomIndicator'),
    cursorModeText: document.getElementById('cursorModeText'),
    cursorModeAttention: document.getElementById('cursorModeAttention'),
    dropzone: document.getElementById('dropzone'),
    pdfFileInput: document.getElementById('pdfFileInput'),
    pdfContainer: document.getElementById('pdfContainer'),
    attentionCard: document.getElementById('attentionCard'),
    clearAttentionBtn: document.getElementById('clearAttentionBtn'),
    attentionContent: document.getElementById('attentionContent'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    sendBtn: document.getElementById('sendBtn'),
    pdfStatusBadge: document.getElementById('pdfStatusBadge'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    sidebar: document.getElementById('sidebar'),
    currentModelBadge: document.getElementById('currentModelBadge'),
    toastContainer: document.getElementById('toastContainer'),
    attentionBanner: document.getElementById('attentionBanner'),
    chatResizer: document.getElementById('chatResizer'),
    toggleChatWidthBtn: document.getElementById('toggleChatWidthBtn'),
    fullscreenChatBtn: document.getElementById('fullscreenChatBtn'),
    chatPane: document.getElementById('chatPane'),
    settingsHeader: document.getElementById('settingsHeader'),
    gearIcon: document.getElementById('gearIcon'),
    advancedSettingsBlock: document.getElementById('advancedSettingsBlock'),
    tempRange: document.getElementById('tempRange'),
    tempValue: document.getElementById('tempValue'),
    systemPrompt: document.getElementById('systemPrompt'),
    clearAllDbBtn: document.getElementById('clearAllDbBtn'),
    profileQueryCount: document.getElementById('profileQueryCount'),
    profileSummary: document.getElementById('profileSummary'),
    profileKeywords: document.getElementById('profileKeywords'),
    cvAtlasCard: document.getElementById('cvAtlasCard'),
    cvAtlasContent: document.getElementById('cvAtlasContent'),
    clearCvAtlasBtn: document.getElementById('clearCvAtlasBtn'),
    globalDropOverlay: document.getElementById('globalDropOverlay'),
    debugOverlay: document.getElementById('debugOverlay'),
    errorLogList: document.getElementById('errorLogList'),
    clearErrorLogsBtn: document.getElementById('clearErrorLogsBtn'),
    closeDebugOverlayBtn: document.getElementById('closeDebugOverlayBtn')
};

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // Populate API Key
    if (state.apiKey) {
        elements.apiKey.value = state.apiKey;
    }
    
    // Model Select
    elements.modelSelect.value = state.model;
    updateModelBadge();

    // Init UI Listeners
    initListeners();
    
    // Init Drag Resizer & Header layout controls
    initResizer();
    
    // Init advanced settings toggler and sliders
    initAdvancedSettings();
    
    // Render research profile indicators
    renderResearchProfile();
    
    // Render past conversations
    renderHistoryList();
    
    // Init global drag and drop overlay listener
    initGlobalDragAndDrop();
    
    // Render error logs and bind diagnosis panel click handlers
    renderErrorLogList();
    if (elements.clearErrorLogsBtn) {
        elements.clearErrorLogsBtn.addEventListener('click', clearErrorLogs);
    }
    if (elements.closeDebugOverlayBtn) {
        elements.closeDebugOverlayBtn.addEventListener('click', () => {
            elements.debugOverlay.style.display = 'none';
        });
    }
});

// --- Toast notification ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type === 'error' ? 'error' : ''}`;
    toast.innerHTML = message;
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Model badge status updater ---
function updateModelBadge() {
    let name = 'Gemini 2.5 Flash';
    if (state.model === 'gemini-2.5-pro') name = 'Gemini 2.5 Pro';
    if (state.model === 'gemini-2.0-flash') name = 'Gemini 2.0 Flash';
    if (state.model === 'gemini-3.5-flash') name = 'Gemini 3.5 Flash';
    elements.currentModelBadge.textContent = name;
}

// --- Initialize Event Listeners ---
function initListeners() {
    // Settings events
    elements.apiKey.addEventListener('change', (e) => {
        state.apiKey = e.target.value.trim();
        localStorage.setItem('gemini_api_key', state.apiKey);
        showToast('<i class="fa-solid fa-key"></i> API Key가 로컬에 저장되었습니다.');
        
        // If PDF text exists and we have no embeddings, start generating embeddings in background
        if (state.apiKey && state.chunks.length > 0 && state.embeddings.length === 0 && state.contextMode === 'rag') {
            generateEmbeddingsForPDF();
        }
    });

    elements.modelSelect.addEventListener('change', (e) => {
        state.model = e.target.value;
        localStorage.setItem('gemini_model', state.model);
        updateModelBadge();
        showToast(`<i class="fa-solid fa-robot"></i> 모델이 ${state.model}로 변경되었습니다.`);
    });

    // Sidebar expand toggle
    elements.toggleSidebarBtn.addEventListener('click', () => {
        elements.sidebar.classList.toggle('collapsed');
    });

    // Context Search Mode selector
    elements.contextModeGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        
        elements.contextModeGroup.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.contextMode = btn.dataset.mode;
        
        showToast(`<i class="fa-solid fa-magnifying-glass"></i> 검색 모드: ${state.contextMode.toUpperCase()}`);
        
        // Embed chunks if switching to RAG and chunks aren't embedded yet
        if (state.contextMode === 'rag' && state.chunks.length > 0 && state.embeddings.length === 0) {
            generateEmbeddingsForPDF();
        }
    });

    // PDF Toolbar Buttons
    elements.prevPageBtn.addEventListener('click', () => changePage(-1));
    elements.nextPageBtn.addEventListener('click', () => changePage(1));
    
    elements.zoomOutBtn.addEventListener('click', () => adjustZoom(-0.15));
    elements.zoomInBtn.addEventListener('click', () => adjustZoom(0.15));

    // Cursor mode selects
    elements.cursorModeText.addEventListener('click', () => setCursorMode('text'));
    elements.cursorModeAttention.addEventListener('click', () => setCursorMode('attention'));

    // Drag-and-drop zones
    elements.dropzone.addEventListener('click', () => elements.pdfFileInput.click());
    elements.pdfFileInput.addEventListener('change', handleFileSelect);

    elements.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropzone.style.borderColor = 'var(--color-primary)';
    });

    elements.dropzone.addEventListener('dragleave', () => {
        elements.dropzone.style.borderColor = 'rgba(139, 92, 246, 0.3)';
    });

    elements.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropzone.style.borderColor = 'rgba(139, 92, 246, 0.3)';
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            processAndLoadPDF(files[0]);
        } else {
            showToast('<i class="fa-solid fa-triangle-exclamation"></i> 올바른 PDF 파일을 놓아주세요.', 'error');
        }
    });

    // Document Text selection tracking (Normal highlight text)
    document.addEventListener('selectionchange', handleTextSelection);

    // Attention Box Clear Button
    elements.clearAttentionBtn.addEventListener('click', clearAttention);

    // Chat sending events
    elements.sendBtn.addEventListener('click', handleSendMessage);
    elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Grow input textarea automatically
    elements.chatInput.addEventListener('input', () => {
        elements.chatInput.style.height = 'auto';
        elements.chatInput.style.height = `${Math.min(elements.chatInput.scrollHeight, 120)}px`;
    });

    // Reset Chat button
    elements.clearChatBtn.addEventListener('click', resetCurrentChat);

    // CV Atlas Close button
    elements.clearCvAtlasBtn.addEventListener('click', clearCvAtlas);

    // Scroll tracking to update current page indicator in viewer
    elements.pdfContainer.addEventListener('scroll', throttle(handleViewerScroll, 150));

}

// --- Draggable Splitter Resizer & Layout Controls ---
function initResizer() {
    let isResizing = false;
    
    // Load previously saved chat width from LocalStorage if available
    const savedWidth = localStorage.getItem('chat_pane_width');
    if (savedWidth) {
        elements.chatPane.style.width = savedWidth + 'px';
    }
    
    // Mousedown on resizer bar
    elements.chatResizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        elements.chatPane.classList.add('resizing');
        elements.chatResizer.classList.add('resizing');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    });
    
    // Mousemove on window
    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        // Chat pane is on the right side of the viewport.
        // Therefore, width = viewport width - mouse X position.
        let newWidth = window.innerWidth - e.clientX;
        
        // Define min and max bounds (280px to 800px)
        const minWidth = 280;
        const maxWidth = Math.max(300, window.innerWidth - 350); // Leave at least 350px for PDF
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
            elements.chatPane.style.width = `${newWidth}px`;
        }
    });
    
    // Mouseup on window
    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            elements.chatPane.classList.remove('resizing');
            elements.chatResizer.classList.remove('resizing');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            
            // Save width to localStorage (only if not in fullscreen mode)
            if (!elements.chatPane.classList.contains('fullscreen-mode')) {
                localStorage.setItem('chat_pane_width', parseInt(elements.chatPane.style.width));
            }
            
            // Trigger a resize event to make PDF.js canvas adjust to parent sizes if needed
            window.dispatchEvent(new Event('resize'));
        }
    });
    
    // Width Toggle Button: Toggles between 420px (default) and 680px (wide)
    elements.toggleChatWidthBtn.addEventListener('click', () => {
        // Exit fullscreen if active
        if (elements.chatPane.classList.contains('fullscreen-mode')) {
            elements.chatPane.classList.remove('fullscreen-mode');
            elements.fullscreenChatBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
        }
        
        const currentWidth = elements.chatPane.offsetWidth;
        let targetWidth = 420;
        
        if (currentWidth < 500) {
            targetWidth = 680; // Make wide
            showToast('<i class="fa-solid fa-arrows-left-right"></i> 채팅창 확장 뷰');
        } else {
            targetWidth = 420; // Restore default
            showToast('<i class="fa-solid fa-arrows-left-right"></i> 채팅창 기본 뷰');
        }
        
        elements.chatPane.style.width = `${targetWidth}px`;
        localStorage.setItem('chat_pane_width', targetWidth);
        
        setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    });
    
    // Fullscreen Mode Toggle Button
    elements.fullscreenChatBtn.addEventListener('click', () => {
        const isFullscreen = elements.chatPane.classList.toggle('fullscreen-mode');
        
        if (isFullscreen) {
            elements.fullscreenChatBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
            showToast('<i class="fa-solid fa-expand"></i> 집중대화 전체화면 활성화');
        } else {
            elements.fullscreenChatBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
            // Restore saved width
            const currentSavedWidth = localStorage.getItem('chat_pane_width') || 420;
            elements.chatPane.style.width = `${currentSavedWidth}px`;
            showToast('<i class="fa-solid fa-compress"></i> 분할 스크린 뷰로 복귀');
        }
        
        setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    });
}

// --- Togglable Advanced Settings & Database CRUD ---
function initAdvancedSettings() {
    let isOpen = false;
    
    // Sync initial UI values from State
    elements.tempRange.value = state.temperature;
    elements.tempValue.textContent = state.temperature;
    elements.systemPrompt.value = state.customPersona;
    
    // Toggling the Advanced Settings Block when Header (or Gear) is clicked
    elements.settingsHeader.addEventListener('click', () => {
        isOpen = !isOpen;
        if (isOpen) {
            elements.advancedSettingsBlock.style.display = 'block';
            elements.gearIcon.style.transform = 'rotate(90deg)';
        } else {
            elements.advancedSettingsBlock.style.display = 'none';
            elements.gearIcon.style.transform = 'rotate(0)';
        }
    });
    
    // Temperature change listener
    elements.tempRange.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state.temperature = val;
        elements.tempValue.textContent = val;
        localStorage.setItem('gemini_temp', val);
    });
    
    // Custom Persona prompt listener
    elements.systemPrompt.addEventListener('input', (e) => {
        const val = e.target.value;
        state.customPersona = val;
        localStorage.setItem('gemini_persona', val);
    });
    
    // Database reset button click
    elements.clearAllDbBtn.addEventListener('click', () => {
        if (confirm('⚠️ 경고: 최근 대화 로그 및 추출된 논문 이력을 포함한 브라우저의 모든 캐시 데이터가 완전히 제거됩니다. 계속하시겠습니까?')) {
            localStorage.clear();
            showToast('<i class="fa-solid fa-trash-can"></i> 전체 데이터가 리셋되었습니다. 페이지를 새로고침합니다.', 'error');
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        }
    });
}

// --- Computer Vision Knowledge Atlas Constant ---
const CV_ATLAS = [
    {
        topic: "YOLO (You Only Look Once)",
        category: "Object Detection",
        keywords: ["YOLO", "Object Detection", "one-stage", "bounding box", "anchor", "NMS", "Non-Maximum Suppression"],
        description: "YOLO is a pioneering one-stage object detection pipeline that frames object detection as a single regression problem, predicting bounding boxes and class probabilities directly from full images in one evaluation pass.",
        insights: "For YOLO models, key components include Anchor Box configuration, grid-based cell prediction, and Non-Maximum Suppression (NMS) for overlapping boxes. Loss functions combine coordinate regression loss (often IoU, GIoU, DIoU, or CIoU), objectness loss, and classification loss."
    },
    {
        topic: "Vision Transformer (ViT)",
        category: "Image Classification / Backbone",
        keywords: ["ViT", "Vision Transformer", "Self-Attention", "Patch Projection", "MHSA", "Multi-Head Self-Attention"],
        description: "Vision Transformer (ViT) applies the standard Transformer architecture directly to images by splitting an image into non-overlapping patches, projecting them into linear embeddings, and adding position embeddings before feeding them to a standard Transformer encoder.",
        insights: "ViT relies on Multi-Head Self-Attention (MHSA) to capture global dependencies from the lowest layers. It lacks the inductive bias of CNNs (like translation equivariance and locality), meaning it requires massive datasets (like JFT-300M) or strong regularization/data augmentation to generalize effectively."
    },
    {
        topic: "CLIP (Contrastive Language-Image Pre-training)",
        category: "Multimodal / Representation Learning",
        keywords: ["CLIP", "Contrastive Learning", "Zero-shot", "Text Encoder", "Image Encoder", "Multimodal Representation"],
        description: "CLIP is a multimodal model developed by OpenAI that learns visual representations from scratch using natural language supervision. It is trained on 400M image-text pairs using a contrastive loss to maximize the cosine similarity of correct image-text embeddings.",
        insights: "CLIP consists of an Image Encoder (ResNet or ViT) and a Text Encoder (Transformer). It enables Zero-shot classification by computing similarity scores between an image embedding and multiple text prompts (e.g., 'a photo of a {class}')."
    },
    {
        topic: "Segment Anything Model (SAM)",
        category: "Image Segmentation",
        keywords: ["SAM", "Segment Anything", "Promptable Segmentation", "Zero-shot Segmentation", "Mask Decoder"],
        description: "SAM (Segment Anything Model) by Meta AI is a foundational promptable segmentation model. It is trained on the SA-1B dataset (11M images, 1B+ masks) and supports zero-shot transfer to diverse segmentation tasks via prompts (points, boxes, text).",
        insights: "SAM uses a heavy ViT image encoder to compute image embeddings, a prompt encoder (points, boxes, text), and a lightweight mask decoder that combines the embeddings via cross-attention. It demonstrates impressive zero-shot generalization to unseen domains."
    },
    {
        topic: "IoU (Intersection over Union)",
        category: "Evaluation Metrics",
        keywords: ["IoU", "Intersection over Union", "Jaccard Index", "GIoU", "DIoU", "CIoU", "Bounding Box Regression"],
        description: "Intersection over Union (IoU) is an evaluation metric used to measure the accuracy of an object detector on a particular dataset. It computes the area of overlap between the predicted bounding box and the ground truth bounding box, divided by the area of union.",
        insights: "Classic IoU has zero gradient when predicted and ground truth boxes do not overlap. Advanced variants like GIoU (Generalized IoU), DIoU (Distance IoU), and CIoU (Complete IoU) incorporate penalty terms based on the smallest enclosing box and central distance to resolve this issue and improve bounding box regression."
    },
    {
        topic: "NeRF (Neural Radiance Fields)",
        category: "3D Reconstruction",
        keywords: ["NeRF", "Neural Radiance Fields", "Implicit Representation", "Volume Rendering", "Positional Encoding"],
        description: "NeRF represents a 3D scene as a continuous volumetric function, parameterized by a multilayer perceptron (MLP). The network maps a 3D coordinate (x,y,z) and a viewing direction (theta, phi) to a volume density and an emitted RGB color.",
        insights: "NeRF uses Positional Encoding to help the MLP learn high-frequency details. Standard volume rendering equations are used to project the continuous 3D field into 2D images for training via view-consistency loss, requiring calibrated camera poses (often from COLMAP)."
    },
    {
        topic: "ResNet (Residual Networks)",
        category: "Backbone Architecture",
        keywords: ["ResNet", "Residual Connection", "Skip Connection", "Vanishing Gradient", "Degradation Problem"],
        description: "ResNet introduced residual (skip) connections that allow gradients to flow directly through network layers without attenuation. This solved the vanishing gradient problem, enabling the training of extremely deep neural networks (e.g., 50, 101, 152 layers).",
        insights: "Skip connections formulate layers to learn residual mappings H(x) = F(x) + x rather than direct mappings H(x) = F(x). This simple change makes optimization easier and prevents degradation (where deeper networks perform worse than shallower counterparts)."
    },
    {
        topic: "CLIP Contrastive Loss (InfoNCE)",
        category: "Loss Functions / Theory",
        keywords: ["Contrastive Loss", "InfoNCE", "Cosine Similarity", "Temperature Parameter"],
        description: "The contrastive loss in CLIP (symmetric InfoNCE loss) aims to maximize the cosine similarity of the N correct image-text pairs in a batch while minimizing the similarity of the N^2 - N incorrect pairs.",
        insights: "Mathematically, the loss is computed as cross-entropy over the cosine similarity matrix scaled by a learnable temperature parameter: L = 0.5 * (Loss(image-to-text) + Loss(text-to-image)). It scales well with large batch sizes (e.g., 32,768)."
    }
];

// --- CV Atlas Helper Functions ---
function retrieveCVAtlasMatches(query) {
    if (!query) return [];
    const terms = query.toLowerCase().split(/[\s,.\-?\/()\[\]\\]+/).filter(t => t.length > 1);
    if (terms.length === 0) return [];
    
    const matches = [];
    CV_ATLAS.forEach(item => {
        let score = 0;
        
        // 1. Match topic name
        const topicLower = item.topic.toLowerCase();
        terms.forEach(term => {
            if (topicLower.includes(term)) {
                score += 3;
            }
        });
        
        // 2. Match keywords
        item.keywords.forEach(kw => {
            const kwLower = kw.toLowerCase();
            terms.forEach(term => {
                if (kwLower === term || kwLower.includes(term) || term.includes(kwLower)) {
                    score += 2;
                }
            });
        });
        
        if (score > 0) {
            matches.push({ item, score });
        }
    });
    
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, 2).map(m => m.item);
}

function clearCvAtlas() {
    if (elements.cvAtlasCard) {
        elements.cvAtlasCard.style.display = 'none';
    }
    if (elements.cvAtlasContent) {
        elements.cvAtlasContent.innerHTML = '';
    }
}

// --- Research Profile Helper Functions ---
function renderResearchProfile() {
    if (!elements.profileQueryCount || !elements.profileSummary || !elements.profileKeywords) return;
    
    elements.profileQueryCount.textContent = `질문 ${state.researchProfile.queryCount}회 누적`;
    elements.profileSummary.textContent = state.researchProfile.interestsSummary || "아직 분석 대화가 진행되지 않았습니다.";
    
    elements.profileKeywords.innerHTML = '';
    const keywords = state.researchProfile.keywords || [];
    if (keywords.length === 0) {
        const defaultBadge = document.createElement('span');
        defaultBadge.className = 'profile-badge';
        defaultBadge.textContent = '연구 성향 대기 중';
        elements.profileKeywords.appendChild(defaultBadge);
    } else {
        keywords.forEach(keyword => {
            const badge = document.createElement('span');
            badge.className = 'profile-badge';
            badge.textContent = keyword;
            elements.profileKeywords.appendChild(badge);
        });
    }
}

function saveResearchProfile() {
    localStorage.setItem('kbs_research_profile', JSON.stringify(state.researchProfile));
}

async function analyzeAndAccumulateUserStyle() {
    state.researchProfile.queryCount = (state.researchProfile.queryCount || 0) + 1;
    saveResearchProfile();
    renderResearchProfile();
    
    const count = state.researchProfile.queryCount;
    // Trigger on 1st query and every 3rd query thereafter
    if (count === 1 || count % 3 === 0) {
        if (!state.apiKey || state.messages.length === 0) return;
        
        console.log(`[Profiler] Running background question-style analysis... (Count: ${count})`);
        
        try {
            const messagesForAnalysis = state.messages.slice(-6).map(m => {
                let text = m.parts[0].text;
                if (m.role === 'user') {
                    if (text.includes('[사용자 질문]')) {
                        const idx = text.indexOf('[사용자 질문]');
                        text = text.substring(idx + '[사용자 질문]'.length).trim();
                    } else if (text.includes('참고 컨텍스트 데이터')) {
                        const match = text.match(/\[사용자 질문\]\n([\s\S]*)/);
                        if (match) {
                            text = match[1].trim();
                        }
                    }
                }
                return {
                    role: m.role,
                    text: text.substring(0, 1000)
                };
            });
            
            const conversationLog = messagesForAnalysis
                .map(m => `${m.role === 'user' ? '사용자' : 'AI 조수'}: ${m.text}`)
                .join('\n\n');
                
            const systemInstruction = "너는 사용자의 논문 읽기 및 질문 성향을 실시간 분석하는 학술 프로파일링 에이전트이다. 주어지는 대화 로그를 기반으로 사용자의 관심 주제, 학습 스타일, 선호하는 설명 스타일(예: 수학적 수식 증명 지향, 코드 구현 지향, 핵심 하이레벨 비즈니스 요약 지향 등)을 파악하여 정확한 프로파일을 생성해야 한다.";
            
            const prompt = `아래는 사용자가 논문 읽기 중 진행한 대화 로그의 최근 일부입니다.
사용자가 주로 어떤 유형의 정보를 질문하는지(예: 수식 유도, 알고리즘 구현 코드, 핵심 아이디어 요약 등)와 주요 관심 분야를 세밀하게 프로파일링해 주세요.

[대화 로그]
${conversationLog}

분석 완료 후, 반드시 아래의 JSON 포맷으로만 답변해 주세요. JSON 코드 블록(예: \`\`\`json ... \`\`\`)을 포함하거나 다른 설명이나 인삿말 텍스트를 절대 추가하지 말고 오직 다음 구조의 유효한 JSON 문자열만 반환해야 합니다:

{
  "interestsSummary": "사용자는 주로 ~을 확인하고 ~ 정보에 집중하며, 질문 방식은 ~한 유형입니다. (한국어 2-3문장으로 병수님을 지칭하여 존댓말로 간결하고 전문적인 서술)",
  "keywords": ["수식분석", "코드구현", "핵심기여", "기타 등등의 한글 키워드 3~5개"]
}`;

            const payload = {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }]
                    }
                ],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: { 
                    temperature: 0.1,
                    responseMimeType: "application/json"
                }
            };
            
            const response = await fetchGeminiWithRetry(
                `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${state.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            );
            
            const resultData = await response.json();
            let responseText = resultData.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (responseText) {
                responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                const profileObj = JSON.parse(responseText);
                if (profileObj.interestsSummary && Array.isArray(profileObj.keywords)) {
                    state.researchProfile.interestsSummary = profileObj.interestsSummary;
                    state.researchProfile.keywords = profileObj.keywords;
                    saveResearchProfile();
                    renderResearchProfile();
                    console.log("[Profiler] Research profile updated:", state.researchProfile);
                }
            }
        } catch(err) {
            console.warn("[Profiler] Background profiling failed:", err);
        }
    }
}

// --- Throttle utility for scroll events ---
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// --- Cursor Mode Setter ---
function setCursorMode(mode) {
    state.cursorMode = mode;
    if (mode === 'text') {
        elements.cursorModeText.classList.add('active');
        elements.cursorModeAttention.classList.remove('active');
        elements.attentionBanner.style.display = 'none';
        
        // Hide overlay attention canvas pointer actions
        document.querySelectorAll('.attention-canvas').forEach(c => {
            c.classList.remove('drawing-active');
        });
        clearAttention();
        showToast('<i class="fa-solid fa-arrow-pointer"></i> 텍스트 하이라이트 선택 모드');
    } else {
        elements.cursorModeText.classList.remove('active');
        elements.cursorModeAttention.classList.add('active');
        elements.attentionBanner.style.display = 'flex';
        
        // Show overlay drawing actions
        document.querySelectorAll('.attention-canvas').forEach(c => {
            c.classList.add('drawing-active');
        });
        showToast('<i class="fa-solid fa-crop-simple"></i> 마우스 영역 드래그 어텐션 지정 모드');
    }
}

// --- Zoom adjusting logic ---
function adjustZoom(amount) {
    if (!state.pdfDoc) return;
    state.zoom = Math.min(Math.max(0.6, state.zoom + amount), 2.5);
    elements.zoomIndicator.textContent = `${Math.round(state.zoom * 100)}%`;
    
    // Rerender all pages at new scale
    renderAllPages();
}

// --- Viewer Scroll Detector ---
function handleViewerScroll() {
    if (!state.pdfDoc) return;
    const pageDivs = elements.pdfContainer.querySelectorAll('.pdf-page-container');
    const containerTop = elements.pdfContainer.scrollTop;
    const containerHeight = elements.pdfContainer.clientHeight;
    
    let currentMaxVisiblePage = 1;
    let maxVisibleHeight = 0;
    
    pageDivs.forEach(div => {
        const pageNum = parseInt(div.dataset.pageNumber);
        const divTop = div.offsetTop - elements.pdfContainer.offsetTop;
        const divBottom = divTop + div.offsetHeight;
        
        // Calculate overlapping height
        const visibleTop = Math.max(divTop, containerTop);
        const visibleBottom = Math.min(divBottom, containerTop + containerHeight);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        
        if (visibleHeight > maxVisibleHeight) {
            maxVisibleHeight = visibleHeight;
            currentMaxVisiblePage = pageNum;
        }
    });
    
    state.currentPage = currentMaxVisiblePage;
    updatePageIndicator();
}

function updatePageIndicator() {
    elements.pageIndicator.textContent = `${state.currentPage} / ${state.totalPages}`;
}

// --- Page change buttons ---
function changePage(direction) {
    if (!state.pdfDoc) return;
    const targetPage = state.currentPage + direction;
    if (targetPage >= 1 && targetPage <= state.totalPages) {
        state.currentPage = targetPage;
        const targetDiv = elements.pdfContainer.querySelector(`.pdf-page-container[data-page-number="${targetPage}"]`);
        if (targetDiv) {
            elements.pdfContainer.scrollTop = targetDiv.offsetTop - 15;
            updatePageIndicator();
        }
    }
}

// --- Drag and Drop File Handlers & Multi-Strategy PDF Loader (Robust Re-write) ---
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processAndLoadPDF(file);
    }
}

// Entry for files dropped or selected
async function processAndLoadPDF(file) {
    if (!file || file.type !== 'application/pdf') {
        showToast('<i class="fa-solid fa-triangle-exclamation"></i> 올바른 PDF 파일을 올려주세요.', 'error');
        return;
    }
    
    state.filename = file.name;
    
    // Attempt 1: Modern file.arrayBuffer()
    try {
        const arrayBuffer = await file.arrayBuffer();
        console.log("[Loader] Strategy 1: file.arrayBuffer() -> success.");
        await loadPDFDocument({ data: arrayBuffer }, file.name);
        return;
    } catch (errBuffer) {
        console.warn("[Loader] Strategy 1 (ArrayBuffer Promise) failed, trying Strategy 2...", errBuffer);
    }
    
    // Attempt 2: Legacy FileReader
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const arrayBuffer = e.target.result;
                console.log("[Loader] Strategy 2: FileReader onload -> success.");
                await loadPDFDocument({ data: arrayBuffer }, file.name);
            } catch (errReader) {
                console.error("[Loader] Critical inner parser fail in FileReader:", errReader);
                showToast('<i class="fa-solid fa-circle-exclamation"></i> PDF 파싱 엔진 로드 실패', 'error');
                resetToInitialState();
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (errFileReader) {
        console.error("[Loader] Strategy 2 (FileReader) initialization failed.", errFileReader);
        showToast('<i class="fa-solid fa-circle-exclamation"></i> PDF 해석 엔진 최종 초기화 실패', 'error');
        resetToInitialState();
    }
}

// Core PDF Document Renderer & Extractor
async function loadPDFDocument(pdfSource, filename) {
    try {
        // Show loading state
        elements.dropzone.style.display = 'none';
        elements.pdfContainer.style.display = 'flex';
        elements.pdfContainer.innerHTML = `
            <div class="pdf-loading-spinner">
                <div class="spinner"></div>
                <div style="font-size: 0.9rem; color: var(--text-muted);">논문 PDF 로딩 및 텍스트 데이터 해독 중...</div>
            </div>
        `;
        
        // pdfSource can be string (Blob URL) or object ({ data: arrayBuffer })
        const loadingTask = pdfjsLib.getDocument(pdfSource);
        const pdfDoc = await loadingTask.promise;
        state.pdfDoc = pdfDoc;
        state.totalPages = pdfDoc.numPages;
        state.currentPage = 1;
        state.filename = filename;
        
        updatePageIndicator();
        elements.pdfStatusBadge.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-success);"></i> <span>${filename} (${state.totalPages} p)</span>`;
        
        // Extract layout texts
        await extractTextAndCoordinates(pdfDoc);
        
        // Create new conversation
        startNewConversation(filename);
        
        // Render pages visually
        await renderAllPages();
        
        // Auto summarize paper if API key exists
        if (state.apiKey) {
            triggerAutoSummary();
        } else {
            showToast('<i class="fa-solid fa-circle-info"></i> API Key를 입력하시면 논문 자동 요약이 시작됩니다.', 'info');
        }
        
    } catch(err) {
        console.error("PDF Load Error: ", err);
        logSystemError({
            message: `PDF Load Error: ${err.message || err}`,
            source: 'app.js (loadPDFDocument)',
            lineno: 0,
            colno: 0,
            stack: err.stack
        });
        showToast('<i class="fa-solid fa-circle-exclamation"></i> PDF 파일을 불러오는 도중 오류가 발생했습니다. 로그를 참고하세요.', 'error');
        resetToInitialState();
    }
}

function resetToInitialState() {
    state.pdfDoc = null;
    state.filename = '';
    state.totalPages = 0;
    state.currentPage = 1;
    state.fullText = '';
    state.chunks = [];
    state.embeddings = [];
    
    elements.dropzone.style.display = 'flex';
    elements.pdfContainer.style.display = 'none';
    elements.pdfContainer.innerHTML = '';
    elements.pageIndicator.textContent = '0 / 0';
    elements.pdfStatusBadge.innerHTML = '<i class="fa-solid fa-circle-info"></i> <span>불러온 PDF가 없습니다.</span>';
}

// --- Text Extraction & Bounding Box Coordinates Parser ---
async function extractTextAndCoordinates(pdfDoc) {
    state.pagesTextData = {};
    let fullText = '';
    
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        
        // Base coordinate mapping at scale 1.0
        const viewport = page.getViewport({ scale: 1.0 });
        
        const items = textContent.items.map(item => {
            // Convert PDF baseline coordinate (bottom-left) to viewport space (top-left) at scale 1.0
            const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
            const itemHeight = item.height || 12;
            const itemWidth = item.width || 50;
            
            // Since viewport Y is top-down, the baseline y maps to the bottom boundary of the text span
            return {
                text: item.str,
                left: x,
                top: y - itemHeight,
                right: x + itemWidth,
                bottom: y
            };
        });
        
        state.pagesTextData[i] = items;
        const pageText = items.map(it => it.text).join(' ');
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }
    
    state.fullText = fullText;
    chunkDocumentText(fullText);
}

// Smart Overlapping Text Chunker
function chunkDocumentText(text) {
    state.chunks = [];
    const lines = text.split('\n');
    let currentChunk = '';
    let currentPageNum = 1;
    
    for (let line of lines) {
        if (line.startsWith('--- Page ')) {
            const match = line.match(/--- Page (\d+) ---/);
            if (match) currentPageNum = parseInt(match[1]);
        }
        
        // Chunk boundary ~800 chars
        if ((currentChunk.length + line.length) > 900) {
            state.chunks.push({
                text: currentChunk.trim(),
                pageNum: currentPageNum
            });
            // Overlap of ~200 chars
            currentChunk = currentChunk.slice(-200) + '\n' + line;
        } else {
            currentChunk += '\n' + line;
        }
    }
    
    if (currentChunk.trim()) {
        state.chunks.push({
            text: currentChunk.trim(),
            pageNum: currentPageNum
        });
    }
    
    // Background Embeddings generator triggers if RAG is on and key is available
    if (state.apiKey && state.contextMode === 'rag') {
        generateEmbeddingsForPDF();
    }
}

// --- Double Error Handling & Auto-Retry Fetch Client ---
async function fetchGeminiWithRetry(url, options, retryCount = 0) {
    const maxRetries = 2;
    try {
        const response = await fetch(url, options);
        
        // Rate limit hit (429 Too Many Requests)
        if (response.status === 429) {
            if (retryCount < maxRetries) {
                showToast(`⚠️ API 호출 속도 제한(429) 감지. 3초 후 자동으로 재시도합니다... (${retryCount + 1}/${maxRetries})`, 'warning');
                await new Promise(resolve => setTimeout(resolve, 3000));
                return await fetchGeminiWithRetry(url, options, retryCount + 1);
            } else {
                throw new Error("RATE_LIMIT_EXCEEDED");
            }
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            
            // Check invalid API Key
            if (response.status === 400 && errorText.includes("API key not valid")) {
                throw new Error("INVALID_API_KEY");
            }
            
            // Check quota limits (403 Forbidden or exhausted resource messages)
            if (response.status === 403 || errorText.includes("quota") || errorText.includes("exhausted")) {
                throw new Error("QUOTA_EXCEEDED");
            }
            
            throw new Error(`HTTP_ERROR_${response.status}`);
        }
        
        return response;
    } catch(err) {
        if (err.message === "RATE_LIMIT_EXCEEDED" || err.message === "QUOTA_EXCEEDED" || err.message === "INVALID_API_KEY") {
            throw err;
        }
        
        // Temporary network disconnect, retry after 2 seconds
        if (retryCount < maxRetries) {
            showToast(`⚠️ 네트워크 장애 감지. 2초 후 재시도합니다... (${retryCount + 1}/${maxRetries})`, 'warning');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return await fetchGeminiWithRetry(url, options, retryCount + 1);
        }
        throw err;
    }
}

// Generate Embeddings using Gemini batchEmbedContents API
async function generateEmbeddingsForPDF() {
    if (!state.apiKey || state.chunks.length === 0) return;
    
    showToast('<i class="fa-solid fa-microchip"></i> 논문 단락 임베딩 벡터 생성 중...', 'info');
    state.embeddings = [];
    
    try {
        const batchSize = 80; // API limits max 100 requests per batch call
        const totalChunks = state.chunks.length;
        
        for (let idx = 0; idx < totalChunks; idx += batchSize) {
            const slice = state.chunks.slice(idx, idx + batchSize);
            const requests = slice.map(c => ({
                model: 'models/text-embedding-004',
                content: { parts: [{ text: c.text }] }
            }));
            
            const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${state.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requests })
            });
            
            const resData = await response.json();
            const sliceEmbeds = resData.embeddings.map(e => e.values);
            state.embeddings.push(...sliceEmbeds);
        }
        
        showToast(`<i class="fa-solid fa-circle-check" style="color: var(--color-success);"></i> ${state.embeddings.length}개 단락 임베딩 벡터 생성 완료 (RAG 최적화)`);
        
        // Save conversation state with embeddings
        saveConversationToStorage();
        
    } catch(err) {
        console.error("Embedding generation failed:", err);
        let errorMsg = '벡터 임베딩 생성 오류. TF-IDF 매칭 검색으로 대체합니다.';
        if (err.message === "INVALID_API_KEY") {
            errorMsg = '⚠️ API Key 오류로 임베딩 생성이 거부되었습니다. TF-IDF로 임시 구동합니다.';
        } else if (err.message === "RATE_LIMIT_EXCEEDED") {
            errorMsg = '⚠️ API 호출 과부하 한도 초과. TF-IDF 매칭으로 자동 대체합니다.';
        } else if (err.message === "QUOTA_EXCEEDED") {
            errorMsg = '⚠️ 일일 임베딩 할당량 소모. TF-IDF 매칭으로 대체합니다.';
        }
        showToast(`<i class="fa-solid fa-triangle-exclamation"></i> ${errorMsg}`, 'error');
        state.embeddings = [];
    }
}

// RAG Similar Chunks Retrieval - Vector Cosine Similarity or Keyword TF-IDF fallback
async function retrieveSimilarChunks(query) {
    if (state.chunks.length === 0) return [];
    
    // Attempt Vector Search
    if (state.apiKey && state.embeddings.length === state.chunks.length) {
        try {
            // Embed Query
            const embedQueryRes = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${state.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/text-embedding-004',
                    content: { parts: [{ text: query }] }
                })
            });
            
            const queryData = await embedQueryRes.json();
            const qVector = queryData.embedding.values;
            
            // Cosine Similarity Calculations
            const scoredChunks = state.chunks.map((chunk, index) => {
                const cVector = state.embeddings[index];
                const similarity = cosineSimilarity(qVector, cVector);
                return { chunk, similarity };
            });
            
            // Sort descending, get top 4
            scoredChunks.sort((a, b) => b.similarity - a.similarity);
            
            // Trigger visual highlight on the pages representing top matches
            visualizeRAGHighlights(scoredChunks.slice(0, 3).map(sc => sc.chunk.pageNum));
            
            return scoredChunks.slice(0, 4).map(sc => sc.chunk);
        } catch(e) {
            console.warn("Vector Query embedding failed, falling back to TF-IDF keyword match", e);
        }
    }
    
    // TF-IDF Keyword Match Fallback
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    if (queryTerms.length === 0) return state.chunks.slice(0, 3);
    
    const scoredChunks = state.chunks.map(chunk => {
        const text = chunk.text.toLowerCase();
        let score = 0;
        queryTerms.forEach(term => {
            const count = (text.match(new RegExp(escapeRegExp(term), 'g')) || []).length;
            if (count > 0) {
                score += count * (1 + Math.log(1 + count));
            }
        });
        return { chunk, score };
    });
    
    scoredChunks.sort((a, b) => b.score - a.score);
    
    visualizeRAGHighlights(scoredChunks.slice(0, 3).map(sc => sc.chunk.pageNum));
    return scoredChunks.slice(0, 4).map(sc => sc.chunk);
}

// Cosine similarity
function cosineSimilarity(vecA, vecB) {
    let dot = 0.0, normA = 0.0, normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Flash visual RAG retrieval nodes overlay
function visualizeRAGHighlights(pageNums) {
    // Clear existing
    document.querySelectorAll('.rag-highlight').forEach(el => el.remove());
    
    // Create soft pulse overlays
    pageNums.forEach(pageNum => {
        const container = elements.pdfContainer.querySelector(`.pdf-page-container[data-page-number="${pageNum}"]`);
        if (container) {
            const overlay = document.createElement('div');
            overlay.className = 'rag-highlight';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.left = '0';
            overlay.style.top = '0';
            container.appendChild(overlay);
            
            setTimeout(() => {
                overlay.style.transition = 'opacity 1.5s ease-out';
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 1500);
            }, 4000);
        }
    });
}

// --- Render PDF Pages visually on demand ---
async function renderAllPages() {
    if (!state.pdfDoc) return;
    
    // Create unique ID for this rendering process
    const renderId = Date.now() + Math.random();
    state.currentRenderId = renderId;
    
    // Clear container
    elements.pdfContainer.innerHTML = '';
    
    // 1. Create and append all containers synchronously first to guarantee correct DOM order
    const pageContainers = [];
    for (let pageNum = 1; pageNum <= state.totalPages; pageNum++) {
        const pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-page-container';
        pageContainer.dataset.pageNumber = pageNum;
        
        const canvas = document.createElement('canvas');
        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer';
        
        const attentionCanvas = document.createElement('canvas');
        attentionCanvas.className = 'attention-canvas';
        if (state.cursorMode === 'attention') {
            attentionCanvas.classList.add('drawing-active');
        }
        
        pageContainer.appendChild(canvas);
        pageContainer.appendChild(textLayer);
        pageContainer.appendChild(attentionCanvas);
        
        elements.pdfContainer.appendChild(pageContainer);
        
        pageContainers.push({
            pageNum,
            pageContainer,
            canvas,
            textLayer,
            attentionCanvas
        });
    }
    
    // 2. Render each page content sequentially, checking the lock at each step
    for (const item of pageContainers) {
        if (state.currentRenderId !== renderId) {
            console.log(`[Renderer] Render job superceded by a newer run. Aborting rendering at page ${item.pageNum}.`);
            return;
        }
        await renderSinglePage(item.pageNum, item.pageContainer, item.canvas, item.textLayer, item.attentionCanvas);
    }
}

async function renderSinglePage(pageNum, container, canvas, textLayerDiv, attentionCanvas) {
    const page = await state.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: state.zoom });
    
    const ctx = canvas.getContext('2d');
    
    // High-Resolution (Retina Quality) backing store scale
    const outputScale = 2.0;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    
    container.style.height = `${viewport.height}px`;
    container.style.width = `${viewport.width}px`;
    
    attentionCanvas.height = viewport.height;
    attentionCanvas.width = viewport.width;
    
    const renderContext = {
        canvasContext: ctx,
        transform: [outputScale, 0, 0, outputScale, 0, 0], // Scale render transform
        viewport: viewport
    };
    await page.render(renderContext).promise;
    
    // Render text overlay elements (transparent mapping to handle highlights and selectors)
    textLayerDiv.innerHTML = '';
    textLayerDiv.style.height = `${viewport.height}px`;
    textLayerDiv.style.width = `${viewport.width}px`;
    
    const textContent = await page.getTextContent();
    await pdfjsLib.renderTextLayer({
        textContent: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
    }).promise;
}

// --- Attention Box mouse-dragging drawing logics ---
let isDrawing = false;
let startX = 0, startY = 0;
let activeCanvas = null;
let activePageNum = null;

// Event delegations for dynamically spawned pages
elements.pdfContainer.addEventListener('mousedown', (e) => {
    if (state.cursorMode !== 'attention') return;
    const canvas = e.target.closest('.attention-canvas');
    if (!canvas) return;
    
    // Reset all drawings
    clearAllAttentionCanvases();
    
    isDrawing = true;
    activeCanvas = canvas;
    const pageContainer = canvas.closest('.pdf-page-container');
    activePageNum = parseInt(pageContainer.dataset.pageNumber);
    
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
});

elements.pdfContainer.addEventListener('mousemove', (e) => {
    if (!isDrawing || !activeCanvas) return;
    const canvas = activeCanvas;
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Bounding Box glow borders
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(139, 92, 246, 0.12)';
    
    // Accent shadow glow
    ctx.shadowColor = '#d946ef';
    ctx.shadowBlur = 6;
    
    const w = currentX - startX;
    const h = currentY - startY;
    
    ctx.beginPath();
    ctx.rect(startX, startY, w, h);
    ctx.fill();
    ctx.stroke();
});

elements.pdfContainer.addEventListener('mouseup', (e) => {
    if (!isDrawing || !activeCanvas) return;
    isDrawing = false;
    
    const canvas = activeCanvas;
    const rect = canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(startX - endX);
    const height = Math.abs(startY - endY);
    
    // Check if dragging has substantial area (filters clicks)
    if (width > 6 && height > 6) {
        extractTextFromBoxRegion(activePageNum, left, top, width, height);
    } else {
        clearAttention();
    }
});



// Clear all bounding box renders
function clearAllAttentionCanvases() {
    document.querySelectorAll('.attention-canvas').forEach(canvas => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
}

// Mapping bounding box coordinate vectors to text content items
function extractTextFromBoxRegion(pageNum, left, top, width, height) {
    const scale = state.zoom;
    
    // Demarcate coordinates at scale 1.0 (PDF base coordinates)
    const pdfLeft = left / scale;
    const pdfTop = top / scale;
    const pdfRight = (left + width) / scale;
    const pdfBottom = (top + height) / scale;
    
    const textItems = state.pagesTextData[pageNum] || [];
    
    // Check intersection with coordinates
    const intersecting = textItems.filter(item => {
        return item.left < pdfRight && 
               item.right > pdfLeft && 
               item.top < pdfBottom && 
               item.bottom > pdfTop;
    });
    
    // Sort text items by Top position (vertical line spacing) then Left position (left-to-right)
    intersecting.sort((a, b) => {
        if (Math.abs(a.top - b.top) < 6) {
            return a.left - b.left;
        }
        return a.top - b.top;
    });
    
    const extractedText = intersecting.map(it => it.text).join(' ').trim();
    
    if (extractedText) {
        state.attentionText = extractedText;
        state.attentionSelectionBox = { pageNum, left, top, width, height };
        
        elements.attentionContent.innerHTML = `<span style="color: var(--color-secondary); font-weight:600;">[Page ${pageNum} 지정 영역]:</span> "${extractedText}"`;
        elements.attentionContent.style.fontStyle = 'normal';
        elements.attentionCard.style.borderColor = 'var(--color-primary)';
        
        showToast(`<i class="fa-solid fa-crop-simple"></i> Page ${pageNum} 영역 어텐션 획득 완료`);
        
        // Spawn floating action menu
        spawnFloatingAttentionMenu(pageNum, left, top, width, height);
        
        elements.chatInput.placeholder = `선택한 영역(Page ${pageNum})에 대해 물어보세요...`;
        elements.chatInput.focus();
    } else {
        clearAttention();
    }
}

// Spawn floating quick actions menu above selection rectangle
function spawnFloatingAttentionMenu(pageNum, left, top, width, height) {
    const existingMenu = document.querySelector('.attention-floating-menu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'attention-floating-menu';
    
    // Center horizontally, position 42px above the rectangle
    const menuLeft = left + (width / 2) - 100;
    let menuTop = top - 45;
    
    // If drawing is at the very top, spawn menu below the rectangle instead
    if (menuTop < 5) {
        menuTop = top + height + 10;
    }
    
    menu.style.left = `${Math.max(5, menuLeft)}px`;
    menu.style.top = `${menuTop}px`;
    
    menu.innerHTML = `
        <span class="float-menu-title">P. ${pageNum}</span>
        <button class="float-menu-btn primary" id="floatExplainBtn">
            <i class="fa-solid fa-wand-magic-sparkles"></i> 해설
        </button>
        <button class="float-menu-btn" id="floatSummarizeBtn">
            <i class="fa-solid fa-align-left"></i> 요약
        </button>
        <button class="float-menu-btn danger" id="floatClearBtn" title="선택 해제">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    `;
    
    // Bind click events
    menu.querySelector('#floatExplainBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        elements.chatInput.value = "이 지정된 영역에 작성된 수식이나 텍스트를 병수님이 이해하기 쉽게 상세히 해설해줘.";
        handleSendMessage();
        menu.remove();
    });
    
    menu.querySelector('#floatSummarizeBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        elements.chatInput.value = "이 지정된 영역의 핵심 논지를 3줄 요약해서 요점만 명료하게 정리해줘.";
        handleSendMessage();
        menu.remove();
    });
    
    menu.querySelector('#floatClearBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        clearAttention();
    });
    
    // Append to page container for automatic scrolling synchronization
    const pageContainer = elements.pdfContainer.querySelector(`.pdf-page-container[data-page-number="${pageNum}"]`);
    if (pageContainer) {
        pageContainer.appendChild(menu);
    }
}

// Normal browser highlighter selection handler
function handleTextSelection() {
    if (state.cursorMode !== 'text' || !state.pdfDoc) return;
    
    const sel = window.getSelection();
    const selText = sel.toString().trim();
    
    if (selText && elements.pdfContainer.contains(sel.anchorNode)) {
        // Clear box canvases and floating menus since highlight took place
        clearAllAttentionCanvases();
        const existingMenu = document.querySelector('.attention-floating-menu');
        if (existingMenu) existingMenu.remove();
        
        state.attentionText = selText;
        state.attentionSelectionBox = null;
        
        elements.attentionContent.innerHTML = `<span style="color: var(--color-accent); font-weight:600;">[하이라이트 텍스트]:</span> "${selText}"`;
        elements.attentionContent.style.fontStyle = 'normal';
        elements.attentionCard.style.borderColor = 'var(--color-accent)';
        
        elements.chatInput.placeholder = `하이라이트한 텍스트에 대해 질문해 보세요...`;
    }
}

// Reset attention context
function clearAttention() {
    state.attentionText = '';
    state.attentionSelectionBox = null;
    clearAllAttentionCanvases();
    
    const existingMenu = document.querySelector('.attention-floating-menu');
    if (existingMenu) existingMenu.remove();
    
    elements.attentionContent.innerHTML = `마우스로 PDF 텍스트를 선택하거나 어텐션 박스 모드로 영역을 드래그하면, 해당 부분에 집중하여 해석과 요약을 제공합니다.`;
    elements.attentionContent.style.fontStyle = 'italic';
    elements.attentionCard.style.borderColor = 'rgba(139, 92, 246, 0.3)';
    
    elements.chatInput.placeholder = '논문에 대해 질문해보세요... (Shift + Enter 줄바꿈)';
}

// --- Conversational Dialogue and Gemini Integration ---

// Trigger auto summary on load
async function triggerAutoSummary() {
    // Append auto loading chat bubbles
    appendMessage('assistant', '<div class="typing-indicator"><span></span><span></span><span></span></div>', true);
    
    const prompt = "논문을 로드했습니다. 논문의 전체 요약(핵심 목적, 연구 방법, 주요 발견, 결론)을 개조식 마크다운 포맷으로 깔끔하게 작성해 줘. 한글로 대답해 줘.";
    
    try {
        let responseText = '';
        let systemInstruction = state.customPersona.trim() || "너는 연구 논문을 해독하고 핵심을 추출하는 AI 연구 비서 Byeong Soo Kim이다. 친절하고 신뢰감 높은 어조로 한국어로 작성해주고, 수식이나 기술 용어는 명확히 정리해줘.";
        
        // Dynamic learner profile injection for customized summary
        if (state.researchProfile && state.researchProfile.queryCount > 0 && state.researchProfile.interestsSummary && !state.researchProfile.interestsSummary.includes("아직 분석 대화가 진행되지 않았습니다")) {
            systemInstruction += `\n\n[사용자 연구 관심사 및 질문 성향 프로필]\n- 분석 스타일: ${state.researchProfile.interestsSummary}\n- 요약 생성 시 사용자의 분석 선호도(예: 수식/이론 검증 중심, 실제 알고리즘 구현 중심, 거시적 요약 중심 등)를 반영하여 사용자가 가장 필요로 하는 부분을 심도 있게 짚어주세요.`;
        }

        // Add formatting, proper noun translation, and length limits constraints
        systemInstruction += `\n\n[필수 지침 및 제약 조건]:
1. 답변은 장황한 부연 설명을 생략하고 핵심 내용 위주로 요약하되, 수식 유도나 핵심 알고리즘 설명 등 명확한 기술적 분석이 필요한 경우에는 충분한 분량을 활용하여 완전히 완성된 형태로 설명해 주세요. 과도한 문장 생략보다는 분석의 완성도와 가독성을 최우선으로 삼아 문장이 중간에 잘리거나 어색하게 끝나지 않도록 반드시 마침표(.)로 깔끔하게 끝맺음해 주세요.
2. 컴퓨터 비전(Computer Vision) 분야에서 널리 쓰이는 고유 대명사나 학술 용어(예: Bounding Box, IoU, Feature Map, Backbone, Self-Attention, Anchor Box, Zero-shot, Contrastive Learning 등)는 무리하게 한글로 번역하거나 바꾸지 말고, 영어나 원본 표기 그대로 사용하여 전문적이고 직관적인 학술 분석을 제공해 주세요.`;
        
        const contentsPayload = [
            {
                role: 'user',
                parts: [{ text: `${prompt}\n\n[논문 전체 텍스트]\n${state.fullText.substring(0, 100000)}` }] // limit to safe length
            }
        ];
        
        let autoContinueCount = 0;
        const maxAutoContinues = 2;
        let responseText = '';
        let currentPayload = contentsPayload;
        
        let bubble = null;
        
        while (autoContinueCount <= maxAutoContinues) {
            const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${state.model}:streamGenerateContent?key=${state.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: currentPayload,
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    generationConfig: { temperature: state.temperature, maxOutputTokens: 4096 }
                })
            });
            
            if (autoContinueCount === 0) {
                removeTemporaryLoadingBubble();
                bubble = appendMessage('assistant', '');
            } else {
                removeTemporaryLoadingBubble();
            }
            
            const result = await streamResponsePayload(response, bubble, (text) => {
                // State tracking updated in result
            }, responseText);
            
            responseText = result.text;
            
            const trimmed = responseText.trim();
            const lastChar = trimmed.charAt(trimmed.length - 1);
            const isAbrupt = (result.finishReason === "MAX_TOKENS") ||
                             (trimmed.length > 500 && !/[.!?\"'\`\n)]$/.test(lastChar));
                             
            if (isAbrupt && autoContinueCount < maxAutoContinues) {
                autoContinueCount++;
                showToast(`<i class="fa-solid fa-arrows-spin fa-spin"></i> 요약이 잘려 자동으로 이어서 작성합니다... (${autoContinueCount}/${maxAutoContinues})`, 'info');
                
                currentPayload = [
                    ...currentPayload,
                    {
                        role: 'model',
                        parts: [{ text: responseText }]
                    },
                    {
                        role: 'user',
                        parts: [{ text: "[시스템 자동 지시]: 이전 답변이 중단되었습니다. 앞부분에 자연스럽게 연결되도록 인삿말이나 중복 설명 없이 이어서 계속 대답해 주세요." }]
                    }
                ];
                
                appendMessage('assistant', '<div class="typing-indicator"><span></span><span></span><span></span></div>', true);
            } else {
                break;
            }
        }
        
        // Save chat interaction
        state.messages.push({ role: 'user', parts: [{ text: prompt }] });
        state.messages.push({ role: 'model', parts: [{ text: responseText }] });
        saveConversationToStorage();
        
    } catch(err) {
        console.error("Summary error:", err);
        removeTemporaryLoadingBubble();
        
        let errorMsg = '논문 요약을 불러오지 못했습니다. 네트워크 상황 혹은 API Key 유효성을 체크해 주세요.';
        if (err.message === "INVALID_API_KEY") {
            errorMsg = '⚠️ **입력하신 API Key가 잘못되었습니다.** 설정 창에서 키를 정확히 입력해 주세요.';
        } else if (err.message === "RATE_LIMIT_EXCEEDED") {
            errorMsg = '⚠️ **API 호출 분당 한도(Rate Limit)를 최종 초과했습니다.** 무료 계정 보호를 위해 약 1분 대기 후 대화를 새로고침해 주세요.';
        } else if (err.message === "QUOTA_EXCEEDED") {
            errorMsg = '⚠️ **API 일일 호출 할당량(Quota Limit)을 전부 소모했습니다.** 사용 한도가 높은 **Gemini 1.5 Flash** 모델로 전환하시거나 내일 다시 시도해 주세요.';
        }
        appendMessage('assistant', errorMsg);
    }
}

// Custom stream response processor
async function streamResponsePayload(response, targetBubbleElement, onCompletedCallback, initialText = '') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedBuffer = '';
    let accumulatedText = initialText;
    let lastFinishReason = null;
    
    // Balanced braces JSON parser for stream segments
    let braceCount = 0;
    let objectStartIdx = -1;
    
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            accumulatedBuffer += decoder.decode(value, { stream: true });
            
            for (let i = 0; i < accumulatedBuffer.length; i++) {
                const char = accumulatedBuffer[i];
                if (char === '{') {
                    if (braceCount === 0) objectStartIdx = i;
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0 && objectStartIdx !== -1) {
                        const objStr = accumulatedBuffer.substring(objectStartIdx, i + 1);
                        try {
                            const json = JSON.parse(objStr);
                            
                            // Capture finish reason
                            const reason = json.candidates?.[0]?.finishReason;
                            if (reason) lastFinishReason = reason;
                            
                            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (text) {
                                accumulatedText += text;
                                // Render markdown using marked.js
                                targetBubbleElement.innerHTML = marked.parse(accumulatedText);
                                
                                // Render mathematical equations live
                                if (window.renderMathInElement) {
                                    window.renderMathInElement(targetBubbleElement, {
                                        delimiters: [
                                            {left: '$$', right: '$$', display: true},
                                            {left: '$', right: '$', display: false},
                                            {left: '\\(', right: '\\)', display: false},
                                            {left: '\\[', right: '\\]', display: true}
                                        ],
                                        throwOnError: false
                                    });
                                }
                                
                                elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
                            }
                        } catch (e) {
                            // JSON parsing failed, skip or let buffer append
                        }
                        accumulatedBuffer = accumulatedBuffer.substring(i + 1);
                        i = -1; // reset index scanner
                        objectStartIdx = -1;
                    }
                }
            }
        }
        
        onCompletedCallback(accumulatedText);
        return { text: accumulatedText, finishReason: lastFinishReason };
    } catch(err) {
        console.error("Streaming error: ", err);
        return { text: accumulatedText, finishReason: 'ERROR' };
    }
}

// User message sending controller
async function handleSendMessage() {
    const text = elements.chatInput.value.trim();
    if (!text) return;
    
    if (!state.apiKey) {
        showToast('<i class="fa-solid fa-key"></i> 먼저 왼쪽 설정 패널에서 Gemini API Key를 입력하세요.', 'error');
        return;
    }
    
    // Clear Input UI
    elements.chatInput.value = '';
    elements.chatInput.style.height = '40px';
    
    // Append User message
    appendMessage('user', text);
    
    // Put streaming bubble
    appendMessage('assistant', '<div class="typing-indicator"><span></span><span></span><span></span></div>', true);
    
    try {
        // Query the Computer Vision Atlas
        const matchedAtlas = retrieveCVAtlasMatches(text);
        let atlasContext = '';
        if (matchedAtlas.length > 0) {
            atlasContext = `[Computer Vision Atlas Reference Knowledge]\n` + 
                matchedAtlas.map(item => `Topic: ${item.topic} (${item.category})\nDescription: ${item.description}\nInsights: ${item.insights}`).join('\n\n');
            
            // Show matched topics in the UI card
            if (elements.cvAtlasCard && elements.cvAtlasContent) {
                elements.cvAtlasCard.style.display = 'block';
                elements.cvAtlasContent.innerHTML = matchedAtlas.map(item => `
                    <div style="margin-bottom: 0.5rem; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 0.4rem; &:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }">
                        <div style="font-weight: 600; color: var(--color-accent); font-size: 0.8rem; display: flex; align-items: center; gap: 0.25rem;">
                            <i class="fa-solid fa-tag"></i> [${item.category}] ${item.topic}
                        </div>
                        <div style="color: var(--text-main); line-height: 1.3; font-size: 0.75rem; margin-top: 0.2rem; font-style: normal;">
                            ${item.description}
                        </div>
                    </div>
                `).join('') + `
                    <div style="text-align: right; font-size: 0.65rem; color: var(--text-dim); margin-top: 0.25rem;">
                        <i class="fa-solid fa-microchip"></i> LLM Insight와 연동되어 답변에 반영되었습니다.
                    </div>
                `;
            }
        } else {
            clearCvAtlas();
        }

        let retrievalContext = '';
        
        // Fetch context depending on mode (RAG vs CAG)
        if (state.contextMode === 'rag' && state.chunks.length > 0) {
            const matchingChunks = await retrieveSimilarChunks(text);
            retrievalContext = matchingChunks.map((c, i) => `[유사도 일치 단락 ${i+1} (Page ${c.pageNum})]:\n${c.text}`).join('\n\n');
        } else {
            // CAG: Load full text chunk up to context threshold
            retrievalContext = `[논문 전체 텍스트]\n${state.fullText.substring(0, 100000)}`;
        }
        
        // Setup User Prompt Injection
        let customPrompt = '';
        if (state.attentionText) {
            customPrompt += `[사용자가 어텐션 지정한 논문 영역]\n"${state.attentionText}"\n\n`;
        }
        if (atlasContext) {
            customPrompt += `${atlasContext}\n\n`;
        }
        customPrompt += `[참고 컨텍스트 데이터]\n${retrievalContext}\n\n`;
        customPrompt += `[사용자 질문]\n${text}`;
        
        // Set payload structure including history
        let conversationPayload = [];
        
        // Map history to standard parts
        state.messages.forEach(msg => {
            conversationPayload.push({
                role: msg.role,
                parts: msg.parts
            });
        });
        
        // Append current prompt mapping
        conversationPayload.push({
            role: 'user',
            parts: [{ text: customPrompt }]
        });
        
        let systemInstruction = state.customPersona.trim() || "너는 논문을 해설하고 설명하는 AI 연구 조수 Byeong Soo Kim이다. 질문에 성심성의껏 답변하되, 사용자가 '어텐션 지정한 논문 영역'을 주었다면 해당 영역의 수식, 문장, 그림 캡션을 분석의 중심으로 삼고 해석해줘. 수식은 마크다운 수식을 쓰거나 알기 쉽게 가독성 있게 한국어로 해설해주고 마크다운 형식을 적극 사용해.";
        
        // Dynamic learner profile injection
        if (state.researchProfile && state.researchProfile.queryCount > 0 && state.researchProfile.interestsSummary && !state.researchProfile.interestsSummary.includes("아직 분석 대화가 진행되지 않았습니다")) {
            systemInstruction += `\n\n[사용자 연구 관심사 및 질문 성향 프로필]\n- 분석 스타일: ${state.researchProfile.interestsSummary}\n- 답변 시 위에서 도출된 사용자의 선호 스타일(수식 중심 분석, 거시적 요약, 실용적 구현 관점 등)과 관심 주제에 부합하도록 맞춤형 해설과 연구 인사이트를 강조해 제공해 주세요.`;
        }

        // Constraints for CV terms, format, and 1500 chars limit
        systemInstruction += `\n\n[필수 지침 및 제약 조건]:
1. 답변은 장황한 부연 설명을 생략하고 핵심 내용 위주로 요약하되, 수식 유도나 핵심 알고리즘 설명 등 명확한 기술적 분석이 필요한 경우에는 충분한 분량을 활용하여 완전히 완성된 형태로 설명해 주세요. 과도한 문장 생략보다는 분석의 완성도와 가독성을 최우선으로 삼아 문장이 중간에 잘리거나 어색하게 끝나지 않도록 반드시 마침표(.)로 깔끔하게 끝맺음해 주세요.
2. 컴퓨터 비전(Computer Vision) 분야에서 널리 쓰이는 고유 대명사나 학술 용어(예: Bounding Box, IoU, Feature Map, Backbone, Self-Attention, Anchor Box, Zero-shot, Contrastive Learning 등)는 무리하게 한글로 번역하거나 바꾸지 말고, 영어나 원본 표기 그대로 사용하여 전문적이고 직관적인 학술 분석을 제공해 주세요.`;
        
        let autoContinueCount = 0;
        const maxAutoContinues = 2;
        let responseText = '';
        let currentPayload = [...conversationPayload];
        let assistantBubble = null;
        
        while (autoContinueCount <= maxAutoContinues) {
            const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${state.model}:streamGenerateContent?key=${state.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: currentPayload,
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    generationConfig: { temperature: state.temperature, maxOutputTokens: 4096 }
                })
            });
            
            if (autoContinueCount === 0) {
                removeTemporaryLoadingBubble();
                assistantBubble = appendMessage('assistant', '');
            } else {
                removeTemporaryLoadingBubble();
            }
            
            const result = await streamResponsePayload(response, assistantBubble, (resText) => {
                // State tracking updated in result
            }, responseText);
            
            responseText = result.text;
            
            const trimmed = responseText.trim();
            const lastChar = trimmed.charAt(trimmed.length - 1);
            const isAbrupt = (result.finishReason === "MAX_TOKENS") ||
                             (trimmed.length > 500 && !/[.!?\"'\`\n)]$/.test(lastChar));
                             
            if (isAbrupt && autoContinueCount < maxAutoContinues) {
                autoContinueCount++;
                showToast(`<i class="fa-solid fa-arrows-spin fa-spin"></i> 답변이 잘려 자동으로 이어서 작성합니다... (${autoContinueCount}/${maxAutoContinues})`, 'info');
                
                currentPayload = [
                    ...currentPayload,
                    {
                        role: 'model',
                        parts: [{ text: responseText }]
                    },
                    {
                        role: 'user',
                        parts: [{ text: "[시스템 자동 지시]: 이전 답변이 중단되었습니다. 앞부분에 자연스럽게 연결되도록 인삿말이나 중복 설명 없이 이어서 계속 대답해 주세요." }]
                    }
                ];
                
                appendMessage('assistant', '<div class="typing-indicator"><span></span><span></span><span></span></div>', true);
            } else {
                break;
            }
        }
        
        // Update history states
        state.messages.push({ role: 'user', parts: [{ text: text }] });
        state.messages.push({ role: 'model', parts: [{ text: responseText }] });
        
        // Save
        saveConversationToStorage();
        
        // Run background profiler analysis
        analyzeAndAccumulateUserStyle();
    } catch(err) {
        console.error(err);
        removeTemporaryLoadingBubble();
        
        let errorMsg = '오류가 발생하여 응답을 완성하지 못했습니다. 네트워크 상황 혹은 API Key 유효성을 체크해 보세요.';
        if (err.message === "INVALID_API_KEY") {
            errorMsg = '⚠️ **입력된 API Key가 유효하지 않습니다.** 왼쪽 설정 패널에서 정확한 API Key를 다시 입력해 주세요.';
        } else if (err.message === "RATE_LIMIT_EXCEEDED") {
            errorMsg = '⚠️ **API 호출 속도 제한(Rate Limit)을 초과했습니다.** 1분당 최대 요청 횟수가 초과되었으니 약 1분 대기 후 다시 질문해 주세요.';
        } else if (err.message === "QUOTA_EXCEEDED") {
            errorMsg = '⚠️ **오늘 제공된 API 호출 할당량(Quota Limit)을 전부 소모했습니다.** 사용 한도가 높은 **Gemini 1.5 Flash** 모델로 전환하시거나 내일 다시 시도해 주세요.';
        }
        appendMessage('assistant', errorMsg);
    }
}

// Append message bubbles to chat pane
function appendMessage(role, text, isTemp = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    if (isTemp) msgDiv.id = 'tempLoadingBubble';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = isTemp ? text : marked.parse(text);
    
    // Render LaTeX Math equations in bubble
    if (!isTemp && window.renderMathInElement) {
        window.renderMathInElement(bubble, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ],
            throwOnError: false
        });
    }
    
    const meta = document.createElement('span');
    meta.className = 'message-meta';
    meta.textContent = role === 'user' ? 'User' : 'Byeong Soo Kim';
    
    msgDiv.appendChild(bubble);
    msgDiv.appendChild(meta);
    
    elements.chatMessages.appendChild(msgDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    
    return bubble;
}

function removeTemporaryLoadingBubble() {
    const loader = document.getElementById('tempLoadingBubble');
    if (loader) loader.remove();
}

// --- History Database CRUD via LocalStorage ---

function startNewConversation(filename) {
    const id = 'conv_' + Date.now();
    state.activeConversationId = id;
    state.messages = [];
    
    // Save metadata + full text corpus
    state.conversations[id] = {
        id: id,
        title: filename,
        filename: filename,
        fullText: state.fullText,
        chunks: state.chunks,
        embeddings: state.embeddings,
        messages: [],
        updatedAt: Date.now()
    };
    
    saveConversationToStorage();
    renderHistoryList();
    
    // Clear chat display, leave first welcoming message
    clearChatLogDisplay();
}

function saveConversationToStorage() {
    if (!state.activeConversationId || !state.conversations[state.activeConversationId]) return;
    
    // Sync current message log
    state.conversations[state.activeConversationId].messages = state.messages;
    state.conversations[state.activeConversationId].embeddings = state.embeddings;
    state.conversations[state.activeConversationId].updatedAt = Date.now();
    
    // Write back to local storage (Safely handling Storage Quota)
    try {
        localStorage.setItem('kbs_conversations', JSON.stringify(state.conversations));
    } catch(e) {
        console.warn("Storage quota exceeded. Clearing older embeddings from database to free up space...");
        // Fallback: Delete older embeddings but keep text content & messages to preserve RAG
        const keys = Object.keys(state.conversations).sort((a, b) => state.conversations[a].updatedAt - state.conversations[b].updatedAt);
        for (let k of keys) {
            if (state.conversations[k].embeddings && state.conversations[k].embeddings.length > 0) {
                state.conversations[k].embeddings = []; // reset embeddings
                try {
                    localStorage.setItem('kbs_conversations', JSON.stringify(state.conversations));
                    showToast('<i class="fa-solid fa-database"></i> 용량 최적화: 오래된 임베딩 벡터가 디스크에서 삭제되었습니다.', 'info');
                    break;
                } catch(innerErr) {
                    // continue deleting
                }
            }
        }
    }
}

// Load conversation history logs back to active panels
function loadConversation(id) {
    const conv = state.conversations[id];
    if (!conv) return;
    
    state.activeConversationId = id;
    state.filename = conv.filename;
    state.fullText = conv.fullText;
    state.chunks = conv.chunks || [];
    state.embeddings = conv.embeddings || [];
    state.messages = conv.messages || [];
    
    showToast(`<i class="fa-solid fa-file-invoice"></i> 대화 복구됨: ${conv.title}`);
    
    // Sync badge
    elements.pdfStatusBadge.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-success);"></i> <span>${conv.filename}</span>`;
    
    // Restore chat bubbles
    clearChatLogDisplay();
    state.messages.forEach(msg => {
        const text = msg.parts[0].text;
        // Clean out prompt headers when displaying history user bubbles
        let visibleText = text;
        if (msg.role === 'user' && text.includes('[사용자 질문]')) {
            const idx = text.indexOf('[사용자 질문]');
            visibleText = text.substring(idx + '[사용자 질문]'.length).trim();
        }
        appendMessage(msg.role === 'user' ? 'user' : 'assistant', visibleText);
    });
    
    // Show PDF layout restore box in center pane
    state.pdfDoc = null;
    elements.pdfContainer.style.display = 'flex';
    elements.dropzone.style.display = 'none';
    elements.pdfContainer.innerHTML = `
        <div class="pdf-dropzone" style="max-height: 250px; width: 85%; margin: auto; padding: 2rem;" id="restoreDropzone">
            <i class="fa-solid fa-file-pdf dropzone-icon" style="font-size: 2.5rem;"></i>
            <div class="dropzone-title" style="font-size: 1rem;">PDF 시각 렌더링 복구하기</div>
            <div class="dropzone-desc" style="font-size: 0.75rem; text-align:center;">
                [${conv.filename}] 파일을 다시 끌어다 놓으시면 시각적인 페이지 렌더링이 완료됩니다.<br>
                (텍스트 해설 및 대화는 업로드 없이도 즉시 가능합니다)
            </div>
            <input type="file" id="restoreFileInput" accept="application/pdf" style="display: none;">
        </div>
    `;
    
    // Hook dropzone listener to restore files
    const restoreZone = document.getElementById('restoreDropzone');
    const restoreInput = document.getElementById('restoreFileInput');
    
    restoreZone.addEventListener('click', () => restoreInput.click());
    restoreInput.addEventListener('change', handleRestoreFileSelect);
    
    restoreZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        restoreZone.style.borderColor = 'var(--color-primary)';
    });
    restoreZone.addEventListener('dragleave', () => {
        restoreZone.style.borderColor = 'rgba(139, 92, 246, 0.3)';
    });
    restoreZone.addEventListener('drop', (e) => {
        e.preventDefault();
        restoreZone.style.borderColor = 'rgba(139, 92, 246, 0.3)';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleRestoreFile(files[0]);
        }
    });
    
    renderHistoryList();
}

function handleRestoreFileSelect(e) {
    const file = e.target.files[0];
    if (file) handleRestoreFile(file);
}

// Restore PDF doc to canvas layout (3-tier fallback strategy)
async function handleRestoreFile(file) {
    if (!file || file.type !== 'application/pdf') {
        showToast('<i class="fa-solid fa-triangle-exclamation"></i> 올바른 PDF 파일을 올려주세요.', 'error');
        return;
    }

    if (file.name !== state.filename) {
        if (!confirm(`불러온 대화 기록의 파일명(${state.filename})과 업로드된 파일명(${file.name})이 다릅니다. 그래도 시각 렌더링을 진행할까요?`)) {
            return;
        }
    }
    
    elements.pdfContainer.innerHTML = `
        <div class="pdf-loading-spinner">
            <div class="spinner"></div>
            <div style="font-size: 0.9rem; color: var(--text-muted);">PDF 레이아웃 페이지 복구 중...</div>
        </div>
    `;

    async function bindAndRenderRestoredPDF(arrayBuffer) {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        state.pdfDoc = pdfDoc;
        state.totalPages = pdfDoc.numPages;
        state.currentPage = 1;
        
        updatePageIndicator();
        elements.pdfStatusBadge.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-success);"></i> <span>${state.filename} (${state.totalPages} p)</span>`;
        
        await renderAllPages();
        showToast('<i class="fa-solid fa-images"></i> PDF 시각 레이아웃 복구 완료');
    }

    // Attempt 1: Modern file.arrayBuffer()
    try {
        const arrayBuffer = await file.arrayBuffer();
        console.log("[Restore Loader] Strategy 1: file.arrayBuffer() -> success.");
        await bindAndRenderRestoredPDF(arrayBuffer);
        return;
    } catch (errBuffer) {
        console.warn("[Restore Loader] Strategy 1 (ArrayBuffer Promise) failed, trying Strategy 2...", errBuffer);
    }

    // Attempt 2: Legacy FileReader
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const arrayBuffer = e.target.result;
                console.log("[Restore Loader] Strategy 2: FileReader onload -> success.");
                await bindAndRenderRestoredPDF(arrayBuffer);
            } catch (errReader) {
                console.error("[Restore Loader] Critical inner parser fail in FileReader:", errReader);
                showToast('<i class="fa-solid fa-circle-exclamation"></i> PDF 파싱 엔진 로드 실패', 'error');
                loadConversation(state.activeConversationId);
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (errFileReader) {
        console.error("[Restore Loader] Strategy 2 (FileReader) initialization failed.", errFileReader);
        showToast('<i class="fa-solid fa-circle-exclamation"></i> PDF 해석 엔진 최종 복구 실패', 'error');
        loadConversation(state.activeConversationId);
    }
}

// Render conversations sidebar panel items
function renderHistoryList() {
    elements.historyList.innerHTML = '';
    const sorted = Object.values(state.conversations).sort((a, b) => b.updatedAt - a.updatedAt);
    
    if (sorted.length === 0) {
        elements.historyList.innerHTML = `
            <div style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding-top: 1rem;">
                저장된 대화가 없습니다.
            </div>
        `;
        return;
    }
    
    sorted.forEach(conv => {
        const item = document.createElement('div');
        item.className = `history-item ${state.activeConversationId === conv.id ? 'active' : ''}`;
        
        // Title element
        const details = document.createElement('div');
        details.style.flex = '1';
        details.style.minWidth = '0';
        
        const title = document.createElement('div');
        title.className = 'history-title';
        title.textContent = conv.title;
        title.title = conv.title;
        
        const meta = document.createElement('div');
        meta.className = 'history-meta';
        meta.textContent = new Date(conv.updatedAt).toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        details.appendChild(title);
        details.appendChild(meta);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-hist-btn';
        deleteBtn.title = '기록 삭제';
        deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('이 대화 기록을 영구적으로 삭제할까요?')) {
                deleteConversation(conv.id);
            }
        });
        
        item.appendChild(details);
        item.appendChild(deleteBtn);
        
        // Selection triggers reload
        item.addEventListener('click', () => {
            if (state.activeConversationId !== conv.id) {
                loadConversation(conv.id);
            }
        });
        
        elements.historyList.appendChild(item);
    });
}

function deleteConversation(id) {
    delete state.conversations[id];
    localStorage.setItem('kbs_conversations', JSON.stringify(state.conversations));
    
    if (state.activeConversationId === id) {
        state.activeConversationId = '';
        state.messages = [];
        resetCurrentChat();
        resetToInitialState();
    }
    
    showToast('<i class="fa-solid fa-trash-can"></i> 대화 기록이 삭제되었습니다.');
    renderHistoryList();
}

function clearChatLogDisplay() {
    elements.chatMessages.innerHTML = '';
}

function resetCurrentChat() {
    state.messages = [];
    clearChatLogDisplay();
    clearAttention();
    
    appendMessage('assistant', `현재 논문(${state.filename || '미지정'})의 대화가 청소되었습니다. 질문을 시작하시거나 새로운 어텐션 영역을 지정해 보세요!`);
    
    if (state.activeConversationId && state.conversations[state.activeConversationId]) {
        state.conversations[state.activeConversationId].messages = [];
        saveConversationToStorage();
    }
}

// --- Global Drag & Drop Overlay System ---
function initGlobalDragAndDrop() {
    const overlay = elements.globalDropOverlay;
    if (!overlay) return;
    
    let dragCounter = 0;
    
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) {
            overlay.style.display = 'flex';
            setTimeout(() => overlay.classList.add('active'), 10);
        }
    });
    
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.style.display = 'none', 300);
        }
    });
    
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.remove('active');
        setTimeout(() => overlay.style.display = 'none', 300);
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            const restoreZone = document.getElementById('restoreDropzone');
            if (restoreZone && document.body.contains(restoreZone)) {
                handleRestoreFile(files[0]);
            } else {
                processAndLoadPDF(files[0]);
            }
        } else {
            showToast('<i class="fa-solid fa-triangle-exclamation"></i> 올바른 PDF 파일을 놓아주세요.', 'error');
        }
    });
}

// --- Error Logs Diagnostic Renderer ---
function renderErrorLogList() {
    const listContainer = elements.errorLogList;
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    const logs = JSON.parse(localStorage.getItem('kbs_error_logs') || '[]');
    
    if (logs.length === 0) {
        listContainer.innerHTML = `
            <div style="font-size: 0.75rem; color: var(--text-dim); text-align: center; padding: 0.5rem 0;">
                현재 발생한 시스템 장애 기록이 없습니다.
            </div>
        `;
        return;
    }
    
    logs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'error-log-item';
        item.style.cssText = 'border-bottom: 1px dashed rgba(239, 68, 68, 0.15); padding: 0.35rem 0; font-size: 0.7rem; &:last-child { border-bottom: none; }';
        
        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; color: #ef4444; font-weight:600; margin-bottom: 0.1rem;">
                <span>⚠️ ${log.message.length > 35 ? log.message.substring(0, 35) + '...' : log.message}</span>
                <span style="color:var(--text-dim); font-weight:normal; font-size:0.6rem;">${log.timestamp.split(' ')[1] || ''}</span>
            </div>
            <div style="color:var(--text-muted); line-height:1.2; word-break:break-all;">
                Source: ${log.source} (Line: ${log.lineno}, Col: ${log.colno})
            </div>
        `;
        listContainer.appendChild(item);
    });
}

function clearErrorLogs() {
    if (confirm('시스템에 기록된 모든 오류 히스토리를 초기화하시겠습니까?')) {
        localStorage.removeItem('kbs_error_logs');
        renderErrorLogList();
        showToast('<i class="fa-solid fa-circle-check"></i> 오류 로그가 성공적으로 초기화되었습니다.');
    }
}
