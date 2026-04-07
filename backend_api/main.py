# --- 資料庫套件 ---
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Literal
from pathlib import Path

from history_checker import HistoryChecker
from fastapi import Body
import google.generativeai as genai

app = FastAPI(title="Fraud Analysis Core API")
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:0509@localhost/fraud_db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
# ---------
# AI 設定
# ---------
# 請在此處貼上你剛申請的 API Key
genai.configure(api_key="")

try:
    # 1. 取得所有支援生成內容的模型名稱
    available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
    
    # 2. 設定優先順序清單 (由新到舊，由 Flash 優先考慮速度)
    # 我們優先選 3.1 Flash，因為它在處理你的詐騙分析時速度快且更聰明
    priority_list = [
        'models/gemini-3.1-flash',         # 首選：最新 3.1 速度版
        'models/gemini-3.1-pro',           # 次選：最新 3.1 強力推理版
        'models/gemini-1.5-flash-latest',  # 備選：穩定的 1.5 系列
        'models/gemini-1.5-flash'
    ]
    
    selected_model_name = None
    
    # 3. 依照優先順序比對清單
    for target in priority_list:
        if target in available_models:
            selected_model_name = target
            break
            
    # 如果優先清單都沒有，就選清單中第一個可用的
    if not selected_model_name:
        selected_model_name = available_models[0] if available_models else 'models/gemini-1.5-flash-latest'

    print(f"🚀 自動選擇最佳模型: {selected_model_name}")
    model = genai.GenerativeModel(selected_model_name)

except Exception as e:
    print(f"❌ 無法取得模型清單，切換至保底模式: {e}")
    # 萬一連 list_models 都失敗，強制使用一個最通用的名稱
    model = genai.GenerativeModel('models/gemini-2.5-flash')
# ---------
# 真實 AI 分析函式
# ---------
def ai_analyze(text: str):
    # 優化 Prompt：給予明確的標題與結構指示
    prompt = f"""
    請針對以下新聞內容，提供「極簡化」的防範分析。
    
    ⚠️ 規則：
    1. 嚴禁使用 Markdown 語法（不要出現 ** 或 #）。
    2. 每個標題下方內容「不得超過兩行」。
    3. 防範建議請給最直覺的動作（例如：掛斷、撥打165）。

    📰【新聞重點】
    (用20字以內總結)

    🚫【詐騙拆解】
    (一兩句話說穿對方在演什麼)
    1. 
    2.

    ✅【防範動作】
    1. (建議 1)
    2. (建議 2)
    3. (建議 3)

    📢【防詐口訣】
    (一句好記的短語)

    內容如下：
    {text}
    """
    
    try:
        # 使用同步呼叫（generate_content）比較不容易在簡單腳本出錯
        response = model.generate_content(
            prompt,
            generation_config={
                "max_output_tokens": 2000,  
                "temperature": 0.3,         # [建議] 調低溫度 (如 0.3)，讓防詐回覆更精準、嚴謹，不需過度發散
            }
        )
        
        if response and response.text:
            return {
                "risk_level": "Green",
                "reply_text": response.text
            }
        else:
            raise Exception("AI 回傳內容為空")

    except Exception as e:
        # 這行非常重要！請看終端機印出什麼
        print(f"❌ AI 實際錯誤原因: {e}") 
        return {
            "risk_level": "Yellow",
            "reply_text": "系統暫時無法分析，請保持警覺，切勿點擊不明連結或提供個人資料！"
        }
# ---------
# Pydantic Schemas
# ---------
class MessageLog(Base):
    __tablename__ = "message_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)      
    content = Column(Text)                    
    msg_type = Column(String)            
    risk_score = Column(Integer) #分數   
    risk_light = Column(String)               
    created_at = Column(DateTime, default=datetime.now) 

Base.metadata.create_all(bind=engine)

def save_to_db(user_id, content, risk_light, score):
    db = SessionLocal()
    try:
        new_log = MessageLog(
            user_id=user_id,
            content=content,
            msg_type="text",
            risk_score=score,
            risk_light=risk_light
        )
        db.add(new_log)
        db.commit()
        print(f"✅ 成功寫入資料庫：{content} (分數: {score})")
    except Exception as e:
        print(f"❌ 資料庫存檔失敗: {e}")
    finally:
        db.close()

class AnalyzeRequest(BaseModel):
    user_id: str
    # message_type: Literal["text", "image"] # 暫時不需要，因為 Node.js 已經分流了
    content: str  # 🔴 變數名稱必須改成 content

class AnalyzeResponse(BaseModel):
    risk_level: Literal["Red", "Yellow", "Green"]
    reply_text: str

# ---------
# Init History Checker
# ---------
BASE_DIR = Path(__file__).resolve().parent
history_checker = HistoryChecker(BASE_DIR / "data" / "scam_history.json")

# ---------
# Main Endpoint
# ---------
# --- 這裡補上你原本的關鍵字清單 ---
FRAUD_KEYWORDS = [
    "解除分期", "重複扣款", "操作ATM", "操作網銀", "購買點數", 
    "保證金", "解凍金", "安全帳戶", "監管帳戶", "匯款", "轉帳",
    "保證獲利", "穩賺不賠", "飆股", "投資群組", "快速回本",
    "涉及刑案", "偵查不公開", "帳戶凍結", "警察局", "地檢署"
]

def check_risk_level(text):
    """一般使用者的關鍵字計分邏輯"""
    detected_keywords = []
    score = 0
    for keyword in FRAUD_KEYWORDS:
        if keyword in text:
            detected_keywords.append(f"「{keyword}」")
            score += 60 # 每個關鍵字加 60 分 (可自由調整)
    
    if score > 0:
        return {
            "risk_level": "Yellow",
            "score": score,
            "reply_text": f"🚨 系統判定分數：{score} 分\n⚠️ 偵測到高風險關鍵字：{', '.join(detected_keywords)}。請提高警覺！"
        }
    else:
        return {
            "risk_level": "Green",
            "score": 30,
            "reply_text": "✅ 系統判定分數：0 分\n目前未偵測到明顯詐騙關鍵字，但仍請保持警覺。"
        }


# --- API 路由分流 ---
# ⚠️ 注意：這裡把 response_model=AnalyzeResponse 拿掉了，讓回傳格式更自由
@app.post("/analyze/text") 
def analyze(req: AnalyzeRequest = Body(...)):
    text = req.content
    user_id = req.user_id

    # 🚦 軌道 A：如果是系統抓的新聞 (交給 Gemini)
    if user_id == "news_bot_system":
        print("📰 收到新聞分析請求，啟動 Gemini AI...")
        ai_result = ai_analyze(text) 
        return {
            "risk_level": ai_result["risk_level"],
            "reply_text": ai_result["reply_text"]
        }

    # 🚦 軌道 B：一般使用者的訊息 (只做關鍵字，並存入資料庫)
    print(f"👤 收到使用者 {user_id} 訊息，進行關鍵字比對...")
    risk_result = check_risk_level(text)
    
    # 呼叫你寫好的存檔小幫手，寫入 PostgreSQL
    # (如果你的 main.py 裡面有 save_to_db 函數，記得在這裡呼叫)
    save_to_db(user_id, text, risk_result["risk_level"], risk_result["score"])

    return {
        "risk_level": risk_result["risk_level"],
        "reply_text": risk_result["reply_text"]
    }
# .\.venv\Scripts\Activate 啟動虛擬環境
# python -m uvicorn main:app --reload 啟動 FastAPI 中樞服務

#  FastAPI 中樞服務跑起來
#/analyze API 穩定
#歷史比對模組完成（命中就回，不走 AI）
#Git 環境乾淨（.venv / __pycache__ 都處理好）
