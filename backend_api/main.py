from groq import Groq
import os
import base64
import re
import requests
import io
import time
import tempfile
import google.generativeai as genai
from dotenv import load_dotenv
from google.cloud import vision
from google.oauth2 import service_account
#from faster_whisper import WhisperModel

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

# 👇👇👇 加入這行：引入你剛剛測試成功的 RoBERTa 預測腳本
from predict_fraud import load_model, predict

app = FastAPI(title="Fraud Analysis Core API")

roberta_tokenizer, roberta_model = load_model()
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:0509@localhost/fraud_db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
#print("⏳ 正在載入語音辨識模型 faster-whisper (turbo / medium)...")
# 💡 優先嘗試 "large-v3-turbo"，如果啟動時報錯說找不到模型，再改成 "medium"
#whisper_model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
#print("✅ 語音辨識模型載入完成！")
# ---------
# AI 設定
# ---------
# 請在此處貼上你剛申請的 API Key
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

GOOGLE_SAFE_BROWSING_KEY = os.getenv("GOOGLE_SAFE_BROWSING_KEY")

try:
    print("🚀 正在初始化 Gemini 雙引擎架構...")
    
    # 取得當前 API Key 支援的所有模型
    available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]

    # ==========================================
    # 📰 [引擎 1：新聞專用] 尋找分析能力強且額度夠用的標準版
    # ==========================================
    # 優先順序：最新 3.5 標準版 -> 上一代 2 標準版(額度通常較放寬) -> 原本的 2.5(保底20次)
    priority_news = [
        'models/gemini-3.5-flash', 
        'models/gemini-2-flash',   
        'models/gemini-2.5-flash'  
    ]
    
    news_model_name = 'models/gemini-2.5-flash' # 預設保底
    for target in priority_news:
        if target in available_models:
            news_model_name = target
            break
            
    model_news = genai.GenerativeModel(news_model_name)
    print(f"✅ [新聞分析] 模型載入成功: {news_model_name}")

    # ==========================================
    # 💬 [引擎 2：客服專用] 使用 Lite 版本處理高頻率對話 (每日 ~1000 次)
    # ==========================================
    intent_model_name = 'models/gemini-3.5-flash-lite' 
    if 'models/gemini-3.5-flash-lite' not in available_models:
        if 'models/gemini-2.5-flash' in available_models:
            intent_model_name = 'models/gemini-2.5-flash'
        elif 'models/gemini-2-flash-lite' in available_models:
            intent_model_name = 'models/gemini-2-flash-lite'

    model_intent = genai.GenerativeModel(intent_model_name)
    print(f"✅ [客服意圖] 模型載入成功: {intent_model_name}")

    # ==========================================
    # 🎥 [引擎 3：多媒體/檔案深度分析專用] 走獨立配額，不佔用 3.5-flash/lite
    # ==========================================
    multimodal_candidates = [
        'models/gemini-3.6-flash',       # 🥇 首選：擁有巨大免費配額，處理影片極快且不怕超量
        'models/gemini-3.5-flash',       # 🥈 次選：穩定商用版 Flash
        'models/gemini-3.1-pro-preview', # 🥉 備援：若未來升級付費版 API，系統會自動使用
        'models/gemini-2.5-pro'
    ]
    multimodal_name = 'models/gemini-3.6-flash' 
    for m in multimodal_candidates:
        if m in available_models:
            multimodal_name = m
            break
    model_multimodal = genai.GenerativeModel(multimodal_name)
    print(f"✅ [多媒體檔案分析] 模型載入成功: {multimodal_name}")

except Exception as e:
    print(f"❌ 模型載入發生錯誤: {e}")
    # 萬一發生異常，雙雙使用最穩定的保底設定
    model_news = genai.GenerativeModel('models/gemini-2.5-flash')
    model_intent = genai.GenerativeModel('models/gemini-2.5-flash')
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
            
    return list(set(cleaned_urls))


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
        response = model_news.generate_content(
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
def check_user_intent_with_gemini(text: str):
    """
    智能意圖路由器：判斷是「對機器人說的閒聊/開場白」還是「需要偵測的疑似詐騙內容」
    """
    if len(text) > 100: 
        return None
        
    prompt = f"""
    你是防詐 LINE 機器人「真識監詐」的智能客服。
    
    【系統知識庫】：
    - 核心功能：支援「文字」、「圖片」與「語音」的防詐分析。
    - 選單功能：聊天室下方有圖文選單，包含「上傳可疑訊息」、「家庭群組」、「165通報」、「其他假新聞資訊」等功能。
    - 家庭群組功能：可以綁定家人，當家人收到詐騙訊息時會自動通知群組。可以在圖文選單找到設定。
    - 群組邀請：支援將本機器人「邀請到 LINE 群組」中進行自動防護。
    - 新聞功能：選單中的「其他假新聞資訊」包含最新詐騙新聞、防詐測驗與 165 儀表板。
    
    【任務】：判斷使用者的輸入是「一般對話/提問」還是「疑似詐騙」。(特別注意：日常閒聊非常習慣加上「啊、喔、呢、吧、呀」等語助詞，例如「早安啊」、「你好喔」，這是極為正常的真人對話。)
    
    【判斷規則】：
    1. 若是閒聊或詢問系統功能（例如：怎麼用家庭群組、可以傳圖片嗎、你好）：
       請依據【系統知識庫】的內容，用一句親切、自然、且「針對問題回答」的完整句子回應。
       ⚠️ 絕對不要每次都回覆一樣的話，必須針對使用者的具體提問給予解答或引導。
       
    2. 若包含以下任一特徵，請認定為疑似詐騙：
       - 包含網址連結
       - 包含投資、飆股、帳戶異常等話術
       - 明顯為轉傳對話或文章
       - 陌生人打招呼起手式（在嗎、吃飽沒）
       此類請【只能】回覆一個單字："ANALYZE"

    使用者輸入：
    {text}
    """
    try:
        # 💡 溫度調高到 0.5，給予創造力，避免死背答案；維持 1000 Tokens 確保不結巴
        response = model_intent.generate_content(
            prompt, 
            generation_config={
                "temperature": 0.5,
                "max_output_tokens": 1000
            }
        )
        result = response.text.strip()
        
        if "ANALY" in result.upper():
            return None
        else:
            return result 
            
    except Exception as e:
        print(f"⚠️ 意圖判斷發生錯誤: {e}")
        return None
# ---------
def multimodal_file_process(base64_data: str, file_ext: str = "mp4") -> str:
    """
    接收 Base64 影片或文件，透過 Gemini File API 進行快速辨識，萃取核心文字與話術
    """
    temp_file_path = None
    uploaded_file = None
    try:
        print(f"📂 正在處理 {file_ext} 檔案並發送至 Gemini 深度分析...")
        file_bytes = base64.b64decode(base64_data)
        
        # 建立暫存檔
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}") as tf:
            tf.write(file_bytes)
            temp_file_path = tf.name

        # 上傳到 Google 雲端
        uploaded_file = genai.upload_file(path=temp_file_path)

        # 針對影片等待轉碼 (若為 PDF 檔案通常直接 ACTIVE)
        start_time = time.time()
        timeout_seconds = 12  # 限制最多等 12 秒轉碼，嚴格守住 30 秒大關
        
        while uploaded_file.state.name == "PROCESSING":
            if time.time() - start_time > timeout_seconds:
                print("⚠️ 檔案處理超過時限，終止請求以防卡死")
                return "檔案處理時間過長，請確認檔案大小或長度後重試。"
            time.sleep(2)
            uploaded_file = genai.get_file(uploaded_file.name)

        if uploaded_file.state.name == "FAILED":
            return "檔案內容解析失敗。"

       # 萃取對話、畫面字幕或詐騙手法關鍵字
        prompt = """
        你現在是一個嚴密的防詐資料萃取系統。請仔細解析這份檔案或影片內容。
        
        ⚠️【最高輸出限制】：
        1. 絕對禁止輸出任何英文思考過程（嚴禁出現 exact match? 等字眼）。
        2. 只能輸出下方規定的格式，不准加上任何問候語或多餘解說。
        
        為確保後續系統能精準比對，請依照以下格式直接輸出：
        
        【涉詐實體】：
        (請「一字不漏」地提取所有的網址、LINE ID、機構名稱、人名，若無則寫無)
        
        【原句節錄】：
        (請提取任何涉及「投資、保證獲利、穩賺不賠、資金用途、解凍金、保密、違約」等敏感關鍵字的【完整原文段落】。⚠️ 重要：請盡量保留原本的語氣與具體話術，絕對不要過度濃縮或改寫成大意摘要！)
        """

        response = model_multimodal.generate_content(
            [uploaded_file, prompt],
            # 💡 將 max_output_tokens 放寬到 1000，確保長篇合約的關鍵字不會被截斷
            generation_config={"temperature": 0.2, "max_output_tokens": 1000} 
        )

        extracted_text = response.text.strip() if response and response.text else ""
        print(f"📂 [檔案內容萃取成功]: {extracted_text[:40]}...")
        return extracted_text

    except Exception as e:
        print(f"❌ 多媒體檔案解析失敗: {e}")
        return ""
    finally:
        # 清理暫存檔案與雲端空間
        if uploaded_file:
            try:
                genai.delete_file(uploaded_file.name)
            except Exception:
                pass
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
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

def audio_process(base64_audio):
    """使用 Groq API 遠端呼叫 Whisper Large-V3 (極速 + 完美支援台語)"""
    try:
        print("🎙️ 正在將語音發送至 Groq Whisper Large-V3 進行高效辨識...")
        
        # 1. 解碼 Node.js 傳來的 base64 音訊為二進制資料
        audio_bytes = base64.b64decode(base64_audio)
        
        # 2. 包裝成虛擬檔案，並賦予檔名（Groq 需要辨識副檔名來決定音訊格式，LINE 通常為 m4a）
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "audio.m4a"
        
        # 3. 呼叫 Groq API 進行語音轉文字
        transcription = groq_client.audio.transcriptions.create(
            file=(audio_file.name, audio_file.read()),
            model="whisper-large-v3", # 頂級台語辨識模型
            prompt="這是一段台灣常用的繁體中文與台語（閩南語）日常對話，請準確辨識。", # 💡 台語專用提示咒語
            response_format="text",  # 直接回傳純文字結果
            language="zh"            # 指定中文語系，大幅提升台語轉譯精準度
        )
        
        transcribed_text = transcription.strip()
        print(f"🎙️ [Groq 語音辨識成功]: {transcribed_text}")
        return transcribed_text
                
    except Exception as e:
        print(f"❌ Groq 語音辨識發生錯誤: {e}")
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
    source_type: str = "user" #🌟 新增來源判斷，預設為 user (私訊)

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
    # 🔴 毀滅級關鍵字 (最高風險，一旦出現幾乎 100% 是詐騙，60分)
    # 金融設定、帳戶異常與網購
    "解除分期": 60, "重複扣款": 60, "操作ATM": 60, "升級VIP": 60, "升級會員": 60, "簽署協議": 60,
    "安全帳戶": 60, "偵查不公開": 60, "解凍金": 60, "監管帳戶": 60, "涉及洗錢": 60, "涉及刑案": 60, "帳戶凍結": 60,
    "提供存摺": 60, "租借帳戶": 60, "提款卡": 60, "解除綁定": 60, "換地方聊": 60,
    # 點數、跨國偽冒與感情詐騙收網藉口
    "遊戲點數": 60, "禮物卡": 60, "Gash": 60, "MyCard": 60, "驗證碼": 60, "網銀密碼": 60, "提供帳密": 60, 
    "海關扣留": 60, "清關費": 60, "跨國包裹": 60, "金管會專員": 60, "加LINE": 60,
    "代收包裹": 60, "幫我登入": 60, "代操帳戶": 60, "海關卡住": 60, "幫我付": 60, "幫我匯": 60,

    # 🟠 高度危險組合字 (教唆說謊、切斷外界聯繫與情感金錢綑綁，50分)
    "資金用途": 50, "不能講": 50, "不要說": 50, "保密": 50, "臨櫃辦理": 50, 
    "裝潢尾款": 50, "親友借款": 50, "購車款": 50, "買虛幣": 50, # 應付銀行行員話術
    "不要接電話": 50, "秘密調查": 50, "保密協定": 50, "行員會問": 50, "跟單": 50, 
    "入金": 50, "出金": 50, "報牌": 50, 
    "共同未來": 50, "帶你賺錢": 50, "規劃未來": 50, "買房基金": 50, "結婚基金": 50, "繳保證金": 50,

    # 🟡 中高風險字 (投資、求職陷阱與賣慘人設，結合其他詞彙極危險，40分)
    # 假投資、飆股與虛擬幣
    "保證金": 40, "飆股": 40, "轉傳": 40, "轉發": 40, "保證獲利": 40, "穩賺不賠": 40, "老師帶單": 40, "助理": 40, "投資群": 40,
    "內線消息": 40, "高報酬": 40, "無風險": 40, "泰達幣": 40, "USDT": 40, "虛擬貨幣": 40, "智能合約": 40, "幣商": 40, "穩定獲利": 40,
    "申購中籤": 40, "抽中股票": 40, "違約交割": 40, "主力拉抬": 40, "代操": 40, "保本": 40, "帳號給我": 40,"壓注": 40,
    "打新": 40, "質押": 40,
    # 假求職、金融異常與感情詐騙人設
    "刷單": 40, "搶單": 40, "打字兼職": 40, "輕鬆賺錢": 40, "在家工作": 40, "日領現金": 40, "點讚任務": 40, "佣金": 40, "解任務": 40,
    "手續費": 40, "違約金": 40, "信用瑕疵": 40, "代辦貸款": 40, "綠界科技": 40, "第三方支付": 40, 
    "補足差額": 40, "系統錯誤": 40, "海外匯款": 40, "約定帳戶": 40, "網銀更新": 40, "帳戶異常": 40, 
    "包吃包住": 40, "出借網拍": 40,
    "外派": 40, "沒見過面": 40, "被前任傷害": 40, "周轉不靈": 40, "突發意外": 40, "無法視訊": 40,"借貸": 40,"高利貸": 40,

    # 🟢 警示關鍵字 (公家機關偽冒、急迫性情緒與快速拉近關係，30分)
    "盜刷": 30, "催繳": 30, "罰單未繳": 30, "逾期": 30, "健保卡違規": 30, "停權": 30,
    "eTag": 30, "國民年金": 30, "繳稅金": 30, "購買點數": 30, "簡訊連結": 30, "中獎": 30, "其他平台": 30, "互利": 30, "高額": 30, "理財": 30, "期貨": 30,
    "即將停權": 30, "24小時內": 30, "今日截止": 30, "點擊連結": 30, "網址登入": 30, "恢復權限": 30, "凍結": 30,"分紅": 30,"分潤": 30,
    "老婆": 30, "老公": 30, "寶貝": 30, "親愛的": 30, "緣分": 30, "懂我": 30, "副業": 30, "兼職": 30,"追加": 30,"下注": 30,"跟注": 30,

    # ⚪ 基礎生活情境字 (日常會用，作為加權輔助，20分)
    "投資": 20, "外資": 20, "匯款": 20, "轉帳": 20, "開戶": 20, "申購": 20, "抽籤": 20, "退款": 20, 
    "借款": 20, "周轉": 20, "融資": 20, "免費領取": 20, "急用錢": 20, 
    "虛擬帳戶": 20, "客服人員": 20, "財富自由": 20, "被動收入": 20, "財務漏洞": 20, 
    "交友軟體": 20, "網戀": 20, "報警": 20, "傳票": 20, "解約": 20, "扣款": 20,"分期": 20,
    "見面": 20, "交往": 20, "承諾": 20, "信任": 20, "禮物": 20, "出差": 20
}

def check_risk_level(text: str) -> dict:

    """一般使用者的關鍵字「權重」計分邏輯
    BYPASS_KEYWORDS = {"真識監詐", "我想上傳", "我要上傳", "我想要上傳", "如何上傳可疑訊息","如何上傳可疑訊息?", "我想通報165", "我想通報165!!!", "如何使用家庭群組", "如何使用家庭群組?", "如何把真識監詐拉進群組一起防詐", "如何把「真識監詐」拉進群組一起防詐?", "新手導覽", "新手教學", "邀請到群組", "邀請至群組", "家庭群組", "測驗", "假新聞", "其他假新聞", "其他假新聞資訊", "其他假新聞相關資訊", "其它假新聞", "其它假新聞資訊", "其它假新聞相關資訊", "上傳", "紅色警戒"}
    
    # 💡 只要命中關鍵字，直接回傳 None 不予評分，交給外層或 LINE 後台去處理
    clean_text_check = re.sub(r'[^\w\s]', '', text).strip()
    if any(kw in clean_text_check for kw in BYPASS_KEYWORDS):
        return None
    """
    detected_keywords = []
    score = 0
    
    # 掃描並加總權重分數
    for keyword, weight in FRAUD_KEYWORDS_WEIGHTED.items():
        if keyword in text:
            detected_keywords.append(f"「{keyword}」")
            score += weight 
    
    # 🛑 2. 天花板機制：無論中多少個字，最高不超過 80 分
    if score > 80:
        score = 80

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
            "reply_text": f"🚨 系統判定分數：{score} 分\n⚠️ 偵測到高風險關鍵字：{', '.join(detected_keywords)}。請提高警覺！",
            "keywords_str": f"\n⚠️ 命中關鍵字：{', '.join(detected_keywords)}"
        }
    else:
        return {
            "risk_level": "Green",
            "score": 0,
            "reply_text": "✅ 系統判定分數：0 分\n目前未偵測到明顯詐騙關鍵字，但仍請保持警覺。",
            "keywords_str": ""
        }

def get_official_reminder(text):
    """溫馨導航員 (權重積分版)：計算哪個官方網站關聯度最高，只推播冠軍"""
    db = SessionLocal() # 💡 只要在 try 的外面開啟一次連線就好
    try:
        site_scores = [] # 用來記錄每個網站的得分：[(site, score), ...]
        official_sites = db.query(OfficialURL).all()
        
        for site in official_sites:
            keywords = [kw.strip() for kw in site.keywords.split(',')]
            score = 0 # 每個網站一開始都是 0 分
            
            for kw in keywords:
                # 防呆：排除空字串與單字
                if len(kw) >= 2 and kw in text:
                    # 🚀 積分演算法：出現次數 * 關鍵字長度
                    score += text.count(kw) * len(kw) 
            
            # 只要這個網站有得分，就把它加入候選名單
            if score > 0:
                site_scores.append((site, score))
                
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
    finally:
        db.close() # 💡 這裡會負責完美關門

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
    audio_prefix = "" # 💡 貼心小標記，如果是語音，我們把辨識結果附在回覆開頭給長輩看

    # 防線 1-A：如果是圖片，先啟動 OCR 轉文字
    if msg_type == "image":
        print(f"🖼️ 收到使用者 {user_id} 圖片，啟動 OCR...")
        final_text = ocr_process(req.content)
        if not final_text:
            return {"risk_level": "Green", "reply_text": "圖片中未辨識到清晰的文字。"}

    # 🌟 防線 1-B：如果是錄音檔，啟動 faster-whisper (或 Groq) 語音轉文字！
    elif msg_type == "audio":
        print(f"🎙️ 收到使用者 {user_id} 語音訊息，啟動語音辨識...")
        final_text = audio_process(req.content)
        if not final_text:
            return {"risk_level": "Green", "reply_text": "語音中未辨識到清晰的語意內容，請盡量靠近麥克風說話。"}
        
        # 幫語音辨識結果做個引言，老人家看 LINE 才會清楚知道系統聽懂了什麼
        print(f"🎙️ [語音辨識結果]: {final_text}")
        audio_prefix = f"🎙️【系統已辨識您的語音內容】：\n「{final_text}」\n\n💡 「台灣國語」判斷結果可能不準確，請見諒🙇\n\n"

    # 🌟 防線 1-C：如果是影片或檔案，啟動 Gemini 獨立引擎萃取文字
    elif msg_type in ["video", "file"]:
        ext = "mp4" if msg_type == "video" else "pdf"
        print(f"📁 收到使用者 {user_id} {msg_type} 檔案，啟動多模態解析...")
        extracted_content = multimodal_file_process(req.content, file_ext=ext)
        if not extracted_content:
            return {"risk_level": "Green", "reply_text": "檔案中未偵測到足夠分析的文字或語音內容。"}
        
        final_text = extracted_content
        # 🌟 直接清空 prefix，保持版面乾淨，讓摘要留在下方的按鈕或內容區
        audio_prefix = ""

    print(f"👤 開始分析文字：{final_text[:20]}...")
    # ==========================================
    # 🌟 新增防線：Gemini 智能意圖路由器 (過濾閒聊開場白)
    # ==========================================
    # 💡 終極優化：只有私訊 (user) 才啟動 Gemini 判斷，群組直接跳過省資源！
    if req.source_type == "user":
        intent_reply = check_user_intent_with_gemini(final_text)
        if intent_reply:
            print(f"💬 [意圖判定] 判斷為閒聊，Gemini 自動回覆: {intent_reply}")
            # 💡 利用 "Command" 燈號，前台的 index.js 就不會印出紅綠燈，只會印出這段閒聊文字！
            return {
                "risk_level": "Command", 
                "reply_text": audio_prefix + intent_reply,
                "transcribed_text": final_text
            }
    else:
        print(f"🥷 [省資源模式] 來自群組的訊息，跳過 Gemini 意圖判斷，直奔防詐分析！")
    # ==========================================
    # 🛡️ 核心防詐判斷邏輯 (瀑布式篩選 - 完全維持原本寫法)
    # ==========================================
    risk_result = None

    # 防線 2：Google Safe Browsing 網址安全檢測 (外部 API)
    risk_result = check_google_safe_browsing(final_text)

    # 防線 3：Cofacts 真的假的 假訊息比對 (外部 API)
    if not risk_result:
        risk_result = check_cofacts_api(final_text)

    # 防線 4：比對政府網址黑名單 (本地資料庫)
    if not risk_result:
        risk_result = check_url_in_blacklist(final_text)
    
    # 🌟 防線 5：關鍵字打分 + RoBERTa 模型 RAG 動態加成 (雙軌混合計分)
    if not risk_result:
        try:
            print(f"🧠 [混合判斷啟動] 正在分析內容: {final_text[:30]}...")
            
            # 1. 取得關鍵字分數 (本身已有 80 分的天花板機制)
            keyword_data = check_risk_level(final_text)
            keyword_score = keyword_data["score"] if keyword_data else 0
            # 💡 安全抓取字串：如果有命中關鍵字，這包字串就會跟著最終結果顯示
            keyword_reminder = keyword_data.get("keywords_str", "") if keyword_data else ""

            # 2. 取得 RoBERTa + RAG 動態資料庫評分 (滿分 100)
            pred, raw_scam_p, raw_not_p = predict(final_text, roberta_tokenizer, roberta_model)
            database_weight = 0.85
            rag_roberta_score = (raw_scam_p * database_weight) + (0.15 * pred)
            roberta_score_100 = int(rag_roberta_score * 100)

            if roberta_score_100 > keyword_score:
                if keyword_score == 0:
                    # 條件一：模型贏了，但完全沒關鍵字 -> 模型分數打 8 折
                    score_percent = int(roberta_score_100 * 0.8)
                    print(f"🛡️ [動態調節] 模型勝出但無關鍵字，最終分數: {score_percent}")
                else:
                    # 條件二：模型贏了，且有少部分關鍵字 -> (模型分數 * 0.8) + 關鍵字分數
                    score_percent = int(roberta_score_100 * 0.8) + keyword_score
                    score_percent = min(score_percent, 100) # 確保總分不超過 100
                    print(f"⚖️ [動態調節] 模型勝出且含關鍵字({keyword_score}分)，最終分數: {score_percent}")
            else:
                # 條件三：關鍵字分數 >= 模型分數 -> 直接採用關鍵字分數
                if keyword_score > 40:
                    # 🌟 新增條件：關鍵字大於 40 分，乘以 1.34 倍，最高不超過 80 分
                    score_percent = int(keyword_score * 1.34)
                    score_percent = min(score_percent, 80)
                    print(f"🎯 [動態調節] 關鍵字勝出(>40分)，加權 1.34 倍，最終分數: {score_percent}")
                else:
                    # 關鍵字在 40 分(含)以下，維持原狀
                    score_percent = keyword_score
                    print(f"🎯 [動態調節] 關鍵字勝出，最終分數: {score_percent}")
            
            print(f"📊 [計分結果] 關鍵字={keyword_score}, 原始RoBERTa={roberta_score_100}, 最終採計總分={score_percent}")

            # 5. 依據最終總分轉換為系統需要的紅綠燈號
            if score_percent >= 80:
                risk_result = {
                    "risk_level": "Red",
                    "score": score_percent,
                    "reply_text": f"🚨 系統綜合判定分數：{score_percent} 分\n⚠️ 嚴重警告：經 AI 語意模型與關鍵字比對，此訊息具有極高詐騙風險！{keyword_reminder}",
                    "needs_explanation_button": True, 
                    "color": "red"
                }
            elif score_percent >= 40:
                risk_result = {
                    "risk_level": "Yellow",
                    "score": score_percent,
                    "reply_text": f"🚨 系統綜合判定分數：{score_percent} 分\n⚠️ 注意：此訊息疑似包含詐騙話術，請提高警覺！{keyword_reminder}",
                    "needs_explanation_button": True,
                    "color": "yellow"
                }
            else:
                risk_result = {
                    "risk_level": "Green",
                    "score": score_percent,
                    "reply_text": f"✅ 系統綜合判定分數：{score_percent} 分\nAI 判定此訊息目前看起來安全無虞，但仍請保持警覺。{keyword_reminder}"
                }
                
        except Exception as e:
            print(f"❌ RoBERTa 分析失敗，啟動備用機制: {e}")
            # 萬一模型運算當機，退回純關鍵字權重機制當作保底
            risk_result = check_risk_level(final_text)

    # ==========================================

    # 存檔與溫馨小提醒 (完全不用動)
    official_reminder_text = get_official_reminder(final_text)
    
    # 🌟 2. 終極防呆：明確檢查 risk_result 是否存在，絕對不讓 NoneType 報錯！
    if risk_result is not None:
        risk_result["reply_text"] = audio_prefix + risk_result["reply_text"] + official_reminder_text
        save_to_db(user_id, final_text, risk_result["risk_level"], risk_result["score"])
        return {
            "risk_level": risk_result["risk_level"],
            "reply_text": risk_result["reply_text"],
            "transcribed_text": final_text,
            "needs_explanation_button": risk_result.get("needs_explanation_button", False),
            "button_color": risk_result.get("color", "yellow")
        }
    else:
        # 當前面的防線全數回傳 None 時的保底綠燈處理
        fallback_text = f"{audio_prefix}目前未偵測到明顯詐騙關鍵字，但仍請保持警覺。{official_reminder_text}"
        save_to_db(user_id, final_text, "Green", 0)
        return {
            "risk_level": "Green",
            "reply_text": fallback_text,
            "transcribed_text": final_text
        }
# ==========================================
# 🌟 新增：針對特定訊息詢問 AI 詐騙原因的 API
# ==========================================
class ExplainRequest(BaseModel):
    user_id: str
    message_content: str  # 由於你前台可能沒有存資料庫的 ID，我們直接把原本的文字傳過來
    color: Literal["red", "yellow"]

@app.post("/analyze/explain")
def explain_fraud_reason(req: ExplainRequest = Body(...)):
    print(f"🔍 收到使用者 {req.user_id} 詢問 {req.color} 燈原因...")
    
    # 根據顏色切換隱藏的 Prompt
    if req.color == "red":
        target_question = "這段文字或圖片為什麼一定就是詐騙？"
    else:
        target_question = "這段文字或圖片為什麼可能是詐騙？"
        
    prompt = f"""
    任務：請根據以下內容，回答「{target_question}」
    待分析內容：{req.message_content}
    
    限制：
    1. 內容多以繁體中文、台灣國語或英文為主，請用繁體中文，以專業客服語氣回答。
    2. 用一句話（約 10 到 20 字）直接點出具體的詐騙特徵（例如：包含飆股關鍵字、要求匯款、圖片排版異常等）。
    3. 開頭直接說明原因，不需要說「好的」或重複問題。
    """
    
    try:
        # 使用你已經設定好的 model_intent (3.5-flash-lite)
        response = model_intent.generate_content(prompt)
        explanation = response.text.strip()
        print(f"💡 [AI 解釋結果]: {explanation}")
        
        return {"explanation": explanation}
        
    except Exception as e:
        print(f"❌ 詢問解釋發生錯誤: {e}")
        return {"explanation": "系統暫時無法提供詳細解釋，但請務必對此訊息保持警覺！"}
# .\.venv\Scripts\Activate 啟動虛擬環境
# python -m uvicorn main:app --reload 啟動 FastAPI 中樞服務

#  FastAPI 中樞服務跑起來
#/analyze API 穩定
#歷史比對模組完成（命中就回，不走 AI）
#Git 環境乾淨（.venv / __pycache__ 都處理好）
