// mobile/config.ts

// 🌟 1. 全域統一的後端 API 網址 (只要 ngrok 或 localtunnel 重開，改這裡就好！)
export const API_URL = "https://36d7-220-130-167-166.ngrok-free.app";

// 🌟 2. 全域統一的 Axios 請求標頭 (順便把你要繞過 ngrok/localtunnel 警告的設定集中起來)
export const AXIOS_CONFIG = {
  headers: {
    "ngrok-skip-browser-warning": "true",
    "Bypass-Tunnel-Reminder": "true",
  },
};

// 🌟 3. 全域統一的 LINE LIFF ID (順便收納，以後想換 Bot 測試也方便)
export const LIFF_ID = "2009712421-QF2zlOtI";
