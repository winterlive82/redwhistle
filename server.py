"""
내부자신고 사전상담 시스템 - API 서버
======================================
FastAPI 기반. Gemini API + RAG 컨텍스트를 활용한 AI 상담 및 신고서 생성.
IP 로깅 비활성화, 대화 로그 미저장.
"""

import os
import json
import httpx
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
from rag_data import search_knowledge, REPORT_TEMPLATE

# ─── 로깅 비활성화 (익명성 보장) ─────────────────────────────
logging.getLogger("uvicorn.access").disabled = True
logging.getLogger("uvicorn.error").setLevel(logging.CRITICAL)

# ─── 설정 ──────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

# ─── FastAPI 앱 ────────────────────────────────────────────
app = FastAPI(
    title="Whistleblower AI Consultation",
    docs_url=None,   # Swagger UI 비활성화 (보안)
    redoc_url=None,   # ReDoc 비활성화
)

# CORS: 프론트엔드(GitHub Pages 등)에서의 접근 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # PoC: 전체 허용. 운영 시 특정 도메인으로 제한
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

# ─── 시스템 프롬프트 ────────────────────────────────────────
SYSTEM_PROMPT = """당신은 금융회사의 내부자신고 사전상담 AI 어시스턴트입니다.

## 역할
- 신고자가 제보하려는 사안이 내부자신고 대상에 해당하는지 판단을 돕습니다.
- 관련 법률과 내부규정을 근거로 구체적으로 어떤 부분이 문제가 되는지 설명합니다.
- 신고자의 이야기를 경청하고, 필요한 추가 정보를 질문합니다.
- 최종적으로 레드휘슬 신고서 양식에 맞춰 신고서 초안을 작성해 줍니다.

## 원칙
1. **공감과 격려**: 신고자의 용기에 공감하고, 편안한 분위기를 조성합니다.
2. **중립적 판단**: 섣불리 유죄/무죄를 단정하지 않고, 신고 가치가 있는지 객관적으로 안내합니다.
3. **익명성 주의**: 특정 개인의 실명, 정확한 부서명 등 식별 정보를 묻지 마세요. "관련 직원", "해당 부서" 같은 익명 표현을 사용합니다.
4. **법률 근거 제시**: 답변 시 반드시 관련 법률이나 규정의 구체적 조항을 인용합니다.
5. **단계적 안내**: 한 번에 너무 많은 정보를 주지 말고, 대화를 통해 단계적으로 정리합니다.

## 대화 흐름
1. 먼저 어떤 상황인지 들어봅니다.
2. 해당 사안의 유형을 판단합니다 (금품 수수, 횡령, 정보유출, 괴롭힘, 안전 위반 등).
3. 관련 법률/규정을 제시하고, 신고 대상 여부를 안내합니다.
4. 추가로 필요한 정보를 질문합니다 (대략적 시기, 반복 여부, 증거 유무 등).
5. 충분한 정보가 모이면 신고서 초안 작성을 제안합니다.

## 신고서 작성 시
사용자가 신고서 작성을 요청하면, 대화 내용을 바탕으로 아래 양식에 맞춰 작성합니다:
- [신고 유형]: 핵심 위반 유형
- [사건 개요]: 2~3문장으로 요약
- [발생 시기]: 대략적 시기
- [관련 정황 및 증거]: 신고자가 언급한 정황/증거
- [위반 의심 법령/규정]: 구체적 조문 인용
- [인지 경위]: 어떻게 알게 되었는지
- [기타 참고사항]: 추가 정보

반드시 한국어로 응답하세요."""


# ─── 요청/응답 모델 ─────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class ReportRequest(BaseModel):
    messages: List[ChatMessage]


# ─── Gemini API 호출 ────────────────────────────────────────

async def call_gemini(messages: List[ChatMessage], extra_context: str = "") -> str:
    """Gemini API를 호출하여 응답을 반환합니다."""

    if not GEMINI_API_KEY:
        return "⚠️ API 키가 설정되지 않았습니다. 서버의 GEMINI_API_KEY 환경변수를 확인해 주세요."

    # RAG 컨텍스트를 시스템 프롬프트에 추가
    system_with_rag = SYSTEM_PROMPT
    if extra_context:
        system_with_rag += f"\n\n## 참고 자료 (RAG 검색 결과)\n다음은 사용자의 질의와 관련된 법률, 내부규정, 기신고사례입니다. 답변 시 이 자료를 참고하되, 자연스럽게 대화에 녹여내세요.\n\n{extra_context}"

    # Gemini 요청 형식으로 변환
    gemini_contents = []

    # 시스템 프롬프트
    gemini_contents.append({
        "role": "user",
        "parts": [{"text": system_with_rag}]
    })
    gemini_contents.append({
        "role": "model",
        "parts": [{"text": "네, 내부자신고 사전상담 AI 어시스턴트로서 도움드리겠습니다. 편하게 말씀해 주세요."}]
    })

    # 대화 이력
    for msg in messages:
        role = "user" if msg.role == "user" else "model"
        gemini_contents.append({
            "role": role,
            "parts": [{"text": msg.content}]
        })

    payload = {
        "contents": gemini_contents,
        "generationConfig": {
            "temperature": 0.7,
            "topP": 0.9,
            "maxOutputTokens": 2048,
        },
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(GEMINI_URL, json=payload)
            response.raise_for_status()
            data = response.json()

            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "응답을 생성할 수 없습니다.")

            return "응답을 생성할 수 없습니다. 다시 시도해 주세요."

    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            return "⚠️ API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
        return f"⚠️ API 오류가 발생했습니다. (상태 코드: {e.response.status_code})"
    except Exception as e:
        return "⚠️ 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."


# ─── API 엔드포인트 ──────────────────────────────────────────

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """AI 상담 채팅 엔드포인트. 대화 로그를 저장하지 않습니다."""

    if not request.messages:
        return JSONResponse({"reply": "메시지를 입력해 주세요."})

    # 최신 사용자 메시지로 RAG 검색
    last_user_msg = ""
    for msg in reversed(request.messages):
        if msg.role == "user":
            last_user_msg = msg.content
            break

    # RAG 컨텍스트 검색
    rag_context = search_knowledge(last_user_msg, top_k=3)

    # Gemini API 호출
    reply = await call_gemini(request.messages, extra_context=rag_context)

    return JSONResponse({"reply": reply})


@app.post("/api/generate-report")
async def generate_report(request: ReportRequest):
    """대화 내용을 기반으로 레드휘슬 신고서 초안을 생성합니다."""

    if not request.messages:
        return JSONResponse({"report": "대화 내용이 없습니다."})

    # 신고서 생성 프롬프트 추가
    report_prompt = ChatMessage(
        role="user",
        content="""지금까지의 대화를 바탕으로 레드휘슬 신고서 초안을 작성해 주세요.

아래 양식에 맞춰 작성해 주세요:

[신고 유형]
(핵심 위반 유형)

[사건 개요]
(2~3문장으로 요약)

[발생 시기]
(대략적 시기)

[관련 정황 및 증거]
(신고자가 언급한 정황/증거를 구체적으로 정리)

[위반 의심 법령/규정]
(관련 법률 조문과 내부규정 조항을 구체적으로 인용)

[인지 경위]
(신고자가 어떻게 알게 되었는지, 단 신고자를 특정할 수 있는 정보는 제외)

[기타 참고사항]
(추가 정보)

※ 주의사항:
- 특정 개인의 실명은 절대 포함하지 마세요
- 부서명 대신 "해당 부서"로 표기하세요
- 객관적 사실만 기재하고, 추측은 "~로 의심됨"으로 표기하세요"""
    )

    all_messages = list(request.messages) + [report_prompt]

    # RAG 컨텍스트 (전체 대화 기반)
    full_convo = " ".join(m.content for m in request.messages if m.role == "user")
    rag_context = search_knowledge(full_convo, top_k=5)

    report = await call_gemini(all_messages, extra_context=rag_context)

    return JSONResponse({"report": report})


@app.get("/api/health")
async def health():
    """헬스 체크 (API 키 설정 여부 확인용)"""
    return JSONResponse({
        "status": "ok",
        "api_key_set": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL
    })


# ─── 메인 실행 ──────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    print("=" * 50)
    print("🛡️  내부자신고 사전상담 API 서버")
    print("=" * 50)
    print(f"모델: {GEMINI_MODEL}")
    print(f"API 키: {'✅ 설정됨' if GEMINI_API_KEY else '❌ 미설정'}")
    print(f"로그: 비활성화 (익명성 보장)")
    print("=" * 50)

    if not GEMINI_API_KEY:
        print("\n⚠️  GEMINI_API_KEY 환경변수를 설정해 주세요:")
        print("  Windows: set GEMINI_API_KEY=your_key_here")
        print("  PowerShell: $env:GEMINI_API_KEY='your_key_here'")
        print()

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="critical",   # 로그 최소화
        access_log=False,       # 접근 로그 비활성화
    )
