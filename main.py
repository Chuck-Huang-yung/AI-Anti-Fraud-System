# main.py (包含家庭協防邏輯的完整修正版)
import os
import re
from fastapi import FastAPI, File, UploadFile, Form
from pydantic import BaseModel
from typing import Optional
from google.cloud import vision
from google.oauth2 import service_account

# 資料庫套件
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

app = FastAPI()

# --- 設定區 ---
CREDENTIALS_FILE = "credentials.json"
# 請確認密碼是否正確
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:0509@localhost/fraud_db"

# 建立資料庫連線引擎
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- 定義資料表模型 (Schema) ---

# 1. 訊息紀錄表
class MessageLog(Base):
    __tablename__ = "message_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)      
    content = Column(Text)                    
    msg_type = Column(String)                 
    risk_score = Column(Integer)              
    risk_light = Column(String)               
    created_at = Column(DateTime, default=datetime.now) 

# 2. 家庭關係表
class UserRelation(Base):
    __tablename__ = "user_relations"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)      # Line User ID
    group_id = Column(String, index=True)     # Family Group ID
    role = Column(String)                     # Role (e.g., Mom, Son)

class FraudLink(Base):
    __tablename__ = "fraud_links"
    
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, index=True) # 網址 (設為唯一，避免重複)
    source = Column(String)                       # 資料來源 (例如: 政府OpenData)
    created_at = Column(DateTime, default=datetime.now)

# 初始化資料庫
Base.metadata.create_all(bind=engine)

# --- 詐騙關鍵字黑名單 ---
FRAUD_KEYWORDS = [
    "解除分期", "重複扣款", "操作ATM", "操作網銀", "購買點數", 
    "MyCard", "Gash", "保證金", "解凍金", "安全帳戶", "監管帳戶",
    "匯款", "轉帳", "補償金", "誤設為批發商", "誤刷",
    "保證獲利", "穩賺不賠", "飆股", "內線消息", "老師帶牌", 
    "代操", "虛擬貨幣", "USDT", "比特幣", "投資群組", "快速回本",
    "高報酬", "低風險", "抽股票",
    "涉及刑案", "偵查不公開", "拘提", "通緝", "帳戶凍結", 
    "刑事責任", "限時", "立即處理", "逾期", "強制執行",
    "法院傳票", "警察局", "地檢署",
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
    """存檔小幫手"""
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
        db.commit()
    except Exception as e:
        print(f"❌ 資料庫存檔失敗: {e}")
    finally:
        db.close()

def find_family_members(user_id):
    """【新增】協防小幫手：給一個 ID，找出他的全家人 ID"""
    db = SessionLocal()
    family_list = []
    try:
        # 1. 先查這個人屬於哪個家
        me = db.query(UserRelation).filter(UserRelation.user_id == user_id).first()
        if me:
            # 2. 再查這個家裡還有誰 (排除自己)
            others = db.query(UserRelation).filter(
                UserRelation.group_id == me.group_id,
                UserRelation.user_id != user_id
            ).all()
            
            for member in others:
                family_list.append(member.user_id)
    except Exception as e:
        print(f"❌ 查詢家庭成員失敗: {e}")
    finally:
        db.close()
    return family_list

# --- 新增一個檢查資料庫網址的函式 ---
def check_url_in_blacklist(text):
    """
    輸入一段文字，自動抓出裡面的網址，並去資料庫查是不是黑名單
    """
    # 1. 用正規表達式抓出所有網址 (http/https/www 開頭)
    url_pattern = re.compile(r'https?://[^\s]+|www\.[^\s]+')
    found_urls = url_pattern.findall(text)
    
    if not found_urls:
        return None # 沒網址，跳過

    db = SessionLocal()
    try:
        for url in found_urls:
            # 簡單處理：去掉無關符號
            clean_url = url.strip()
            
            # 去資料庫撈撈看 (模糊搜尋，只要網址包含黑名單片段就算)
            # 例如: database 有 'bad.com'，使用者傳 'https://bad.com/login' -> 中獎
            # 這裡我們先做精確比對或部分比對，視需求而定
            # 簡單版：直接查有無完全一樣的
            match = db.query(FraudLink).filter(FraudLink.url == clean_url).first()
            
            if match:
                return {
                    "score": 100, # 滿分危險
                    "light": "Red",
                    "reason": f"⚠️ 警告：此網址 ({clean_url}) 已列在政府詐騙黑名單中！",
                    "keywords": ["政府黑名單網址"]
                }
    finally:
        db.close()
    
    return None # 網址都安全

# --- API 路由區 ---

class TextMessage(BaseModel):
    user_id: str
    content: str

class FamilyBindRequest(BaseModel):
    user_id: str
    group_id: str
    role: str

# 綁定家人的接口
@app.post("/family/bind")
async def bind_family(data: FamilyBindRequest):
    db = SessionLocal()
    try:
        existing = db.query(UserRelation).filter(UserRelation.user_id == data.user_id).first()
        if existing:
            existing.group_id = data.group_id
            existing.role = data.role
            message = f"User {data.user_id} updated to group {data.group_id}"
        else:
            new_relation = UserRelation(
                user_id=data.user_id, group_id=data.group_id, role=data.role
            )
            db.add(new_relation)
            message = f"User {data.user_id} added to group {data.group_id}"
            
        db.commit()
        return {"status": "success", "message": message}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        db.close()

# 文字分析 (已加入協防邏輯)
@app.post("/analyze/text")
async def analyze_text(data: TextMessage):
    # 1. 分析
    risk_result = check_risk_level(data.content)
    
    # 2. 存檔
    save_to_db(data.user_id, data.content, "text", risk_result)

    # 3. 【新增】如果是紅燈，啟動家庭協防！
    notify_list = []
    if risk_result['light'] == 'Red':
        # 呼叫上面的小幫手去找人
        notify_list = find_family_members(data.user_id)
        if notify_list:
            print(f"🚨 觸發協防！請通知這些人: {notify_list}")

    return {
        "type": "text",
        "original_text": data.content,
        "risk_analysis": risk_result,
        "family_alert": {
            "triggered": len(notify_list) > 0,
            "notify_targets": notify_list # 這裡會回傳給 Node.js，讓它去發送 Line 警告
        }
    }

# 圖片分析 (已加入協防邏輯)
@app.post("/analyze/image")
async def analyze_image(user_id: str = Form(...), file: UploadFile = File(...)):
    # 1. OCR
    file_content = await file.read()
    extracted_text = ocr_process(file_content)
    
    # 2. 分析
    risk_result = check_risk_level(extracted_text)

    # 3. 存檔
    save_to_db(user_id, extracted_text, "image", risk_result)

    # 4. 【新增】紅燈檢查
    notify_list = []
    if risk_result['light'] == 'Red':
        notify_list = find_family_members(user_id)
        if notify_list:
            print(f"🚨 觸發協防！請通知這些人: {notify_list}")

    return {
        "type": "image",
        "filename": file.filename,
        "ocr_text": extracted_text,
        "risk_analysis": risk_result,
        "family_alert": {
            "triggered": len(notify_list) > 0,
            "notify_targets": notify_list
        }
    }

# 雙通 (已加入協防邏輯與嚴謹判斷)
@app.post("/analyze/auto")
async def analyze_auto(
    user_id: str = Form(...),          
    text: Optional[str] = Form(None),       # 【修改】明確標示為可選字串
    file: Optional[UploadFile] = File(None) # 【修改】明確標示為可選檔案
):
    print(f"收到 User: {user_id} 的請求...")
    
    final_content = ""
    msg_type = ""

    # --- 判斷邏輯開始 ---
    
    # 情況 1: 使用者傳了圖片 (還要確保檔名不是空的，避免 Swagger UI 亂傳空字串)
    if file and file.filename:
        print(f"偵測到圖片: {file.filename}，啟動 OCR...")
        file_content = await file.read()
        final_content = ocr_process(file_content) 
        msg_type = "image"
        
    # 情況 2: 沒圖片，但是有文字
    elif text:
        print(f"偵測到純文字: {text}")
        final_content = text
        msg_type = "text"
        
    # 情況 3: 什麼都沒傳
    else:
        return {"status": "error", "message": "請至少提供文字 (text) 或圖片 (file)"}

    # --- 統一分析流程 ---
    
    # 1. 第一道防線：網址黑名單檢查
    blacklist_result = check_url_in_blacklist(final_content)
    
    if blacklist_result:
        risk_result = blacklist_result 
        print(f"🚨 攔截到黑名單網址！User: {user_id}")
    else:
        # 2. 第二道防線：關鍵字檢查
        risk_result = check_risk_level(final_content)
    
    # 3. 存入資料庫
    save_to_db(user_id, final_content, msg_type, risk_result)

    # 4. 家庭協防檢查
    notify_list = []
    if risk_result['light'] == 'Red':
        notify_list = find_family_members(user_id)
        if notify_list:
            print(f"🚨 觸發協防！請通知家人: {notify_list}")

    # 5. 回傳結果
    return {
        "status": "success",
        "user_id": user_id,
        "mode": msg_type,               
        "content": final_content,       
        "risk_analysis": risk_result,
        "family_alert": {
            "triggered": len(notify_list) > 0,
            "notify_targets": notify_list
        }
    }