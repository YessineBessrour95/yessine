"""Analyse technique des marchés EUR de Bitvavo (données publiques, aucune clé API)."""
import json, sys, urllib.request
import pandas as pd, numpy as np

API = "https://api.bitvavo.com/v2"

def get(path):
    with urllib.request.urlopen(API + path, timeout=20) as r:
        return json.load(r)

def candles(market, interval="1d", limit=400):
    rows = get(f"/{market}/candles?interval={interval}&limit={limit}")
    df = pd.DataFrame(rows, columns=["t", "open", "high", "low", "close", "volume"]).astype(float)
    df["t"] = pd.to_datetime(df["t"], unit="ms")
    return df.sort_values("t").set_index("t")

def rsi(s, n=14):
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)

def analyse(market):
    df = candles(market)
    c, h, l = df["close"], df["high"], df["low"]
    sma20, sma50, sma200 = c.rolling(20).mean(), c.rolling(50).mean(), c.rolling(200).mean()
    ema12, ema26 = c.ewm(span=12).mean(), c.ewm(span=26).mean()
    macd = ema12 - ema26; sig = macd.ewm(span=9).mean()
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.rolling(14).mean()
    bb_std = c.rolling(20).std()
    vol30 = np.log(c).diff().rolling(30).std() * np.sqrt(365) * 100
    last = c.iloc[-1]
    r = rsi(c).iloc[-1]
    score = 0
    score += 1 if last > sma50.iloc[-1] else -1
    score += 1 if pd.notna(sma200.iloc[-1]) and last > sma200.iloc[-1] else -1
    score += 1 if sma50.iloc[-1] > (sma200.iloc[-1] if pd.notna(sma200.iloc[-1]) else 0) else -1
    score += 1 if macd.iloc[-1] > sig.iloc[-1] else -1
    trend = {4: "Haussier fort", 2: "Haussier", 0: "Neutre", -2: "Baissier", -4: "Baissier fort"}.get(score, "Mitigé")
    rsi_txt = "suracheté" if r > 70 else "survendu" if r < 30 else "neutre"
    return {
        "marché": market,
        "prix": last,
        "var_24h_%": (last / c.iloc[-2] - 1) * 100,
        "var_7j_%": (last / c.iloc[-8] - 1) * 100,
        "var_30j_%": (last / c.iloc[-31] - 1) * 100,
        "RSI14": r, "RSI_état": rsi_txt,
        "SMA20": sma20.iloc[-1], "SMA50": sma50.iloc[-1], "SMA200": sma200.iloc[-1],
        "MACD>signal": bool(macd.iloc[-1] > sig.iloc[-1]),
        "BB_bas": sma20.iloc[-1] - 2 * bb_std.iloc[-1], "BB_haut": sma20.iloc[-1] + 2 * bb_std.iloc[-1],
        "ATR14_%": atr.iloc[-1] / last * 100,
        "volat_30j_ann_%": vol30.iloc[-1],
        "support_30j": l.iloc[-30:].min(), "résistance_30j": h.iloc[-30:].max(),
        "score": score, "tendance": trend,
    }

if __name__ == "__main__":
    t24 = pd.DataFrame(get("/ticker/24h"))
    t24 = t24[t24["market"].str.endswith("-EUR")].copy()
    t24["volumeQuote"] = pd.to_numeric(t24["volumeQuote"], errors="coerce")
    top = t24.sort_values("volumeQuote", ascending=False).head(15)
    print("=== Top 15 marchés EUR par volume 24h ===")
    print(top[["market", "last", "volumeQuote"]].to_string(index=False))
    markets = sys.argv[1:] or ["BTC-EUR", "ETH-EUR", "SOL-EUR", "XRP-EUR", "ADA-EUR", "DOGE-EUR", "LINK-EUR"]
    res = pd.DataFrame([analyse(m) for m in markets]).set_index("marché")
    pd.set_option("display.width", 250); pd.set_option("display.max_columns", 50)
    print("\n=== Analyse technique (bougies journalières) ===")
    print(res.round(4).T.to_string())
    res.to_csv("bitvavo/analyse_resultats.csv")
