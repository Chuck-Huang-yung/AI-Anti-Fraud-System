import base64
import re
from google.cloud import vision
from google.oauth2 import service_account
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
genai.configure(api_key="AIzaSyBIBrg7QQHhhr9lEeTkpfFGM413R5mqSlc")

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
class FraudLink(Base):
    __tablename__ = "fraud_links"
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, index=True)
    source = Column(String)
    created_at = Column(DateTime, default=datetime.now)

Base.metadata.create_all(bind=engine)

CREDENTIALS_FILE = "../credentials.json"

def ocr_process(base64_img):
    """將 Base64 圖片轉成文字"""
    try:
        credentials = service_account.Credentials.from_service_account_file(CREDENTIALS_FILE)
        client = vision.ImageAnnotatorClient(credentials=credentials)
        image = vision.Image(content=base64.b64decode(base64_img))
        response = client.text_detection(image=image)
        texts = response.text_annotations
        return texts[0].description if texts else ""
    except Exception as e:
        print(f"❌ OCR 錯誤: {e}")
        return ""

def check_url_in_blacklist(text):
    """檢查文字中是否包含黑名單網址"""
    url_pattern = re.compile(r'https?://[^\s]+|www\.[^\s]+')
    found_urls = url_pattern.findall(text)
    if not found_urls:
        return None 

    db = SessionLocal()
    try:
        for url in found_urls:
            clean_url = url.strip()
            match = db.query(FraudLink).filter(FraudLink.url == clean_url).first()
            if match:
                return {
                    "risk_level": "Red",
                    "score": 100,
                    "reply_text": f"🚨 系統判定分數：100 分\n⚠️ 警告：偵測到危險網址「{clean_url}」，該連結已列在政府防詐黑名單中，絕對不要點擊！"
                }
    finally:
        db.close()
    return None

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
    message_type: str # 新增欄位，用來判斷是 text 還是 image
    content: str      # 文字內容 或 Base64 字串

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
FRAUD_KEYWORDS_WEIGHTED = {
    # 🔴 毀滅級關鍵字 (最高風險 - 60分)
    # 網購、金融設定解除與帳戶安全
    "解除分期": 60, "重複扣款": 60, "操作ATM": 60, "升級高級會員": 60, "取消訂單": 60, "蝦皮簽署": 60,
    "安全帳戶": 60, "偵查不公開": 60, "解凍金": 60, "監管帳戶": 60, "涉及洗錢": 60, "涉及刑案": 60, "帳戶凍結": 60,
    # 點數與跨國詐騙
    "遊戲點數": 60, "Apple Store卡": 60, "蘋果禮物卡": 60, "驗證碼給我": 60, "提供帳密": 60, "網銀密碼": 60,
    "海關扣留": 60, "清關費": 60, "聯合國醫生": 60, "戰地軍官": 60,

    # 🟠 高度危險組合字 (教唆說謊與高風險誘餌 - 50分)
    "資金用途": 50, "不能講": 50, "不要說": 50, "不要告訴": 50, "臨櫃辦理": 50, "房屋裝修": 50, "親友借款": 50,

    # 🟡 中高風險字 (投資、求職與貸款陷阱 - 40分)
    # 假投資與飆股
    "保證金": 40, "飆股": 40, "保證獲利": 40, "穩賺不賠": 40, "老師帶單": 40, "助理小編": 40, "投資群組": 40,
    "內線消息": 40, "高報酬": 40, "無風險": 40, "泰達幣": 40, "USDT": 40, "虛擬貨幣": 40, "智能合約": 40, "幣商": 40,
    # 假求職與金融異常
    "刷單": 40, "搶單": 40, "打字兼職": 40, "輕鬆賺錢": 40, "在家工作": 40, "日領現金": 40, "點讚任務": 40, "佣金": 40,
    "手續費": 40, "違約金": 40, "信用瑕疵": 40, "代辦貸款": 40, "綠界科技": 40, "第三方支付": 40, 
    "補足差額": 40, "系統錯誤": 40, "海外匯款": 40, "設定約定帳戶": 40, "網銀更新": 40, "帳戶異常": 40,

    # 🟢 警示關鍵字 (公家機關偽冒與常見詐騙名目 - 30分)
    "信用卡盜刷": 30, "警察局": 30, "地檢署": 30, "健保局": 30, "監理站": 30, "台水": 30, "台電": 30, "催繳": 30, 
    "罰單未繳": 30, "eTag": 30, "國民年金": 30, "繳稅金": 30, "購買點數": 30, "簡訊連結": 30, "中獎": 30,

    # ⚪ 基礎生活情境字 (日常會用，但常被詐騙利用 - 20分)
    "投資": 20, "外資": 20, "匯款": 20, "轉帳": 20, "開戶": 20, "申購": 20, "抽籤": 20, "退款": 20, 
    "借款": 20, "周轉": 20, "融資": 20, "包裹": 20, "宅配": 20, "免費領取": 20, "急用錢": 20, 
    "虛擬帳戶": 20, "客服人員": 20, "理財顧問": 20, "財富自由": 20, "被動收入": 20, "財務漏洞": 20, 
    "交友軟體": 20, "網戀": 20
}

def check_risk_level(text):
    """一般使用者的關鍵字「權重」計分邏輯"""
    detected_keywords = []
    score = 0
    
    # 掃描並加總權重分數
    for keyword, weight in FRAUD_KEYWORDS_WEIGHTED.items():
        if keyword in text:
            detected_keywords.append(f"「{keyword}」")
            score += weight 
    
    # 🛑 2. 天花板機制：無論中多少個字，最高不超過 65 分
    if score > 65:
        score = 65

    # 🚦 依據最終分數判定燈號
    if score >= 80:
        risk_level = "Red"
    elif score >= 40:
        risk_level = "Yellow"
    else:
        risk_level = "Green"

    # 回傳結果
    if score > 0:
        return {
            "risk_level": risk_level,
            "score": score,
            "reply_text": f"🚨 系統判定分數：{score} 分\n⚠️ 偵測到高風險關鍵字：{', '.join(detected_keywords)}。請提高警覺！"
        }
    else:
        return {
            "risk_level": "Green",
            "score": 0,
            "reply_text": "✅ 系統判定分數：0 分\n目前未偵測到明顯詐騙關鍵字，但仍請保持警覺。"
        }


# --- API 路由分流 ---
# ⚠️ 注意：這裡把 response_model=AnalyzeResponse 拿掉了，讓回傳格式更自由
@app.post("/analyze/text") 
def analyze(req: AnalyzeRequest = Body(...)):
    user_id = req.user_id
    msg_type = req.message_type
    
    # 軌道 A：新聞推播 (Gemini)
    if user_id == "news_bot_system":
        ai_result = ai_analyze(req.content) 
        return {"risk_level": ai_result["risk_level"], "reply_text": ai_result["reply_text"]}

    # 軌道 B：一般使用者
    final_text = req.content

    # 防線 1：如果是圖片，先啟動 OCR 轉文字
    if msg_type == "image":
        print(f"🖼️ 收到使用者 {user_id} 圖片，啟動 OCR...")
        final_text = ocr_process(req.content)
        if not final_text:
            return {"risk_level": "Green", "reply_text": "圖片中未辨識到清晰的文字。"}

    print(f"👤 開始分析文字：{final_text[:20]}...")

    # 防線 2：比對政府網址黑名單
    risk_result = check_url_in_blacklist(final_text)
    
    # 防線 3：如果網址沒中，比對關鍵字
    if not risk_result:
        risk_result = check_risk_level(final_text)

    # 存檔 (記得把你原本的 save_to_db 加上 msg_type 以利後續分析)
    save_to_db(user_id, final_text, risk_result["risk_level"], risk_result["score"])

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
