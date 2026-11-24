"""Client minimal pour l'API REST v2 de Bitvavo (données publiques + ordres signés)."""
import hashlib, hmac, json, os, time, urllib.error, urllib.parse, urllib.request

import pandas as pd

BASE = "https://api.bitvavo.com/v2"


class BitvavoError(RuntimeError):
    pass


class Bitvavo:
    def __init__(self, key=None, secret=None, operator_id=None, window_ms=10000):
        self.key = key or os.getenv("BITVAVO_API_KEY")
        self.secret = secret or os.getenv("BITVAVO_API_SECRET")
        self.operator_id = int(operator_id or os.getenv("BITVAVO_OPERATOR_ID", "1001"))
        self.window = str(window_ms)

    # ---------- bas niveau ----------
    def _request(self, method, path, params=None, body=None, signed=False):
        if params:
            path = path + "?" + urllib.parse.urlencode(params)
        data = json.dumps(body, separators=(",", ":")) if body is not None else ""
        headers = {"Content-Type": "application/json"}
        if signed:
            if not (self.key and self.secret):
                raise BitvavoError("Clé API manquante (BITVAVO_API_KEY / BITVAVO_API_SECRET).")
            ts = str(int(time.time() * 1000))
            msg = ts + method + "/v2" + path + data
            sig = hmac.new(self.secret.encode(), msg.encode(), hashlib.sha256).hexdigest()
            headers.update({
                "Bitvavo-Access-Key": self.key,
                "Bitvavo-Access-Signature": sig,
                "Bitvavo-Access-Timestamp": ts,
                "Bitvavo-Access-Window": self.window,
            })
        req = urllib.request.Request(BASE + path, data=data.encode() or None, method=method, headers=headers)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=20) as r:
                    return json.load(r)
            except urllib.error.HTTPError as e:
                detail = e.read().decode(errors="replace")
                if e.code >= 500 and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise BitvavoError(f"HTTP {e.code} sur {method} {path}: {detail}") from None
            except urllib.error.URLError:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise

    # ---------- public ----------
    def market_info(self, market):
        return self._request("GET", "/markets", {"market": market})

    def price(self, market):
        return float(self._request("GET", "/ticker/price", {"market": market})["price"])

    def candles(self, market, interval="4h", limit=1440, end=None):
        p = {"interval": interval, "limit": limit}
        if end:
            p["end"] = int(end)
        rows = self._request("GET", f"/{market}/candles", p)
        df = pd.DataFrame(rows, columns=["t", "open", "high", "low", "close", "volume"]).astype(float)
        df["t"] = pd.to_datetime(df["t"], unit="ms", utc=True)
        return df.sort_values("t").set_index("t")

    def history(self, market, interval="4h", bars=3000):
        """Récupère jusqu'à `bars` bougies en paginant vers le passé."""
        out, end = [], None
        while sum(len(x) for x in out) < bars:
            df = self.candles(market, interval, 1440, end)
            if df.empty:
                break
            out.append(df)
            end = df.index[0].value // 10**6 - 1
            if len(df) < 1440:
                break
        full = pd.concat(out).sort_index()
        return full[~full.index.duplicated()].iloc[-bars:]

    # ---------- privé (clé API requise) ----------
    def balances(self):
        return {b["symbol"]: float(b["available"]) for b in self._request("GET", "/balance", signed=True)}

    def market_order(self, market, side, amount_quote=None, amount=None):
        body = {"market": market, "side": side, "orderType": "market", "operatorId": self.operator_id}
        if amount_quote is not None:
            body["amountQuote"] = f"{amount_quote:.2f}"
        else:
            body["amount"] = amount
        return self._request("POST", "/order", body=body, signed=True)
