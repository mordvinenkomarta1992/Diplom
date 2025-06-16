import os
import json
import httpx
from fastapi import FastAPI, Form, HTTPException, Depends, Request, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import List
from .database import init_db, SessionLocal
from .models import QueryHistory

# ──────────────────────────────────────────────────────────
# Настройки (можно вынести в .env)
# -----------------------------------------------------------------------------
# Базовый URL вашего LLM‑сервиса. По умолчанию — "http://localhost:8001/v1".
# Можно переопределить переменной окружения LLM_API_BASE.
API_BASE = os.getenv("LLM_API_BASE", "http://45.138.74.126:8001/v1")

# Название модели, которое будет передано в теле запроса.
# Переопределяется переменной окружения LLM_MODEL.
API_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
# ──────────────────────────────────────────────────────────

# Создаем экземпляр FastAPI
app = FastAPI()

# Регистрируем статику (CSS, JS, изображения)
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Подключаем Jinja2‑шаблоны
templates = Jinja2Templates(directory="app/templates")

init_db()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Отдаём главную страницу с веб‑формой."""
    # В функцию шаблона нужно обязательно передать объект request.
    # Здесь можно передать пустой словарь, т.к. сам «request» в шаблоне не
    # используется (если используется, передайте реальный объект Request).
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/generate-code")
async def generate_code(prompt: str = Form(...), db=Depends(get_db)):
    """
    Принимаем текст запроса из веб‑формы и генерируем Python‑код с помощью LLM.

    Form(...) указывает, что параметр «prompt» берётся из тела формы «x-www-form-urlencoded».
    """
    # Формируем JSON‑тело запроса — структура совместима с `/chat/completions`.
    payload = {
        "model": API_MODEL,
        "store": True,  # попросим бэкенд сохранить чат (если он это умеет)
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a coding assistant.\n"
                    "Return **only** a JSON object with exactly three keys:\n"
                    "  • code – Python code as a string (no ``` wrapper);\n"
                    "  • explanation – Russian explanation;\n"
                    "  • resources – array of objects, each with keys 'url' and 'title', "
                    "   e.g. [{\"url\": \"https://docs.python.org/...\", \"title\": \"Python docs\"}].\n"
                    "Do not output anything outside this JSON."
                )
            },
            {"role": "user", "content": prompt}
        ]
    }

    # -----------------------------
    # Обращаемся к LLM‑сервису
    # -----------------------------
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{API_BASE}/chat/completions",
                json=payload
            )
            response.raise_for_status()
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"LLM API error: {e}")

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=500, detail=f"Unexpected LLM response format: {e}")

    # Попытаемся разобрать ответ как JSON {code, explanation, resources}
    code: str = ""

    explanation = content  # по умолчанию вернём весь текст как объяснение
    sources = None
    try:
        parsed = json.loads(content)
        code = (parsed.get("code") or "").strip().replace("\\n", "\n")
        explanation = (parsed.get("explanation") or "").strip()
        sources = (parsed.get("resources") or [])
    except json.JSONDecodeError:
        # Ответ не JSON – ничего страшного; означет, что модель не
        # придерживалась формата, и мы отдадим «как есть».
        pass

    # Сохраняем prompt и ВЕСЬ content (ответ LLM) в историю
    try:
        history = QueryHistory(
            prompt=prompt,
            response=content
        )
        db.add(history)
        db.commit()
        db.refresh(history)
    except Exception as e:
        print(f"Ошибка сохранения истории: {e}")

    return {"code": code, "explanation": explanation, "resources": sources}


@app.get("/history")
def get_history(db=Depends(get_db)):
    history = db.query(QueryHistory).order_by(QueryHistory.created_at.desc()).all()
    return [
        {"id": h.id, "prompt": h.prompt, "response": h.response, "created_at": h.created_at}
        for h in history
    ]


@app.delete("/history/{history_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_history(history_id: int, db=Depends(get_db)):
    history = db.query(QueryHistory).filter(QueryHistory.id == history_id).first()
    if history:
        db.delete(history)
        db.commit()
    return


@app.get("/check-connection")
async def check_connection():
    """Простой healthcheck: вернёт {"status": "online"}."""
    return {"status": "online"}


# Запуск приложения напрямую (python app_with_comments.py)
if __name__ == "__main__":
    import uvicorn

    # uvicorn.run запускает встроенный ASGI‑сервер
    uvicorn.run(app, host="127.0.0.1", port=8000)