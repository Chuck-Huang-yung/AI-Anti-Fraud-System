# 🔔 真識監詐 – AI語意防詐與家庭協防系統 
**(FraudChickenBye: AI-Powered LINE Bot with Family Co-Defense System)**

![Python FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)
![Node.js](https://img.shields.io/badge/Gateway-Node.js-339933?logo=node.js&logoColor=white)
![RoBERTa](https://img.shields.io/badge/AI_Model-RoBERTa--wwm-FF9900?logo=huggingface&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![LINE API](https://img.shields.io/badge/Platform-LINE_Messaging_API-00C300?logo=line&logoColor=white)

> **💡 專案簡介**
> 2025年台灣詐騙財損高達 893.26 億元，其中年長者面臨極嚴重的「高財損」危機。本系統以長輩熟悉的 LINE 為介面，免下載 APP，運用自然語言處理 (NLP) 量化語意壓迫特徵，並首創「家庭協防機制」，將防詐由「個人單打獨鬥」翻轉為「全家即時守護」。本專案目前已進入 MVP 封閉測試階段。

---

## 🔀 專案架構與原始碼導覽 (Repository Navigation)

本專案採用嚴謹的**「前後端分離 (Frontend/Backend Separation)」**與微服務架構開發，程式碼依據功能模組存放於不同分支 (Branches)，請透過左上角切換分支以查看完整原始碼：

* 🌿 **[`backend` 分支]**：**防詐演算中樞與資料庫排程**
  * 包含 Python FastAPI 核心決策大腦、LINE Bot Webhook 接收邏輯、以及政府開放平台資料庫爬蟲與黑名單更新排程 (`update_blacklist.py`)。
* 🌿 **[`frontend` 分支]**：**使用者介面與 LIFF 網頁端**
  * 包含 Node.js 環境配置 (`package.json`)、LINE LIFF 家庭群組管理介面 (`FraudChickenBye/mobile` 模組)。

---

## ✨ 系統核心特色 (Core Features)

### 1. 多模態低門檻解析 (Multi-Modal Analysis)
將複雜的 AI 邏輯隱藏於 LINE 聊天介面。系統支援三種資料輸入，自動進行跨媒介判定：
* **文字與網址：** 即時語意萃取與惡意連結比對。
* **圖片 (圖像辨識)：** 導入 OCR 技術，自動濾除雜訊並擷取對話截圖文字。
* **語音 (語音轉譯)：** 串接 Groq Whisper Large-V3 API，利用超低延遲特性實現近即時轉譯。

### 2. 直覺化風險燈號與家庭協防 (Family Co-Defense)
將複雜的 AI 算分轉化為長輩易懂的交通燈號：
* 🔴 **紅燈 (80-100分，高風險)：** 偵測強烈恐嚇意圖或命中黑名單。**系統將自動推播警告至「家庭協防群組」**，讓親友第一時間介入攔阻。
* 🟡 **黃燈 (40-79分，中風險)：** 涵蓋潛在風險詞彙，啟動持續對話提醒。
* 🟢 **綠燈 (0-39分，低風險)：** 靜默放行無惡意日常對話。

---

## 🧠 學術級防詐演算邏輯 (RAG 雙軌加權打分機制)

本系統跳脫依賴單一模型機率輸出 (Softmax) 的脆弱防線，打造基於「檢索增強 (RAG)」的雙軌動態決策中樞：

### 1. 左軌 (AI 語意風險分數 $S_{NLP}$)
* **在地化模型微調：** 從 50 萬筆原始開源數據中，提煉出 1.5 萬筆專屬台灣本土情境的高風險詐騙訓練資料進行模型微調。
* **模型選型與實驗數據：** 為解決防詐機器人容易「過度敏感」擾民的痛點，本團隊針對三大預訓練模型進行交叉驗證（門檻值設為 0.5）。實驗證明，`RoBERTa-wwm-ext` 能在維持高攔截率的同時，將偽陽性（誤判日常對話）降至最低，具備極佳的分類穩定度，因此獲選為最終演算中樞。

| 候選模型 (Candidate Models) | 攔截詐騙成功數 (True Positives) | 偽陽性誤判數 (False Positives) | 評估結果 (Decision) |
| :--- | :--- | :--- | :--- |
| **RoBERTa-wwm-ext** | **712 筆** | **僅 136 筆 (表現最佳)** | 🏆 **最終決選中樞** |
| MacBERT | 738 筆 | 高達 375 筆 (干擾日常通訊) | 誤判過高，未採用 |
| DeBERTa-v3 | 733 筆 | 高達 422 筆 (干擾日常通訊) | 誤判最嚴重，未採用 |

### 2. 右軌 (資料庫檢索風險分數 $S_{RAG}$)
併發檢索政府 165 資料庫、Cofacts 與 Google Safe Browsing 外部 API，進行動態檢索與加權計分。

**最終風險分數 ($S_{final}$) 計算模型如下：**

$$S_{final} = 100, \text{if } x \in DB_{blacklist}$$
$$S_{final} = \alpha \cdot S_{NLP} + \beta \cdot S_{RAG}, \text{otherwise}$$

> **機制說明：** 若檢索特徵命中黑名單，觸發「一票否決熔斷機制」直接賦予 100 分（紅燈）以確保零漏判；若未直接命中，則以演算法自適應分配權重 ($\alpha, \beta$) 融合計算，確保高度穩定性與公信力。

---

## 🛠️ 技術棧與雲端部署 (Tech Stack & Deployment)

* **前端網頁與 LIFF (Client-Side)：** 部署於 Vercel 雲端平台，利用邊緣運算 (Edge Network) 提供無延遲載入體驗。
* **通訊閘道主控端 (Gateway)：** 採用 Node.js 部署於 AWS EC2 (Ubuntu Linux)，負責監聽 LINE Webhook 事件，並非同步調度外部查核 API。
* **演算中樞 (AI Core)：** 以 Python FastAPI 建構，搭載 RoBERTa-wwm 模型，無縫串接 Node.js 閘道器處理高併發推論請求。
* **資料庫 (Database)：** 採用 PostgreSQL。利用其 ACID 交易機制確保權限審核安全，並活用 JSONB 靈活格式儲存家庭群組的動態變動名單。

---

## 📂 完整系統文件與展示 (Documentation & Demo)

> 欲深入了解本系統的多模態處理流程、實際操作選單介面、系統循序圖 (Sequence Diagram)，請參閱下方之完整系統文件。

[📄 點擊查看：黃俊洋_真識監詐_AI語意防詐與家庭協防系統.pdf](https://drive.google.com/file/d/12gQqNaILdhfq-i1IFrR_gvoIbEsgndyZ/view?usp=sharing) 
