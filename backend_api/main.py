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
def extract_and_clean_urls(text: str) -> list:
    """
    終極網址提取器：智慧黏合 OCR 斷行，且不誤食下方無關文字
    """
    if not text:
        return []
        
    # 1. 智慧黏合：只把 http:// 或網址特定符號 (/, ., -, =, ?) 後面的換行與空白消掉
    # 這樣 malware.html 後面的換行就會被保留，不會跟下一行的文字黏在一起
    text = re.sub(r'(https?://)\s+', r'\1', text)
    text = re.sub(r'([/.\-?=&#])\s+', r'\1', text)
    
    # 2. 嚴格提取：正則範圍【絕對不能】包含 \n 或 \r，只要遇到真正的換行就會自動停止
    url_pattern = re.compile(r'https?://[a-zA-Z0-9.\-_/?=&%#]+')
    found_urls = url_pattern.findall(text)
    
    cleaned_urls = []
    for url in found_urls:
        # 3. 剝除尾端雜質 (包含 OCR 容易誤讀產生的 ...)
        clean_url = url.rstrip(".,;:!?()[]{}...")
        if clean_url and len(clean_url) > 8:
            cleaned_urls.append(clean_url)
            
    return cleaned_urls


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

#
class OfficialURL(Base):
    __tablename__ = "official_urls"
    id = Column(Integer, primary_key=True, index=True)
    keywords = Column(String(500))    # 觸發關鍵字 (用逗號分隔，例如 "報稅,繳稅,所得稅")
    site_name = Column(String(100))   # 官方網站名稱 (例如 "財政部電子申報繳稅服務網")
    url = Column(String(500))         # 真正的官方網址
    category = Column(String(50))     # 分類 (例如 "政府機關", "民生事業")

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
    """
    結合「終極網址提取器」與資料庫精準比對：
    先在 Python 層把斷行網址接好，再進入資料庫比對，大幅減輕資料庫運算負擔！
    """
    
    # 1. 呼叫我們寫好的清洗大師，把網址精準抓出來
    found_urls = extract_and_clean_urls(text)
    
    if not found_urls:
        return None 

    db = SessionLocal()
    try:
        for clean_url in found_urls:
            print(f"🔎 [防線4] 正在比對本地黑名單網址: [{clean_url}]")
            
            # 2. 拔除網址前綴 (http://, https://, www.)，只拿核心網址來比對，增加命中率
            core_url = re.sub(r'^https?://(www\.)?', '', clean_url)
            
            # 3. 使用 SQL 的 ILIKE 進行輕量級模糊比對 (速度極快)
            # 只要資料庫的 URL 欄位包含這個核心網址，就宣告攔截！
            bad_site = db.query(FraudURL).filter(FraudURL.url.ilike(f"%{core_url}%")).first()
            
            if bad_site:
                print(f"💥【資料庫精準命中】成功攔截惡意資料: [{bad_site.url}]")
                return {
                    "risk_level": "Red",
                    "score": 100,
                    "reply_text": (
                        f"🚨 系統判定分數：100 分\n"
                        f"⚠️ 嚴重警告：此網址已列入政府黑名單！\n"
                        f"----------------------\n"
                        f"❌ 惡意網址：{bad_site.url.strip()}\n"
                        f"🏷️ 網站類型：{getattr(bad_site, 'description', '惡意網站')}\n"
                        f"🏛️ 通報來源：{getattr(bad_site, 'source', '165 反詐騙')}\n"
                        f"----------------------\n"
                        f"請立即停止點擊並封鎖對方！"
                    )
                }
                
            # 4. 同步比對早期防詐黑名單 (FraudLink)
            old_bad_site = db.query(FraudLink).filter(FraudLink.url.ilike(f"%{core_url}%")).first()
            
            if old_bad_site:
                print(f"💥【資料庫精準命中】舊庫危險網址: [{old_bad_site.url}]")
                return {
                    "risk_level": "Red",
                    "score": 100,
                    "reply_text": (
                        f"🚨 系統判定分數：100 分\n"
                        f"⚠️ 嚴重警告：偵測到危險網址\n"
                        f"該連結已列在早期防詐黑名單中，絕對不要點擊！"
                    )
                }

    except Exception as e:
        print(f"❌ 查詢黑名單資料庫失敗: {e}")
    finally:
        db.close()

    # 🌟 沒查到一律回傳 None，確保主流程可以順利往下流動
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
    # 🔴 毀滅級關鍵字 (最高風險，一旦出現幾乎 100% 是詐騙 - 60分)
    # 網購、金融設定解除與人頭帳戶
    "解除分期": 60, "重複扣款": 60, "操作ATM": 60, "升級高級會員": 60, "蝦皮簽署": 60,
    "安全帳戶": 60, "偵查不公開": 60, "解凍金": 60, "監管帳戶": 60, "涉及洗錢": 60, "涉及刑案": 60, "帳戶凍結": 60,
    "提供存摺": 60, "租借帳戶": 60, "交出提款卡": 60, "解除綁定": 60,"換地方聊": 60,
    # 點數、跨國詐騙與權威偽冒
    "遊戲點數": 60, "Apple Store卡": 60, "蘋果禮物卡": 60, "驗證碼給我": 60, "提供帳密": 60, "網銀密碼": 60,
    "海關扣留": 60, "清關費": 60, "聯合國醫生": 60, "戰地軍官": 60, "跨國包裹": 60, "金管會專員": 60, "加LINE": 60,

    # 🟠 高度危險組合字 (教唆說謊、切斷外界聯繫的心理戰 - 50分)
    "資金用途": 50, "不能講": 50, "不要說": 50, "不要告訴": 50, "臨櫃辦理": 50, 
    "房屋裝修": 50, "裝潢尾款": 50, "親友借款": 50, "購車款": 50, "買賣虛擬幣": 50, # 這些是詐騙集團教受害者應付銀行行員的標準話術
    "不要接電話": 50, "秘密調查": 50, "保密協定": 50, "行員會問": 50,

    # 🟡 中高風險字 (投資、求職與貸款陷阱，結合其他詞彙極度危險 - 40分)
    # 假投資與飆股 (新增近期氾濫的抽籤與違約交割)
    "保證金": 40, "飆股": 40, "轉傳": 40, "轉發": 40, "保證獲利": 40, "穩賺不賠": 40, "老師帶單": 40, "助理小編": 40, "投資群組": 40,
    "內線消息": 40, "高報酬": 40, "無風險": 40, "泰達幣": 40, "USDT": 40, "虛擬貨幣": 40, "智能合約": 40, "幣商": 40,
    "申購中籤": 40, "抽中股票": 40, "違約交割": 40, "主力拉抬": 40, "代操": 40, "保本": 40,
    # 假求職與金融異常
    "刷單": 40, "搶單": 40, "打字兼職": 40, "輕鬆賺錢": 40, "在家工作": 40, "日領現金": 40, "點讚任務": 40, "佣金": 40,
    "手續費": 40, "違約金": 40, "信用瑕疵": 40, "代辦貸款": 40, "綠界科技": 40, "第三方支付": 40, 
    "補足差額": 40, "系統錯誤": 40, "海外匯款": 40, "設定約定帳戶": 40, "網銀更新": 40, "帳戶異常": 40, 
    "包吃包住": 40, "出借網拍": 40,

    # 🟢 警示關鍵字 (公家機關偽冒、急迫性情緒與常見詐騙名目 - 30分)
    "信用卡盜刷": 30, "催繳": 30, "罰單逾期": 30, "水費催繳": 30, "燃料費逾期": 30, "健保卡違規": 30, # 新增民生偽冒
    "eTag": 30, "國民年金": 30, "繳稅金": 30, "購買點數": 30, "簡訊連結": 30, "中獎": 30, "其他平台": 30,
    "即將停權": 30, "24小時內": 30, "今日截止": 30, "點擊連結": 30, "網址登入": 30, "恢復權限": 30, # 新增急迫性感知的詞彙

    # ⚪ 基礎生活情境字 (日常會用，但常被詐騙利用，作為加權輔助 - 20分)
    "投資": 20, "外資": 20, "匯款": 20, "轉帳": 20, "開戶": 20, "申購": 20, "抽籤": 20, "退款": 20, 
    "借款": 20, "周轉": 20, "融資": 20, "免費領取": 20, "急用錢": 20, 
    "虛擬帳戶": 20, "客服人員": 20, "理財顧問": 20, "財富自由": 20, "被動收入": 20, "財務漏洞": 20, 
    "交友軟體": 20, "網戀": 20, "報警": 20, "傳票": 20, "解約": 20, "扣款": 20
}

def check_risk_level(text: str) -> dict:

    """一般使用者的關鍵字「權重」計分邏輯"""
    BYPASS_KEYWORDS = {"如何上傳可疑訊息?", "我想通報165!!!", "如何使用家庭群組?", "如何把「真識監詐」拉進群組一起防詐?", "新手導覽", "新手教學", "邀請到群組", "邀請至群組", "家庭群組", "其他假新聞", "其他假新聞資訊", "上傳"}
    
    # 移除前後空格後進行精準比對，若命中則直接回傳 0 分
    if text.strip() in BYPASS_KEYWORDS:
        return None
    
# 🔥 呼叫終極清洗大師
    clean_urls = extract_and_clean_urls(text)
    
    if clean_urls:
        for clean_url in clean_urls:
            print(f"🎯【網址通解器】成功修復並提取網址: [{clean_url}]")
            
            # 第一次查詢：直接丟給底層資料庫
            db_result = check_url_in_blacklist(clean_url)
            
            # 第二次查詢（補救機制）
            if db_result is None:
                domain_match = re.search(r'https?://(?:www\.)?([a-zA-Z0-9\-]+)', clean_url)
                if domain_match:
                    core_keyword = domain_match.group(1)
                    if len(core_keyword) > 4:
                        print(f"🔄 補救機制啟動：使用網址核心特徵 [{core_keyword}] 進行資料庫再查詢...")
                        db_result = check_url_in_blacklist(core_keyword)
            
            # 🌟【絕殺關鍵點】只要底層資料庫有命中紅燈大禮包，立刻 return！
            if db_result is not None:
                print(f"🛑【大腦攔截成功】網址命中黑名單，直接回傳紅燈 100 分！")
                return db_result
            
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

def get_official_reminder(text):
    """溫馨導航員 (權重積分版)：計算哪個官方網站關聯度最高，只推播冠軍"""
    try:
        db = SessionLocal()
        site_scores = [] # 用來記錄每個網站的得分：[(site, score), ...]
        official_sites = db.query(OfficialURL).all()
        
        for site in official_sites:
            keywords = [kw.strip() for kw in site.keywords.split(',')]
            score = 0 # 每個網站一開始都是 0 分
            
            for kw in keywords:
                # 防呆：排除空字串與單字
                if len(kw) >= 2 and kw in text:
                    # 🚀 積分演算法：出現次數 * 關鍵字長度
                    # 例如命中「交通違規」(4字) 1次得 4 分；命中「罰單」(2字) 2次也得 4 分
                    score += text.count(kw) * len(kw) 
            
            # 只要這個網站有得分，就把它加入候選名單
            if score > 0:
                site_scores.append((site, score))
                
        db.close()
        
        # 如果沒有任何網站得分，就回傳空字串
        if not site_scores:
            return ""
            
        # 🏆 尋找冠軍：依照分數 (x[1]) 由大到小排序
        site_scores.sort(key=lambda x: x[1], reverse=True)
        
        # 取第一名 (分數最高的那個網站)
        best_site = site_scores[0][0]
        
        return f"\n\n💡 溫馨小提醒：如果您需要辦理【{best_site.site_name}】相關業務，請務必認明官方網站：\n👉 {best_site.url}"
        
    except Exception as e:
        print(f"⚠️ 導航小幫手發生異常: {e}")
        return ""

# --- 外部 API 1: Google Safe Browsing ---
def check_google_safe_browsing(text):
    """抓取文字中的網址，丟給 Google 檢查是否為惡意網站"""
    
    # 🔥 直接呼叫我們寫好的終極清洗大師
    found_urls = extract_and_clean_urls(text)
    
    if not found_urls:
        return None # 沒網址就不檢查
        
    print(f"🌍 [Google防線] 準備送往 Google 檢查的修復網址: {found_urls}")
    
    api_url = f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={GOOGLE_SAFE_BROWSING_KEY}"
    
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
        
        if "matches" in data:
            bad_url = data["matches"][0]["threat"]["url"]
            print(f"🛑 [Google防線] 成功攔截惡意網址: {bad_url}")
            return {
                "risk_level": "Red",
                "score": 100,
                "reply_text": f"🚨 系統判定分數：100 分\n⚠️ 嚴重警告：Google 資安系統判定「{bad_url}」為惡意釣魚/木馬網站，絕對不要點擊！"
            }
    except Exception as e:
        print(f"❌ Google API 連線錯誤: {e}")
        
    return None


def check_cofacts_api(text):
    """比對 Cofacts 查核資料庫 (放寬搜尋範圍版)"""
    if len(text) < 10: 
        return None 

    # 【放寬秘訣 1：過濾雜訊】把標點符號與特殊字元拿掉，讓搜尋引擎聚焦在詞彙
    clean_text = re.sub(r'[^\w\s]', '', text) 

    url = "https://api.cofacts.tw/graphql"
    
    # 【放寬秘訣 2：擴大打擊面】把 first 提升到 10，檢查前 10 名最像的文章
    query = """
    query($text: String!) {
      ListArticles(filter: {moreLikeThis: {like: $text}}, orderBy: [{_score: DESC}], first: 10) {
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
        # 這裡改用 clean_text 送出搜尋
        res = requests.post(url, json={"query": query, "variables": {"text": clean_text}}, timeout=5)
        data = res.json()
        
        edges = data.get("data", {}).get("ListArticles", {}).get("edges", [])
        
        if edges:
            # 檢查抓回來的前 10 筆資料
            for edge in edges:
                replies = edge.get("node", {}).get("articleReplies", [])
                for r in replies:
                    # 只要 10 筆中有 1 筆是 RUMOR，就抓出來！
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
    official_reminder_text = get_official_reminder(final_text)
    risk_result["reply_text"] += official_reminder_text

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
