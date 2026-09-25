import os
import requests
from dotenv import load_dotenv

# 讀取金鑰
load_dotenv("backend_api/.env")
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("❌ 找不到 API Key，請檢查 .env 檔案")
    exit()

# 直接呼叫 Google 的原生 REST API 網址 (繞過 SDK)
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
headers = {'Content-Type': 'application/json'}
data = {
    "contents": [{"parts":[{"text": "請只回覆四個字：測試成功"}]}]
}

print("🌐 正在透過原生 requests 發送請求，測試底層網路...")
try:
    # 這裡設定 10 秒，如果網路有通，通常 1 秒內就會回傳
    response = requests.post(url, headers=headers, json=data, timeout=30.0)
    print("✅ HTTP 狀態碼:", response.status_code)
    
    if response.status_code == 200:
        print("🎉 測試成功！API 回應:", response.json()["candidates"][0]["content"]["parts"][0]["text"])
    else:
        print("⚠️ 發生錯誤，Google 回傳:", response.text)
        
except Exception as e:
    print("❌ 底層網路連線失敗:", e)