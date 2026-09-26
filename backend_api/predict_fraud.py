import csv
import time
import torch
import matplotlib.pyplot as plt
from pathlib import Path
from transformers import BertTokenizer, BertForSequenceClassification

MODEL_DIR = "./fraud_model_roberta"
MAX_LEN = 256
LOG_PATH = Path("pred_log.csv")

def load_model():
    tokenizer = BertTokenizer.from_pretrained(MODEL_DIR)
    model = BertForSequenceClassification.from_pretrained(MODEL_DIR)
    model.eval()
    return tokenizer, model

def predict(text: str, tokenizer, model):
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=MAX_LEN
    )
    with torch.no_grad():
        logits = model(**inputs).logits
        probs = torch.softmax(logits, dim=1)[0]
        pred = int(torch.argmax(probs).item())  # 0=非詐騙, 1=詐騙
        scam_p = float(probs[1])
        not_p = float(probs[0])
    return pred, scam_p, not_p

def ensure_log_header():
    if not LOG_PATH.exists():
        with LOG_PATH.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["ts", "pred", "scam_prob", "not_prob", "text"])

def append_log(text, pred, scam_p, not_p):
    ensure_log_header()
    with LOG_PATH.open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([int(time.time()), pred, f"{scam_p:.6f}", f"{not_p:.6f}", text.replace("\n", "\\n")])

def read_probs():
    if not LOG_PATH.exists():
        return []
    probs = []
    with LOG_PATH.open("r", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            try:
                probs.append(float(row["scam_prob"]))
            except:
                pass
    return probs

def plot_probs():
    probs = read_probs()
    if not probs:
        print("⚠️ pred_log.csv 目前沒有資料，先跑幾筆預測再 PLOT。")
        return

    plt.figure()
    plt.plot(list(range(1, len(probs) + 1)), probs)
    plt.xlabel("case index")
    plt.ylabel("scam probability")
    plt.title("Scam probability over inputs")
    plt.ylim(0, 1)
    plt.show()

    plt.figure()
    plt.hist(probs, bins=10)
    plt.xlabel("scam probability")
    plt.ylabel("count")
    plt.title("Scam probability distribution")
    plt.xlim(0, 1)
    plt.show()

def main():
    tokenizer, model = load_model()
    print("✅ 模型載入完成（純模型判斷，無關鍵字規則）。")
    print("📌 指令：")
    print(" - 貼情境（多行），輸入 END 送出")
    print(" - 輸入 PLOT 畫圖（用 pred_log.csv）")
    print(" - 直接空白 Enter 離開\n")

    while True:
        print("情境開始（輸入 END 送出 / PLOT 畫圖）:")
        first = input().strip()
        if first == "":
            return
        if first.upper() == "PLOT":
            plot_probs()
            continue

        lines = [first]
        while True:
            line = input()
            if line.strip().upper() == "END":
                break
            if line.strip() == "":
                return
            lines.append(line)

        text = "\n".join(lines).strip()
        pred, scam_p, not_p = predict(text, tokenizer, model)

        # 純模型輸出：用 pred + 機率分級
        if scam_p >= 0.70:
            msg = "🚨 高風險（模型判斷）"
        elif scam_p >= 0.40:
            msg = "⚠️ 可疑（模型判斷）"
        else:
            msg = "✅ 低風險（模型判斷）"

        print("\n" + msg)
        print(f"模型輸出：pred={pred} | 詐騙機率={scam_p:.3f} / 非詐騙機率={not_p:.3f}")

        append_log(text, pred, scam_p, not_p)
        print("📝 已記錄到 pred_log.csv")
        print("-" * 50)

if __name__ == "__main__":
    main()