# main.py
import os
from fastapi import FastAPI, File, UploadFile, Form
from pydantic import BaseModel
from google.cloud import vision
from google.oauth2 import service_account

app = FastAPI()

# --- 設定區 ---
CREDENTIALS_FILE = "credentials.json"

# 【新增】詐騙關鍵字黑名單 (持續擴充)
# 這些詞一出現，我們就判定是高風險
# 擴充版詐騙關鍵字庫
FRAUD_KEYWORDS = [
    # 1. 金錢與帳戶類 (最直接的警訊)
    "解除分期", "重複扣款", "操作ATM", "操作網銀", "購買點數", 
    "MyCard", "Gash", "保證金", "解凍金", "安全帳戶", "監管帳戶",
    "匯款", "轉帳", "補償金", "誤設為批發商", "誤刷",

    # 2. 投資與獲利類 (假投資詐騙)
    "保證獲利", "穩賺不賠", "飆股", "內線消息", "老師帶牌", 
    "代操", "虛擬貨幣", "USDT", "比特幣", "投資群組", "快速回本",
    "高報酬", "低風險", "抽股票",

    # 3. 威脅與急迫類 (情緒勒索)
    "涉及刑案", "偵查不公開", "拘提", "通緝", "帳戶凍結", 
    "刑事責任", "限時", "立即處理", "逾期", "強制執行",
    "法院傳票", "警察局", "地檢署",

    # 4. 帳號與認證類 (釣魚網站)
    "Line輔助認證", "重新登入", "帳號異常", "更新資料", 
    "點擊連結", "驗證碼", "安全代碼", "客服", "官方帳號",
    "免費貼圖", "好禮大放送"
]
# --- 功能函式區 ---

def ocr_process(image_content):
    """(這段是你原本的 OCR 函式，不用動)"""
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
    """
    【新增】關鍵字快篩邏輯
    輸入：任何文字 (來自使用者輸入 或 OCR 結果)
    輸出：風險評估結果
    """
    detected_keywords = []
    
    # 掃描文字中是否包含黑名單裡的詞
    for keyword in FRAUD_KEYWORDS:
        if keyword in text:
            detected_keywords.append(keyword)
    
    # 判斷邏輯
    if len(detected_keywords) > 0:
        return {
            "score": 90,  # 直接給高分
            "light": "Red", # 亮紅燈 [cite: 62]
            "reason": f"偵測到高風險關鍵字：{', '.join(detected_keywords)}",
            "keywords": detected_keywords
        }
    else:
        return {
            "score": 0,
            "light": "Green", # 暫時綠燈 [cite: 64]
            "reason": "未偵測到已知關鍵字，建議進一步由 AI 模型分析",
            "keywords": []
        }

# --- API 路由區 ---

class TextMessage(BaseModel):
    user_id: str
    content: str

@app.post("/analyze/text")
async def analyze_text(data: TextMessage):
    print(f"收到文字: {data.content}")
    
    # 【修改】這裡直接呼叫上面的快篩邏輯
    risk_result = check_risk_level(data.content)
    
    return {
        "type": "text",
        "original_text": data.content,
        "risk_analysis": risk_result # 回傳分析結果
    }

@app.post("/analyze/image")
async def analyze_image(user_id: str = Form(...), file: UploadFile = File(...)):
    print(f"收到圖片: {file.filename}")
    
    # 1. 先做 OCR (讀圖)
    file_content = await file.read()
    extracted_text = ocr_process(file_content)
    
    # 2. 【修改】再拿讀出來的字去做快篩 (分析)
    risk_result = check_risk_level(extracted_text)

    return {
        "type": "image",
        "filename": file.filename,
        "ocr_text": extracted_text,
        "risk_analysis": risk_result # 回傳分析結果
    }