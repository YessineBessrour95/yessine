"""Sélection automatique des cryptos à analyser et classement des opportunités."""
import pandas as pd

STABLES = {"USDC", "USDT", "EURC", "EURT", "DAI", "TUSD", "PYUSD", "FDUSD", "USDE", "EURQ", "EURR", "USDQ", "USDR"}


def univers(api, top=30, volume_min_eur=300_000, exclure=()):
    """Les `top` marchés EUR les plus échangés sur 24h, hors stablecoins."""
    t = pd.DataFrame(api._request("GET", "/ticker/24h"))
    t = t[t["market"].str.endswith("-EUR")].copy()
    t["base"] = t["market"].str.split("-").str[0]
    t["volumeQuote"] = pd.to_numeric(t["volumeQuote"], errors="coerce")
    t = t[~t["base"].isin(STABLES) & ~t["market"].isin(exclure) & (t["volumeQuote"] >= volume_min_eur)]
    return t.sort_values("volumeQuote", ascending=False)["market"].head(top).tolist()


def force(d):
    """Score de force de tendance : performance sur 30 jours (plus c'est haut, mieux c'est)."""
    return d["close"] / d["close"].shift(30) - 1
