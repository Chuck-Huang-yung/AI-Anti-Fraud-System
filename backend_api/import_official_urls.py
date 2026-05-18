import json
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker

# --- 資料庫連線設定 ---
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:0509@localhost/fraud_db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class OfficialURL(Base):
    __tablename__ = "official_urls"
    id = Column(Integer, primary_key=True, index=True)
    keywords = Column(String(500))
    site_name = Column(String(100))
    url = Column(String(500))
    category = Column(String(50))

Base.metadata.create_all(bind=engine)

# --- 🎯 台灣高風險被偽冒的官方網址清單 (JSON 格式) ---
# 你之後可以在這裡繼續往下加，加到 100 筆！
# --- 🎯 台灣高風險被偽冒的官方網址清單 (加量升級版) ---
official_data = [
    # 🏛️ 公家機關 (司法、罰款、補助、稅務)
    {"keywords": "報稅,繳稅,所得稅,退稅,綜合所得稅", "site_name": "財政部電子申報繳稅服務網", "url": "https://tax.nat.gov.tw/", "category": "政府機關"},
    {"keywords": "監理站,罰單,交通違規,燃料費", "site_name": "監理服務網", "url": "https://www.mvdis.gov.tw/", "category": "政府機關"},
    {"keywords": "健保,健保局,健保費,健保卡,健康保險署", "site_name": "衛生福利部中央健康保險署", "url": "https://www.nhi.gov.tw/", "category": "政府機關"},
    {"keywords": "勞保,國民年金,勞退,勞動部", "site_name": "勞動部勞工保險局", "url": "https://www.bli.gov.tw/", "category": "政府機關"},
    {"keywords": "165,警政署,報案,防詐騙,防詐,全民防騙網", "site_name": "內政部警政署165全民防騙網", "url": "https://165.npa.gov.tw/", "category": "政府機關"},
    {"keywords": "法務部,洗錢,地檢署,拘提,傳票", "site_name": "中華民國法務部", "url": "https://www.moj.gov.tw/", "category": "政府機關"},
    {"keywords": "司法院,出庭,法院,訴訟", "site_name": "司法院", "url": "https://www.judicial.gov.tw/", "category": "政府機關"},
    {"keywords": "衛福部,防疫補貼,紓困,確診補助", "site_name": "中華民國衛生福利部", "url": "https://www.mohw.gov.tw/", "category": "政府機關"},
    {"keywords": "旅遊補助,觀光局,觀光署", "site_name": "交通部觀光署", "url": "https://www.taiwan.net.tw/", "category": "政府機關"},
    {"keywords": "數發部,數位發展部", "site_name": "數位發展部", "url": "https://moda.gov.tw/", "category": "政府機關"},

    # 💧 民生事業 (水電、交通)
    {"keywords": "台水,自來水,水費,停水通知,水單", "site_name": "台灣自來水公司", "url": "https://www.water.gov.tw/", "category": "民生事業"},
    {"keywords": "台電,台灣電力公司,電費,停電通知", "site_name": "台灣電力公司", "url": "https://www.taipower.com.tw/", "category": "民生事業"},
    {"keywords": "遠通,etag,通行費,過路費", "site_name": "遠通電收 (eTag)", "url": "https://www.fetc.net.tw/", "category": "民生事業"},
    {"keywords": "高鐵,台灣高鐵", "site_name": "台灣高鐵", "url": "https://www.thsrc.com.tw/", "category": "民生事業"},
    {"keywords": "台鐵,火車票", "site_name": "交通部台灣鐵路管理局", "url": "https://www.railway.gov.tw/", "category": "民生事業"},

    # 🏦 金融銀行 (網銀異常、帳戶凍結)
    {"keywords": "中國信託,中信,中信卡", "site_name": "中國信託商業銀行", "url": "https://www.ctbcbank.com/", "category": "金融機構"},
    {"keywords": "國泰世華,國泰,CUBE卡", "site_name": "國泰世華銀行", "url": "https://www.cathaybk.com.tw/", "category": "金融機構"},
    {"keywords": "玉山,玉山銀行", "site_name": "玉山銀行", "url": "https://www.esunbank.com/", "category": "金融機構"},
    {"keywords": "台新,台新銀行,Richart", "site_name": "台新銀行", "url": "https://www.taishinbank.com.tw/", "category": "金融機構"},
    {"keywords": "富邦,台北富邦,富邦網銀", "site_name": "台北富邦銀行", "url": "https://www.fubon.com/", "category": "金融機構"},
    {"keywords": "台灣銀行,臺銀,網銀綁定", "site_name": "臺灣銀行", "url": "https://www.bot.com.tw/", "category": "金融機構"},
    {"keywords": "郵局網銀,網路郵局,e動郵局", "site_name": "中華郵政 WebATM / 網路郵局", "url": "https://ipost.post.gov.tw/", "category": "金融機構"},
    {"keywords": "Line Pay,LinePay,綁定異常", "site_name": "LINE Pay", "url": "https://pay.line.me/", "category": "金融機構"},
    {"keywords": "悠遊卡,EasyCard,記名,TPASS", "site_name": "悠遊卡股份有限公司", "url": "https://www.easycard.com.tw/", "category": "金融機構"},

    # 📦 電商物流 (解除分期、訂單錯誤、包裹未領)
    {"keywords": "蝦皮,shopee", "site_name": "蝦皮購物", "url": "https://shopee.tw/", "category": "電子商務"},
    {"keywords": "momo,momo購物", "site_name": "momo購物網", "url": "https://www.momoshop.com.tw/", "category": "電子商務"},
    {"keywords": "PChome,pchome", "site_name": "PChome 線上購物", "url": "https://www.pchome.com.tw/", "category": "電子商務"},
    {"keywords": "博客來", "site_name": "博客來", "url": "https://www.books.com.tw/", "category": "電子商務"},
    {"keywords": "露天,Ruten", "site_name": "露天市集", "url": "https://www.ruten.com.tw/", "category": "電子商務"},
    {"keywords": "郵局,包裹,掛號,招領", "site_name": "中華郵政全球資訊網", "url": "https://www.post.gov.tw/", "category": "物流快遞"},
    {"keywords": "黑貓,宅急便", "site_name": "黑貓宅急便", "url": "https://www.t-cat.com.tw/", "category": "物流快遞"},

    # 📱 電信與科技平台 (點數即將到期、輔助認證)
    {"keywords": "中華電信", "site_name": "中華電信", "url": "https://www.cht.com.tw/", "category": "電信業者"},
    {"keywords": "台灣大哥大,台哥大", "site_name": "台灣大哥大", "url": "https://www.taiwanmobile.com/", "category": "電信業者"},
    {"keywords": "遠傳,遠傳電信,遠傳幣", "site_name": "遠傳電信", "url": "https://www.fetnet.net/", "category": "電信業者"},
    {"keywords": "LINE,LINE客服", "site_name": "LINE 台灣官方網站", "url": "https://line.me/tw/", "category": "社群平台"},
    {"keywords": "Facebook,臉書", "site_name": "Facebook", "url": "https://www.facebook.com/", "category": "社群平台"},
    {"keywords": "Instagram,IG,藍勾勾", "site_name": "Instagram", "url": "https://www.instagram.com/", "category": "社群平台"},
    {"keywords": "Apple,Apple ID,iCloud,蘋果,尋找我的iPhone", "site_name": "Apple 台灣", "url": "https://www.apple.com/tw/", "category": "科技公司"},
    {"keywords": "Google,Gmail,帳號異常,Google雲端", "site_name": "Google", "url": "https://www.google.com/", "category": "科技公司"},
    
    # 🏛️ 政府機關與開放平台 (監管、執法、補貼、檢驗)
    {"keywords": "金管會", "site_name": "金融監督管理委員會", "url": "https://www.fsc.gov.tw/", "category": "政府機關"},
    {"keywords": "海關,關務署,卡關,補繳關稅,報關", "site_name": "財政部關務署", "url": "https://web.customs.gov.tw/", "category": "政府機關"},
    {"keywords": "刑事局,刑事警察局", "site_name": "內政部警政署刑事警察局", "url": "https://www.cib.npa.gov.tw/", "category": "政府機關"},
    {"keywords": "行政執行,欠稅,查封,拍賣,扣押,強制執行", "site_name": "法務部行政執行署", "url": "https://www.tpk.moj.gov.tw/", "category": "政府機關"},
    {"keywords": "護照,簽證,出國,護照過期,領事局", "site_name": "外交部領事事務局", "url": "https://www.boca.gov.tw/", "category": "政府機關"},
    {"keywords": "消保官,網購糾紛,消費者保護", "site_name": "行政院消費者保護會", "url": "https://cpc.ey.gov.tw/", "category": "政府機關"},
    {"keywords": "多層次傳銷,直銷,公平交易", "site_name": "公平交易委員會", "url": "https://www.ftc.gov.tw/", "category": "政府機關"},
    {"keywords": "找工作,職訓,青年就業,居家代工", "site_name": "勞動部勞動力發展署", "url": "https://www.wda.gov.tw/", "category": "政府機關"},
    {"keywords": "徵才,履歷,職缺,找工作", "site_name": "台灣就業通", "url": "https://www.taiwanjobs.gov.tw/", "category": "政府機關"},
    {"keywords": "NCC,門號被盜,停話,電信詐騙,通訊傳播", "site_name": "國家通訊傳播委員會", "url": "https://www.ncc.gov.tw/", "category": "政府機關"},
    {"keywords": "租金補貼,房貸補貼,社會住宅,國土管理署", "site_name": "內政部國土管理署", "url": "https://www.nlma.gov.tw/", "category": "政府機關"},
    {"keywords": "居留證,外籍配偶,移工", "site_name": "內政部移民署", "url": "https://www.immigration.gov.tw/", "category": "政府機關"},
    {"keywords": "內政部,戶政", "site_name": "中華民國內政部", "url": "https://www.moi.gov.tw/", "category": "政府機關"},
    {"keywords": "外交部,援助,外交", "site_name": "中華民國外交部", "url": "https://www.mofa.gov.tw/", "category": "政府機關"},
    {"keywords": "經濟部,企業紓困,商業登記", "site_name": "中華民國經濟部", "url": "https://www.moea.gov.tw/", "category": "政府機關"},
    {"keywords": "營業登記,統編,公司行號,商工", "site_name": "全國商工行政服務入口網", "url": "https://gcis.nat.gov.tw/", "category": "政府機關"},
    {"keywords": "交通部,交通", "site_name": "中華民國交通部", "url": "https://www.motc.gov.tw/", "category": "政府機關"},
    {"keywords": "國發會,國家發展", "site_name": "國家發展委員會", "url": "https://www.ndc.gov.tw/", "category": "政府機關"},

    # 🌐 政府開放平台與數位服務
    {"keywords": "電子發票,載具,歸戶,財政部發票", "site_name": "財政部電子發票整合服務平台", "url": "https://einvoice.nat.gov.tw/", "category": "政府機關"},
    {"keywords": "開放資料,opendata,政府數據,API", "site_name": "政府資料開放平臺", "url": "https://data.gov.tw/", "category": "政府機關"},
    {"keywords": "e政府", "site_name": "我的E政府", "url": "https://www.gov.tw/", "category": "政府機關"},
    {"keywords": "數位個人資料", "site_name": "數位個人資料自主運用(MyData)平臺", "url": "https://mydata.nat.gov.tw/", "category": "政府機關"},
    {"keywords": "連署,提議,投票,公共政策", "site_name": "公共政策網路參與平臺", "url": "https://join.gov.tw/", "category": "政府機關"},
    {"keywords": "標案,政府電子採購", "site_name": "政府電子採購網", "url": "https://web.pcc.gov.tw/", "category": "政府機關"},
    {"keywords": "資安,駭客,勒索軟體,防毒,資通安全", "site_name": "國家資通安全研究院", "url": "https://www.nics.nat.gov.tw/", "category": "政府機關"},
    {"keywords": "國考,公務員,准考證,考選部", "site_name": "考選部", "url": "https://wwwc.moex.gov.tw/", "category": "政府機關"},
    
    # 🏥 醫療、衛生與環境
    {"keywords": "疫苗,傳染病,確診,隔離,防疫", "site_name": "衛生福利部疾病管制署", "url": "https://www.cdc.gov.tw/", "category": "政府機關"},
    {"keywords": "食安,藥品,食藥署", "site_name": "衛生福利部食品藥物管理署", "url": "https://www.fda.gov.tw/", "category": "政府機關"},
    {"keywords": "豬瘟,檢疫,農業部", "site_name": "農業部動植物防疫檢疫署", "url": "https://www.aphia.gov.tw/", "category": "政府機關"},
    {"keywords": "地震警報,颱風假,氣象署,停班停課", "site_name": "交通部中央氣象署", "url": "https://www.cwa.gov.tw/", "category": "政府機關"},
    {"keywords": "環保署,排氣,碳排,環保檢舉,環境部", "site_name": "環境部", "url": "https://www.moenv.gov.tw/", "category": "政府機關"},
    {"keywords": "消防檢修,居家安全,居家安檢,消防署", "site_name": "內政部消防署", "url": "https://www.nfa.gov.tw/", "category": "政府機關"},

    # 🎓 教育、文化與農業補助
    {"keywords": "助學金,就學貸款,留學,教育部", "site_name": "中華民國教育部", "url": "https://www.edu.tw/", "category": "政府機關"},
    {"keywords": "文化幣,藝放券,展覽,文化部", "site_name": "中華民國文化部", "url": "https://www.moc.gov.tw/", "category": "政府機關"},
    {"keywords": "動滋券,體育,體育署", "site_name": "教育部體育署", "url": "https://www.sa.gov.tw/", "category": "政府機關"},
    {"keywords": "商標,專利,著作權,盜版,侵權,智慧局", "site_name": "經濟部智慧財產局", "url": "https://www.tipo.gov.tw/", "category": "政府機關"},
    {"keywords": "國有土地,國有財產署,國產署", "site_name": "財政部國有財產署", "url": "https://www.fnp.gov.tw/", "category": "政府機關"},

    # 💰 金融周邊與國營事業 (常被冒名)
    {"keywords": "股市,台股,抽籤,投資,內線,證交所", "site_name": "台灣證券交易所", "url": "https://www.twse.com.tw/", "category": "金融機構"},
    {"keywords": "集保e手掌握,集保", "site_name": "台灣集中保管結算所", "url": "https://www.tdcc.com.tw/", "category": "金融機構"},
    {"keywords": "金融申訴,評議中心", "site_name": "財團法人金融消費評議中心", "url": "https://www.foi.org.tw/", "category": "金融機構"},
    {"keywords": "股東會,團體訴訟,投保中心", "site_name": "證券投資人及期貨交易人保護中心", "url": "https://www.sfipc.org.tw/", "category": "金融機構"},
    {"keywords": "NCCC,刷卡異常,盜刷,信用卡中心", "site_name": "聯合信用卡處理中心", "url": "https://www.nccc.com.tw/", "category": "金融機構"},
    {"keywords": "中油,中油pay", "site_name": "台灣中油股份有限公司", "url": "https://www.cpc.com.tw/", "category": "民生事業"},
    {"keywords": "網域,tw網址,DNS,網站註冊", "site_name": "財團法人台灣網路資訊中心 (TWNIC)", "url": "https://www.twnic.tw/", "category": "科技公司"},
    {"keywords": "ETC,高速公路,國道", "site_name": "交通部高速公路局", "url": "https://www.freeway.gov.tw/", "category": "政府機關"},
    {"keywords": "勞檢,工安,職安署", "site_name": "勞動部職業安全衛生署", "url": "https://www.osha.gov.tw/", "category": "政府機關"},
    {"keywords": "進出口,國貿署", "site_name": "經濟部國際貿易署", "url": "https://www.trade.gov.tw/", "category": "政府機關"},
    
    # 🛒 零售、超商與餐飲 (假優惠券、點數到期、假買家客服)
    {"keywords": "全聯,PXPay,福利點數,全支付", "site_name": "全聯福利中心", "url": "https://www.pxmart.com.tw/", "category": "零售量販"},
    {"keywords": "統一超商,OPENPOINT,賣貨便,交貨便", "site_name": "7-ELEVEN 統一超商", "url": "https://www.7-11.com.tw/", "category": "零售量販"},
    {"keywords": "全家,FaPoints,好賣+", "site_name": "FamilyMart 全家便利商店", "url": "https://www.family.com.tw/", "category": "零售量販"},
    {"keywords": "麥當勞,歡樂送,雙層牛肉吉事堡", "site_name": "台灣麥當勞", "url": "https://www.mcdonalds.com/tw/", "category": "餐飲服務"}, # 麥當勞假優惠券釣魚非常猖獗
    {"keywords": "星巴克,星禮程,隨行卡", "site_name": "星巴克台灣", "url": "https://www.starbucks.com.tw/", "category": "餐飲服務"},

    # ✈️ 旅遊住宿與交通 (飯店訂單錯誤、信用卡重複扣款)
    {"keywords": "Agoda", "site_name": "Agoda 訂房網", "url": "https://www.agoda.com/", "category": "旅遊住宿"},
    {"keywords": "Booking.com,繽客", "site_name": "Booking.com", "url": "https://www.booking.com/", "category": "旅遊住宿"},
    {"keywords": "YouBike,微笑單車,腳踏車扣款", "site_name": "YouBike 微笑單車", "url": "https://www.youbike.com.tw/", "category": "民生事業"},

    # 🍔 外送與平台服務 (外送員帳號停權、假客服)
    {"keywords": "UberEats,外送員帳戶,優食", "site_name": "Uber Eats", "url": "https://www.ubereats.com/", "category": "物流快遞"},
    {"keywords": "Foodpanda,熊貓外送,富胖達", "site_name": "foodpanda", "url": "https://www.foodpanda.com.tw/", "category": "物流快遞"},

    # 🎫 藝文與售票平台 (黃牛票、假讓票、驗證碼詐騙)
    {"keywords": "拓元,tixCraft,演唱會票", "site_name": "拓元售票系統", "url": "https://tixcraft.com/", "category": "藝文售票"},
    {"keywords": "KKTIX,售票網,活動通", "site_name": "KKTIX", "url": "https://kktix.com/", "category": "藝文售票"},

    # 💻 科技公司與網銀 (帳號鎖定、跨平台重疊迴避)
    {"keywords": "微軟,Microsoft,Office365,Windows授權", "site_name": "Microsoft 台灣", "url": "https://www.microsoft.com/zh-tw", "category": "科技公司"},
    {"keywords": "連線商業銀行,LINEBank", "site_name": "LINE Bank 連線銀行", "url": "https://www.linebank.com.tw/", "category": "金融機構"}, # 避開單純的"LINE"以防與社群平台衝突

    # 🪙 虛擬資產與加密貨幣 (假投資、假出金、假入金)
    {"keywords": "MAX交易所,MaiCoin,加密貨幣,冷錢包", "site_name": "MAX 數位資產交易所", "url": "https://max.maicoin.com/", "category": "虛擬資產"}
]

def import_official_data():
    db = SessionLocal()
    success_count = 0
    skip_count = 0

    print("🚀 啟動「官方白名單」匯入程式...")
    
    for item in official_data:
        # 檢查是否已經存在 (用 site_name 當作唯一值檢查)
        exists = db.query(OfficialURL).filter(OfficialURL.site_name == item['site_name']).first()
        
        if not exists:
            new_entry = OfficialURL(
                keywords=item['keywords'],
                site_name=item['site_name'],
                url=item['url'],
                category=item['category']
            )
            db.add(new_entry)
            success_count += 1
        else:
            # 如果已經存在，我們順便幫它更新關鍵字，方便你以後擴充
            exists.keywords = item['keywords']
            exists.url = item['url']
            skip_count += 1
            
    try:
        db.commit()
        print("\n=================================")
        print(f"🎉 官方白名單匯入大功告成！")
        print(f"✅ 成功新增：{success_count} 筆服務")
        print(f"🔄 更新/略過：{skip_count} 筆服務")
        print("=================================")
    except Exception as e:
        db.rollback()
        print(f"❌ 資料庫寫入失敗: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    import_official_data()