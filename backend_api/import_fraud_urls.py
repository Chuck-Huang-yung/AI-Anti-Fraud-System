import pandas as pd
import time
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base # 修正了黃色警告
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "postgresql://postgres:0509@localhost/fraud_db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class FraudURL(Base):
    __tablename__ = "fraud_urls"
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(2048), index=True, unique=True) 
    description = Column(String(500))
    source = Column(String(100))

Base.metadata.create_all(bind=engine)

def import_csv_data():
    db = SessionLocal()
    success_count = 0
    skip_count = 0
    start_time = time.time()
    
    records = []
    seen_urls = set() # ⭐️ 新增：準備一個「記憶吐司」，記住出現過的網址

    print("🚀 啟動匯入程式...")
    print("🧹 開始讀取並過濾重複的 CSV 檔案...")
    
    # --- 處理第一份檔案：民眾通報 ---
    try:
        df4 = pd.read_csv('NPA_WEBURL (4).csv')
        df4 = df4[df4['WEBSITE_NM'] != '網站名稱'] 
        df4 = df4.dropna(subset=['WEBURL'])
        
        for _, row in df4.iterrows():
            url = str(row['WEBURL']).strip()[:2000]
            # ⭐️ 檢查：如果網址有內容，而且還沒看過，才加進去
            if url and url not in seen_urls:
                seen_urls.add(url) # 記進記憶吐司
                records.append({
                    "url": url,
                    "description": str(row['WEBSITE_NM']).strip()[:490],
                    "source": "內政部警政署165 (民眾通報)"
                })
            else:
                skip_count += 1 # 如果 CSV 裡本身就重複了，直接略過
    except Exception as e:
        print(f"⚠️ 讀取 (4).csv 失敗: {e}")

    # --- 處理第二份檔案：刑事局查獲 ---
    try:
        df3 = pd.read_csv('NPA_WEBURL (3).csv')
        df3 = df3.dropna(subset=['網域'])
        
        for _, row in df3.iterrows():
            url = str(row['網域']).strip()[:2000]
            # ⭐️ 一樣的檢查邏輯
            if url and url not in seen_urls:
                seen_urls.add(url)
                records.append({
                    "url": url,
                    "description": str(row['網站性質']).strip()[:490],
                    "source": "刑事警察局詐欺犯罪防制中心"
                })
            else:
                skip_count += 1
    except Exception as e:
        print(f"⚠️ 讀取 (3).csv 失敗: {e}")

    total_records = len(records)
    print(f"📊 過濾完畢！剔除了 CSV 內的重複資料，共有 {total_records} 筆不重複資料準備進入資料庫...")

    # --- 分批塞進資料庫 ---
    batch_size = 5000 
    
    for i in range(0, total_records, batch_size):
        batch = records[i:i + batch_size]
        
        for item in batch:
            # 雙重保險：檢查資料庫裡面是不是早就有了 (例如昨天匯入過)
            exists = db.query(FraudURL).filter(FraudURL.url == item['url']).first()
            if not exists:
                new_entry = FraudURL(
                    url=item['url'],
                    description=item['description'],
                    source=item['source']
                )
                db.add(new_entry)
                success_count += 1
            else:
                skip_count += 1
                
        # 每處理完一批就存檔
        try:
            db.commit()
            print(f"⏳ 匯入進度：已處理 {min(i + batch_size, total_records)} / {total_records} 筆...")
        except Exception as e:
            db.rollback() # 如果這 5000 筆發生意外，就退回，保護資料庫
            print(f"❌ 匯入批次發生錯誤: {e}")

    db.close()
    end_time = time.time()
    
    print("\n=================================")
    print(f"🎉 匯入大功告成！")
    print(f"✅ 成功新增至資料庫：{success_count} 筆網址")
    print(f"⏭️ 過濾掉的重複網址：{skip_count} 筆")
    print(f"⏱️ 總耗時：{round(end_time - start_time, 2)} 秒")
    print("=================================")

if __name__ == "__main__":
    import_csv_data()