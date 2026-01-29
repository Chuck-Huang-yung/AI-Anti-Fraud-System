# main.py (資料庫整合版)
import os
from fastapi import FastAPI, File, UploadFile, Form
from pydantic import BaseModel
from google.cloud import vision
from google.oauth2 import service_account

# --- 新增資料庫相關套件 ---
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

app = FastAPI()

# --- 設定區 ---
CREDENTIALS_FILE = "credentials.json"

SQLALCHEMY_DATABASE_URL = "postgresql://postgres:0509@localhost/fraud_db"

# 建立資料庫連線引擎
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- 定義資料表模型 (Schema) ---
# 這會自動在資料庫裡建立一個叫做 'message_logs' 的表格
class MessageLog(Base):
    __tablename__ = "message_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)      # 使用者 ID
    content = Column(Text)                    # 訊息內容 (或 OCR 結果)
    msg_type = Column(String)                 # text (文字) 或 image (圖片)
    risk_score = Column(Integer)              # 風險分數 (0-100)
    risk_light = Column(String)               # 燈號 (Red/Green)
    created_at = Column(DateTime, default=datetime.now) # 建立時間

# 初始化資料庫 (如果表格不存在就自動建立)
Base.metadata.create_all(bind=engine)

# --- 詐騙關鍵字黑名單 ---
FRAUD_KEYWORDS = [
    # 1. 金錢與帳戶類
    "解除分期", "重複扣款", "操作ATM", "操作網銀", "購買點數", 
    "MyCard", "Gash", "保證金", "解凍金", "安全帳戶", "監管帳戶",
    "匯款", "轉帳", "補償金", "誤設為批發商", "誤刷",
    # 2. 投資與獲利類
    "保證獲利", "穩賺不賠", "飆股", "內線消息", "老師帶牌", 
    "代操", "虛擬貨幣", "USDT", "比特幣", "投資群組", "快速回本",
    "高報酬", "低風險", "抽股票",
    # 3. 威脅與急迫類
    "涉及刑案", "偵查不公開", "拘提", "通緝", "帳戶凍結", 
    "刑事責任", "限時", "立即處理", "逾期", "強制執行",
    "法院傳票", "警察局", "地檢署",
    # 4. 帳號與認證類
    "Line輔助認證", "重新登入", "帳號異常", "更新資料", 
    "點擊連結", "驗證碼", "安全代碼", "客服", "官方帳號",
    "免費貼圖", "好禮大放送"
]

# --- 功能函式區 ---

def ocr_process(image_content):
    """(Google Vision OCR)"""
    if not os.path.exists(CREDENTIALS_FILE):
        return "錯誤：找不到 credentials.json"
    try:
        credentials = service_account.Credentials.from_service_account_file(CREDENTIALS_FILE)
        client = vision.ImageAnnotatorClient(credentials=credentials)
        image = vision.Image(content=image_content)
        response = client.text_detection(image=image)
        texts = response.text_annotations
        if response.error.message:
            return f"Google API 錯誤: {response.error.message}"
        if texts:
            return texts[0].description
        else:
            return ""
    except Exception as e:
        return f"OCR 例外錯誤: {str(e)}"

def check_risk_level(text):
    """(關鍵字快篩邏輯)"""
    detected_keywords = []
    for keyword in FRAUD_KEYWORDS:
        if keyword in text:
            detected_keywords.append(keyword)
    
    if len(detected_keywords) > 0:
        return {
            "score": 90, 
            "light": "Red", 
            "reason": f"偵測到高風險關鍵字：{', '.join(detected_keywords)}",
            "keywords": detected_keywords
        }
    else:
        return {
            "score": 0,
            "light": "Green", 
            "reason": "未偵測到已知關鍵字，建議進一步由 AI 模型分析",
            "keywords": []
        }

def save_to_db(user_id, content, msg_type, risk_result):
    """【新增】存檔小幫手：把分析結果寫入資料庫"""
    db = SessionLocal()
    try:
        new_log = MessageLog(
            user_id=user_id,
            content=content,
            msg_type=msg_type,
            risk_score=risk_result['score'],
            risk_light=risk_result['light']
        )
        db.add(new_log)
        db.commit() # 確認寫入
        db.refresh(new_log)
        print(f"✅ 資料已存入 DB，ID: {new_log.id}")
    except Exception as e:
        print(f"❌ 資料庫存檔失敗: {e}")
    finally:
        db.close()

# --- API 路由區 ---

class TextMessage(BaseModel):
    user_id: str
    content: str

@app.post("/analyze/text")
async def analyze_text(data: TextMessage):
    print(f"收到文字: {data.content}")
    
    # 1. 分析
    risk_result = check_risk_level(data.content)
    
    # 2. 存檔 (呼叫存檔小幫手)
    save_to_db(data.user_id, data.content, "text", risk_result)
    
    return {
        "type": "text",
        "original_text": data.content,
        "risk_analysis": risk_result
    }

@app.post("/analyze/image")
async def analyze_image(user_id: str = Form(...), file: UploadFile = File(...)):
    print(f"收到圖片: {file.filename}")
    
    # 1. OCR
    file_content = await file.read()
    extracted_text = ocr_process(file_content)
    
    # 2. 分析
    risk_result = check_risk_level(extracted_text)

    # 3. 存檔 (呼叫存檔小幫手)
    save_to_db(user_id, extracted_text, "image", risk_result)

    return {
        "type": "image",
        "filename": file.filename,
        "ocr_text": extracted_text,
        "risk_analysis": risk_result
    }