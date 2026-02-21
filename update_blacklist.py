# update_blacklist.py (這是獨立的工具程式)
import requests
import xml.etree.ElementTree as ET # 用來解析 XML
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime

# --- 1. 資料庫連線設定 (要跟 main.py 一樣) ---
# 請確認密碼是否正確
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:0509@localhost/fraud_db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

# 定義要寫入的表格 (必須跟 main.py 一模一樣)
class FraudLink(Base):
    __tablename__ = "fraud_links"
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, index=True)
    source = Column(String)
    created_at = Column(DateTime, default=datetime.now)

# 自動建表 (以防萬一)
Base.metadata.create_all(bind=engine)

def update_data():
    db = SessionLocal()
    print("🚀 開始下載政府詐騙資料...")

    # 假設這是政府 Open Data 的網址 (這裡用範例，你可以換成真實的 JSON/XML 網址)
    # 如果你是下載檔案到電腦，也可以改用 open('file.xml') 讀取
    # 這裡我們模擬從你的截圖結構讀取資料
    
    # 模擬資料 (因為政府網址常變，我們先用 list 模擬，你確認邏輯後可接真實 API)
    fake_data_list = [
        "http://sharefunpc24.com/bcew9vc#/login",
        "https://tobuyersepc24.com/57vgaqk#/login",
        "https://onlytoppc24.com/ucy9mf2#/login",
        "www.scam-test.com" # 加入一個測試用的
    ]

    count = 0
    for site_url in fake_data_list:
        try:
            # 清理網址 (去掉前後空白)
            clean_url = site_url.strip()
            
            # 檢查資料庫有沒有這一條 (避免重複插入)
            exists = db.query(FraudLink).filter(FraudLink.url == clean_url).first()
            
            if not exists:
                new_link = FraudLink(url=clean_url, source="Gov_OpenData")
                db.add(new_link)
                count += 1
                print(f"✅ 新增黑名單: {clean_url}")
            else:
                print(f"⚠️ 已存在跳過: {clean_url}")

        except Exception as e:
            print(f"❌ 處理失敗: {e}")

    db.commit()
    db.close()
    print(f"\n🎉 更新完成！共新增 {count} 筆詐騙網址。")

if __name__ == "__main__":
    update_data()