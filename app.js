/* ============================================
   내부자신고 사전상담 시스템 PoC v2.0 - App Logic
   AI 채팅 + RAG + 신고서 생성
   ============================================ */

// ─── Configuration ───────────────────────────────────────
// PoC: localhost. 운영 시 클라우드 서버 URL로 변경
const API_BASE_URL = 'http://localhost:8000';

// ─── State (메모리 전용, 비저장) ─────────────────────────
let appState = {
  currentStep: 1,
  chatHistory: [],  // {role, content} 배열 - 서버 전송용
  reportDraft: '',
  isWaiting: false,
};

// ─── Step Navigation ─────────────────────────────────────
function goToStep(step) {
  appState.currentStep = step;
  document.querySelectorAll('.step-nav-item').forEach(item => {
    item.classList.toggle('active', parseInt(item.dataset.step) === step);
  });
  document.querySelectorAll('.step-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(`step${step}`).classList.add('active');
  window.scrollTo({ top: 320, behavior: 'smooth' });
}

function goHome(e) {
  e.preventDefault();
  goToStep(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Chat Functions ──────────────────────────────────────

function addChatMessage(role, content) {
  const messagesEl = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-message ${role === 'user' ? 'user' : 'ai'}`;

  const avatar = role === 'user' ? '👤' : '🤖';
  const formattedContent = formatMarkdown(content);

  div.innerHTML = `
    <div class="chat-avatar">${avatar}</div>
    <div class="chat-bubble">${formattedContent}</div>
  `;

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatMarkdown(text) {
  // Simple markdown-like formatting
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
    .replace(/^- (.*)/gm, '• $1')
    .replace(/^(\d+)\. (.*)/gm, '$1. $2');
}

function showTyping() {
  document.getElementById('typingIndicator').style.display = 'flex';
  const messagesEl = document.getElementById('chatMessages');
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTyping() {
  document.getElementById('typingIndicator').style.display = 'none';
}

function setInputEnabled(enabled) {
  const input = document.getElementById('chatInput');
  const btn = document.getElementById('sendBtn');
  input.disabled = !enabled;
  btn.disabled = !enabled;
  appState.isWaiting = !enabled;
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();

  if (!message || appState.isWaiting) return;

  // Add user message to UI and history
  addChatMessage('user', message);
  appState.chatHistory.push({ role: 'user', content: message });
  input.value = '';
  autoResizeInput(input);

  // Enable report button after first message
  document.getElementById('reportBtn').disabled = false;

  // Show typing and disable input
  showTyping();
  setInputEnabled(false);

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: appState.chatHistory }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const reply = data.reply || '응답을 받을 수 없습니다.';

    // Add AI response to UI and history
    appState.chatHistory.push({ role: 'assistant', content: reply });
    addChatMessage('assistant', reply);

  } catch (error) {
    let errorMsg = '⚠️ 서버에 연결할 수 없습니다.\n\n';
    errorMsg += '다음을 확인해 주세요:\n';
    errorMsg += '1. API 서버가 실행 중인지 확인 (python server.py)\n';
    errorMsg += '2. GEMINI_API_KEY 환경변수가 설정되었는지 확인\n';
    errorMsg += `3. 서버 주소가 올바른지 확인 (현재: ${API_BASE_URL})`;
    addChatMessage('assistant', errorMsg);
  } finally {
    hideTyping();
    setInputEnabled(true);
    document.getElementById('chatInput').focus();
  }
}

async function requestReport() {
  if (appState.chatHistory.length === 0) {
    showToast('⚠️ 먼저 AI 상담을 진행해 주세요.');
    return;
  }

  showTyping();
  setInputEnabled(false);
  addChatMessage('user', '지금까지의 대화를 바탕으로 신고서 초안을 작성해 주세요.');

  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: appState.chatHistory }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const report = data.report || '신고서를 생성할 수 없습니다.';

    appState.reportDraft = report;

    // Show report in chat
    addChatMessage('assistant', '✅ 신고서 초안이 생성되었습니다. STEP 2에서 확인하실 수 있습니다.');

    // Update Step 2 with report
    const reportContent = document.getElementById('reportContent');
    reportContent.innerHTML = `<pre class="report-text">${escapeHtml(report)}</pre>`;

    // Show edit area and copy button
    const editArea = document.getElementById('reportEditArea');
    editArea.value = report;
    document.getElementById('editCard').style.display = 'block';
    document.getElementById('copyReportBtn').style.display = 'inline-flex';

    showToast('📄 신고서 초안이 생성되었습니다. STEP 2에서 확인하세요.');

    // Auto navigate to Step 2
    setTimeout(() => goToStep(2), 1500);

  } catch (error) {
    addChatMessage('assistant', '⚠️ 신고서 생성 중 오류가 발생했습니다. 서버 연결을 확인해 주세요.');
  } finally {
    hideTyping();
    setInputEnabled(true);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Input Handling ──────────────────────────────────────

function handleChatKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResizeInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ─── Report Copy ─────────────────────────────────────────

async function copyReport() {
  const editArea = document.getElementById('reportEditArea');
  const text = editArea.value || appState.reportDraft;
  const btn = document.getElementById('copyReportBtn');

  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('is-copied');
    showToast('✅ 신고서가 클립보드에 복사되었습니다!');
    setTimeout(() => btn.classList.remove('is-copied'), 3000);
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    btn.classList.add('is-copied');
    showToast('✅ 신고서가 클립보드에 복사되었습니다!');
    setTimeout(() => btn.classList.remove('is-copied'), 3000);
  }
}

// ─── Data Destruction ────────────────────────────────────

function destroyAllData() {
  const confirmed = confirm(
    '⚠️ 모든 데이터를 즉시 폐기합니다.\n\n' +
    '• AI 상담 대화 내용\n' +
    '• 생성된 신고서 초안\n' +
    '• 메모 내용\n\n' +
    '이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?'
  );

  if (!confirmed) return;

  // Clear state
  appState = {
    currentStep: 1,
    chatHistory: [],
    reportDraft: '',
    isWaiting: false,
  };

  // Clear chat messages (keep welcome message)
  const messagesEl = document.getElementById('chatMessages');
  messagesEl.innerHTML = `
    <div class="chat-message ai">
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">
        안녕하세요. 내부자신고 사전상담 AI 어시스턴트입니다.<br><br>
        신고하고 싶은 사안이 있으시면 편하게 말씀해 주세요.
        관련 법률과 내부규정을 기반으로 신고 대상에 해당하는지 함께 확인해 보겠습니다.<br><br>
        💡 <em>예시: "거래처 직원이 우리 회사 담당자에게 고가 선물을 보내는 것을 봤어요"</em>
      </div>
    </div>
  `;

  // Clear report
  document.getElementById('reportContent').innerHTML =
    '<p style="color: var(--text-muted); text-align: center; padding: 40px 0;">STEP 1에서 AI 상담을 진행한 후<br>"신고서 초안 생성" 버튼을 클릭하면<br>이곳에 신고서가 표시됩니다.</p>';
  document.getElementById('reportEditArea').value = '';
  document.getElementById('editCard').style.display = 'none';
  document.getElementById('copyReportBtn').style.display = 'none';
  document.getElementById('reportBtn').disabled = true;

  // Reset chat input
  document.getElementById('chatInput').value = '';

  goToStep(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('🔥 모든 데이터가 완전히 폐기되었습니다.');
}

// ─── Toast ───────────────────────────────────────────────

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Security ────────────────────────────────────────────

window.addEventListener('beforeunload', (e) => {
  if (appState.chatHistory.length > 0) {
    e.preventDefault();
    e.returnValue = 'AI 상담 내용이 있습니다. 페이지를 떠나면 모든 데이터가 삭제됩니다.';
  }
});

// Prevent printing
const printStyle = document.createElement('style');
printStyle.textContent = `
  @media print {
    body * { display: none !important; }
    body::after {
      content: '보안상의 이유로 이 페이지는 인쇄할 수 없습니다.';
      display: block; font-size: 1.5rem; text-align: center; padding: 100px; color: #333;
    }
  }
`;
document.head.appendChild(printStyle);

// ─── Initialize ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log('%c🛡️ 내부자신고 사전상담 시스템 v2.0', 'font-size: 16px; font-weight: bold; color: #3b82f6;');
  console.log('%cAI 상담 내용은 서버에 저장되지 않습니다.', 'font-size: 12px; color: #94a3b8;');
});
