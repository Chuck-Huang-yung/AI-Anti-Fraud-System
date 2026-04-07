from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Dict, Any


@dataclass
class HistoryHit:
    risk_level: str
    reply_text: str
    matched_pattern: str


class HistoryChecker:
    """
    簡易歷史比對：
    - 從 JSON 讀取 rules：[{pattern, risk_level, reply_text}, ...]
    - 用「包含關鍵字」做比對
    """
    def __init__(self, json_path: str | Path):
        self.json_path = Path(json_path)
        self.rules: List[Dict[str, Any]] = []
        self.load()

    def load(self) -> None:
        if not self.json_path.exists():
            self.rules = []
            return
        with self.json_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            raise ValueError("scam_history.json 必須是 JSON array（list）")
        self.rules = data

    def match(self, text: str) -> Optional[HistoryHit]:
        if not text:
            return None

        normalized = text.strip()
        for rule in self.rules:
            pattern = str(rule.get("pattern", "")).strip()
            if not pattern:
                continue

            # 目前先用最簡單的「包含」
            if pattern in normalized:
                return HistoryHit(
                    risk_level=str(rule.get("risk_level", "Yellow")),
                    reply_text=str(rule.get("reply_text", "疑似詐騙，請提高警覺。")),
                    matched_pattern=pattern,
                )

        return None
