import json
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

# --- 1. 資料庫連線設定 (與 main.py 一模一樣) ---
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:0509@localhost/fraud_db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

# --- 2. 定義資料表 (與 main.py 一模一樣) ---
class FraudLink(Base):
    __tablename__ = "fraud_links"
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, index=True)
    source = Column(String)
    created_at = Column(DateTime, default=datetime.now)

# --- 3. 執行匯入邏輯 ---
def import_data():
    db = SessionLocal()
    # 你的 JSON 檔案名稱
    file_path = '通報TWNIC詐騙網址彙整表-database.json'
    
    try:
        # 讀取 JSON 檔案
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        print(f"✅ 成功讀取 JSON 檔案，共有 {len(data)} 筆資料，準備匯入...")
        
        count = 0
        for item in data:
            # 政府資料常見的網址欄位名稱可能是 '網址'、'url'、'domain' 或 '偽冒網址'
            # 這裡用 .get() 自動去抓，抓到哪一個算哪一個
            target_url = item.get('網址') or item.get('url') or item.get('domain') or item.get('偽冒網址')
            
            if target_url:
                clean_url = target_url.strip() # 去除頭尾多餘空白
                
                # 去資料庫查查看是不是已經存過了 (避免重複)
                exists = db.query(FraudLink).filter(FraudLink.url == clean_url).first()
                
                if not exists:
                    new_link = FraudLink(url=clean_url, source="TWNIC_JSON")
                    db.add(new_link)
                    count += 1
                    
        # 確認存檔
        db.commit()
        print(f"🎉 匯入大功告成！成功新增 {count} 筆詐騙網址到資料庫。")
        
    except FileNotFoundError:
        print(f"❌ 找不到檔案：{file_path}，請確認檔案有放在跟這個程式同一層資料夾喔！")
    except Exception as e:
        print(f"❌ 發生錯誤：{e}")
    finally:
        db.close()

if __name__ == "__main__":
    import_data()