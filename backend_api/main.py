import os
import base64
import re
import requests
import google.generativeai as genai
from dotenv import load_dotenv
from google.cloud import vision
from google.oauth2 import service_account

# 啟動環境變數載入器 (這行非常重要，它會去讀取 backend_api 裡面的 .env)
load_dotenv()

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


app = FastAPI(title="Fraud Analysis Core API")
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:0509@localhost/fraud_db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
# ---------
# AI 設定
# ---------
# 請在此處貼上你剛申請的 API Key
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

GOOGLE_SAFE_BROWSING_KEY = os.getenv("GOOGLE_SAFE_BROWSING_KEY")

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

# 
class FraudURL(Base):
    __tablename__ = "fraud_urls"
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(2048), index=True, unique=True)
    description = Column(String(500))
    source = Column(String(100))

Base.metadata.create_all(bind=engine)
#

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
    """檢查文字中的網址是否存在於 10 萬筆政府黑名單資料庫中"""
    
    # 用正則表達式把使用者傳來文字裡的「所有網址」抓出來
    url_pattern = re.compile(r'https?://[^\s]+|www\.[^\s]+')
    found_urls = url_pattern.findall(text)
    
    if not found_urls:
        return None # 沒找到網址就直接放行，讓下一關處理

    db = SessionLocal()
    try:
        # 逐一檢查抓出來的每一個網址
        for url in found_urls:
            # 清理網址，確保比對準確 (去掉頭尾空白，或一些奇怪的結尾符號)
            clean_url = url.strip(".,!?\"'")
            
            # 🚀 在 10 萬筆資料中進行秒殺查詢 (使用 FraudURL)
            bad_site = db.query(FraudURL).filter(FraudURL.url.contains(clean_url)).first()
            
            if bad_site:
                # 只要中了一個惡意網址，直接亮紅燈並回傳詳細資料！
                return {
                    "risk_level": "Red",
                    "score": 100,
                    "reply_text": (
                        f"🚨 系統判定分數：100 分\n"
                        f"⚠️ 嚴重警告：此網址已列入政府黑名單！\n"
                        f"----------------------\n"
                        f"❌ 惡意網址：{bad_site.url}\n"
                        f"🏷️ 網站類型：{bad_site.description}\n"
                        f"🏛️ 通報來源：{bad_site.source}\n"
                        f"----------------------\n"
                        f"請立即停止點擊並封鎖對方！"
                    )
                }
            old_bad_site = db.query(FraudLink).filter(FraudLink.url == clean_url).first()
            
            if old_bad_site:
                return {
                    "risk_level": "Red",
                    "score": 100,
                    "reply_text": (
                        f"🚨 系統判定分數：100 分\n"
                        f"⚠️ 嚴重警告：偵測到危險網址「{clean_url}」\n"
                        f"該連結已列在早期防詐黑名單中，絕對不要點擊！"
                    )
                }
    finally:
        db.close() # 記得關閉資料庫連線

    return None # 如果所有網址都很安全，就放行

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

# --- 外部 API 1: Google Safe Browsing ---
def check_google_safe_browsing(text):
    """抓取文字中的網址，丟給 Google 檢查是否為惡意網站"""
    # 用正則表達式把網址找出來
    url_pattern = re.compile(r'https?://[^\s]+|www\.[^\s]+')
    found_urls = url_pattern.findall(text)
    
    if not found_urls:
        return None # 沒網址就不檢查
        
    api_url = f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={GOOGLE_SAFE_BROWSING_KEY}"
    
    # 按照 Google 規定的格式打包網址
    payload = {
        "client": {"clientId": "my-anti-fraud-bot", "clientVersion": "1.0"},
        "threatInfo": {
            "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "POTENTIALLY_HARMFUL_APPLICATION"],
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": u} for u in found_urls]
        }
    }
    
    try:
        res = requests.post(api_url, json=payload, timeout=5)
        data = res.json()
        
        # 🚨 如果回傳的 JSON 裡面有 matches，代表是認證的惡意網站！
        if "matches" in data:
            bad_url = data["matches"][0]["threat"]["url"]
            return {
                "risk_level": "Red",
                "score": 100,
                "reply_text": f"🚨 系統判定分數：100 分\n⚠️ 嚴重警告：Google 資安系統判定「{bad_url}」為惡意釣魚/木馬網站，絕對不要點擊！"
            }
    except Exception as e:
        print(f"❌ Google API 連線錯誤: {e}")
        
    return None

# --- 外部 API 2: Cofacts 真的假的 ---
def check_cofacts_api(text):
    """比對 Cofacts 查核資料庫 (使用 GraphQL 語法)"""
    # 字數太少就不用浪費時間查了
    if len(text) < 10: 
        return None 

    url = "https://cofacts.api.g0v.tw/graphql"
    
    # GraphQL 的查詢語法 (找最相似的一筆資料)
    query = """
    query($text: String!) {
      ListArticles(filter: {moreLikeThis: {like: $text}}, first: 1) {
        edges {
          node {
            articleReplies {
              reply {
                type
              }
            }
          }
        }
      }
    }
    """
    try:
        res = requests.post(url, json={"query": query, "variables": {"text": text}}, timeout=5)
        data = res.json()
        
        edges = data.get("data", {}).get("ListArticles", {}).get("edges", [])
        if edges:
            # 檢查第一筆最像的資料，看有沒有查核員標記它為 RUMOR (不實訊息)
            replies = edges[0].get("node", {}).get("articleReplies", [])
            for r in replies:
                if r.get("reply", {}).get("type") == "RUMOR":
                    return {
                        "risk_level": "Red",
                        "score": 100,
                        "reply_text": "🚨 系統判定分數：100 分\n⚠️ 警告：這段文字已被【Cofacts 真的假的】查核平台標記為「不實訊息或詐騙」，請千萬不要上當！"
                    }
    except Exception as e:
        print(f"❌ Cofacts 連線錯誤: {e}")
        
    return None

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

    # ==========================================
    # 🛡️ 核心防詐判斷邏輯 (瀑布式篩選)
    # ==========================================
    risk_result = None

    # 防線 2：Google Safe Browsing 網址安全檢測 (外部 API)
    risk_result = check_google_safe_browsing(final_text)

    # 防線 3：Cofacts 真的假的 假訊息比對 (外部 API)
    if not risk_result:
        risk_result = check_cofacts_api(final_text)

    # 防線 4：比對政府網址黑名單 (你原本的本地資料庫)
    if not risk_result:
        risk_result = check_url_in_blacklist(final_text)
    
    # 防線 5：如果前面的最高風險都沒中，啟動百大關鍵字權重 (你原本的邏輯)
    if not risk_result:
        risk_result = check_risk_level(final_text)

    # ==========================================

    # 存檔 (完美銜接你原本寫好的邏輯，完全不用動)
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
