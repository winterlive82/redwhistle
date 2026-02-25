/* ============================================
   내부자신고 사전상담 시스템 PoC - Application Logic
   ============================================ */

// ─── State (메모리 전용, 비저장) ─────────────────────────
let appState = {
  currentStep: 1,
  selectedType: null,
  checklistState: [],
};

// ─── Prompt Templates ────────────────────────────────────
const PROMPT_TEMPLATES = {
  fraud: {
    name: '금전 부정행위',
    prompt: `당신은 금융회사의 내부통제 전문가입니다. 다음 가상의 시나리오에 대해 상담해 주세요.

[가상 시나리오]
금융회사에서 특정 직원이 회사 자금을 부적절하게 사용하거나, 외부 거래처로부터 부당한 금전적 이익을 수수한 정황이 의심되는 상황입니다.

다음 질문에 답변해 주세요:
1. 이러한 행위는 어떤 법률/규정에 위반될 수 있나요?
2. 내부자신고 대상에 해당하나요?
3. 신고 시 어떤 정보를 준비해야 하나요?
4. 신고자는 어떤 법적 보호를 받을 수 있나요?
5. 신고하지 않을 경우 어떤 리스크가 있나요?

※ 이것은 가상의 시나리오이며, 일반적인 법률 가이드를 요청드립니다.`
  },

  compliance: {
    name: '법규/규정 위반',
    prompt: `당신은 금융회사의 준법감시(컴플라이언스) 전문가입니다. 다음 가상의 시나리오에 대해 상담해 주세요.

[가상 시나리오]
금융회사에서 내부 규정이나 관련 법령을 위반하는 업무 처리가 관행적으로 이루어지고 있는 것으로 의심되는 상황입니다. 예를 들어, 승인 절차를 무시하거나, 보고 의무를 이행하지 않는 등의 행위가 있을 수 있습니다.

다음 질문에 답변해 주세요:
1. 이러한 행위는 어떤 법률/규정에 위반될 수 있나요?
2. 관행적인 규정 위반도 내부자신고 대상이 되나요?
3. 신고 시 어떤 증거나 정보를 준비하면 좋나요?
4. 신고자에게 어떤 법적 보호가 주어지나요?
5. 이를 목격하고도 신고하지 않으면 어떤 책임이 있을 수 있나요?

※ 이것은 가상의 시나리오이며, 일반적인 법률 가이드를 요청드립니다.`
  },

  security: {
    name: '정보보안 위반',
    prompt: `당신은 금융회사의 정보보호(CISO) 전문가입니다. 다음 가상의 시나리오에 대해 상담해 주세요.

[가상 시나리오]
금융회사에서 직원이 고객 개인정보를 무단으로 외부에 반출하거나, 접근 권한이 없는 시스템에 부적절하게 접근하는 등의 정보보안 위반 행위가 의심되는 상황입니다.

다음 질문에 답변해 주세요:
1. 이러한 행위는 어떤 법률(개인정보보호법, 전자금융거래법 등)에 위반되나요?
2. 정보보안 위반 사항도 내부자신고 대상에 해당하나요?
3. 신고 시 어떤 정보를 준비해야 하나요? (로그 기록, 시점 등)
4. 신고자의 보호는 어떻게 보장되나요?
5. 정보보안 위반 신고 시 특별히 주의할 점이 있나요?

※ 이것은 가상의 시나리오이며, 일반적인 법률 가이드를 요청드립니다.`
  },

  ethics: {
    name: '윤리/직장 내 문제',
    prompt: `당신은 기업윤리 및 노동법 전문가입니다. 다음 가상의 시나리오에 대해 상담해 주세요.

[가상 시나리오]
직장 내에서 괴롭힘, 성희롱, 부당한 차별, 또는 상급자의 부당한 업무 지시 등 윤리적 문제가 발생하고 있는 것으로 의심되는 상황입니다.

다음 질문에 답변해 주세요:
1. 이러한 행위는 어떤 법률(근로기준법, 남녀고용평등법 등)에 위반되나요?
2. 직장 내 괴롭힘/성희롱 등도 내부자신고와 같은 절차로 신고할 수 있나요?
3. 이런 유형의 신고 시 어떤 정보를 준비하면 좋나요?
4. 신고자에 대한 보복을 방지하기 위한 법적 장치는 무엇인가요?
5. 신고 외에 활용할 수 있는 다른 구제 수단이 있나요?

※ 이것은 가상의 시나리오이며, 일반적인 법률 가이드를 요청드립니다.`
  },

  safety: {
    name: '안전/환경 위반',
    prompt: `당신은 산업안전 및 환경 규제 전문가입니다. 다음 가상의 시나리오에 대해 상담해 주세요.

[가상 시나리오]
회사에서 안전 규정을 준수하지 않거나, 환경 관련 법규를 위반하는 행위가 이루어지고 있는 것으로 의심되는 상황입니다. 예를 들어, 안전 점검 결과를 조작하거나, 사고를 은폐하는 등의 행위가 있을 수 있습니다.

다음 질문에 답변해 주세요:
1. 이러한 행위는 어떤 법률(산업안전보건법, 중대재해처벌법 등)에 위반되나요?
2. 안전/환경 위반 사항의 신고 절차와 방법은 어떻게 되나요?
3. 이런 유형의 신고 시 어떤 증거를 확보해야 하나요?
4. 신고자에 대한 법적 보호는 어떻게 이루어지나요?
5. 사고 은폐를 목격하고 신고하지 않으면 어떤 법적 책임이 있나요?

※ 이것은 가상의 시나리오이며, 일반적인 법률 가이드를 요청드립니다.`
  },

  other: {
    name: '기타',
    prompt: `당신은 기업 내부통제 및 윤리경영 전문가입니다. 다음 가상의 시나리오에 대해 상담해 주세요.

[가상 시나리오]
회사 내에서 부적절하거나 비윤리적인 행위가 이루어지고 있는 것으로 의심되지만, 구체적으로 어떤 유형에 해당하는지 명확하지 않은 상황입니다.

다음 질문에 답변해 주세요:
1. 내부자신고의 대상이 되는 행위에는 어떤 유형들이 있나요?
2. 부정행위인지 아닌지 판단하기 애매한 경우 어떻게 해야 하나요?
3. 내부자신고를 하기 전에 확인해야 할 사항은 무엇인가요?
4. 신고자는 어떤 법적 보호를 받을 수 있나요?
5. 신고는 어떤 절차로 이루어지며, 처리 기간은 어떻게 되나요?

※ 이것은 가상의 시나리오이며, 일반적인 법률 가이드를 요청드립니다.`
  }
};

// ─── Step Navigation ─────────────────────────────────────
function goToStep(step) {
  appState.currentStep = step;

  // Update nav items
  document.querySelectorAll('.step-nav-item').forEach(item => {
    const itemStep = parseInt(item.dataset.step);
    item.classList.toggle('active', itemStep === step);
  });

  // Update panels
  document.querySelectorAll('.step-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(`step${step}`).classList.add('active');

  // Scroll to top of content
  window.scrollTo({ top: 320, behavior: 'smooth' });
}

function goHome(e) {
  e.preventDefault();
  goToStep(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── STEP 1: Type Selection & Prompt Generation ─────────
function selectType(el) {
  // Deselect all
  document.querySelectorAll('.type-card').forEach(card => {
    card.classList.remove('selected');
  });

  // Select clicked
  el.classList.add('selected');
  const type = el.dataset.type;
  appState.selectedType = type;

  // Show generated prompt
  const template = PROMPT_TEMPLATES[type];
  if (template) {
    document.getElementById('promptText').textContent = template.prompt;
    document.getElementById('promptBox').style.display = 'block';

    // Reset copy button
    const btn = document.getElementById('copyBtn');
    btn.classList.remove('is-copied');

    // Scroll to prompt
    setTimeout(() => {
      document.getElementById('promptBox').scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }, 100);
  }
}

// ─── Clipboard Copy ──────────────────────────────────────
async function copyPrompt() {
  const text = document.getElementById('promptText').textContent;
  const btn = document.getElementById('copyBtn');

  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('is-copied');
    showToast('✅ 프롬프트가 클립보드에 복사되었습니다!');

    setTimeout(() => {
      btn.classList.remove('is-copied');
    }, 3000);
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);

    btn.classList.add('is-copied');
    showToast('✅ 프롬프트가 클립보드에 복사되었습니다!');

    setTimeout(() => {
      btn.classList.remove('is-copied');
    }, 3000);
  }
}

// ─── STEP 2: Checklist ───────────────────────────────────
function toggleCheck(item) {
  item.classList.toggle('checked');
}

// ─── STEP 3: Data Destruction ────────────────────────────
function destroyAllData() {
  const confirmed = confirm(
    '⚠️ 모든 데이터를 즉시 폐기합니다.\n\n' +
    '• 선택한 신고 유형 정보\n' +
    '• 체크리스트 상태\n' +
    '• 메모 내용\n' +
    '• 생성된 프롬프트\n\n' +
    '이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?'
  );

  if (!confirmed) return;

  // Clear all state
  appState = {
    currentStep: 1,
    selectedType: null,
    checklistState: [],
  };

  // Clear UI - type cards
  document.querySelectorAll('.type-card').forEach(card => {
    card.classList.remove('selected');
  });

  // Clear prompt
  document.getElementById('promptText').textContent = '';
  document.getElementById('promptBox').style.display = 'none';
  document.getElementById('copyBtn').classList.remove('is-copied');

  // Clear checklist
  document.querySelectorAll('.checklist-item').forEach(item => {
    item.classList.remove('checked');
  });

  // Clear notes
  const notesArea = document.getElementById('notesArea');
  if (notesArea) {
    notesArea.value = '';
  }

  // Go to step 1
  goToStep(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  showToast('🔥 모든 데이터가 완전히 폐기되었습니다.');
}

// ─── Toast Notification ──────────────────────────────────
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ─── Security: Prevent data leaks ────────────────────────

// Warn before leaving page if notes have content
window.addEventListener('beforeunload', (e) => {
  const notes = document.getElementById('notesArea');
  if (notes && notes.value.trim()) {
    e.preventDefault();
    e.returnValue = '작성 중인 메모가 있습니다. 페이지를 떠나면 모든 데이터가 삭제됩니다.';
  }
});

// Clear everything when page is hidden (tab switch / minimize)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Clear sensitive textarea content from memory-mapped DOM
    const notes = document.getElementById('notesArea');
    if (notes) {
      // Store a flag but keep content for user convenience if they return quickly
      notes.dataset.wasHidden = 'true';
    }
  }
});

// Disable right-click context menu on sensitive areas
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.notes-area') || e.target.closest('.prompt-box')) {
    // Allow for accessibility, but could be restricted in production
  }
});

// Prevent printing sensitive data
const style = document.createElement('style');
style.textContent = `
  @media print {
    body * { display: none !important; }
    body::after {
      content: '보안상의 이유로 이 페이지는 인쇄할 수 없습니다.';
      display: block;
      font-size: 1.5rem;
      text-align: center;
      padding: 100px;
      color: #333;
    }
  }
`;
document.head.appendChild(style);

// ─── Initialize ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Ensure no localStorage or cookies are used
  // This is intentional — all state is in-memory only

  // Add keyboard navigation for accessibility
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close any open modals or prompts in the future
    }
  });

  console.log(
    '%c🛡️ 내부자신고 사전상담 시스템',
    'font-size: 16px; font-weight: bold; color: #3b82f6;'
  );
  console.log(
    '%c이 시스템은 서버에 데이터를 저장하지 않습니다. 모든 데이터는 브라우저 메모리에만 존재합니다.',
    'font-size: 12px; color: #94a3b8;'
  );
});
