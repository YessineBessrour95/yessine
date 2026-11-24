"""Stratégie de suivi de tendance (bougies journalières) avec filtre RSI et stop suiveur ATR.

Entrée : EMA rapide > EMA lente, clôture > EMA lente, RSI entre rsi_min et rsi_max,
         et tendance de fond haussière (clôture > EMA longue).
Sortie : clôture < EMA lente, ou stop suiveur (plus haut depuis l'entrée - atr_mult * ATR).
"""
import pandas as pd

PARAMS = dict(ema_fast=10, ema_slow=30, ema_trend=100, rsi_min=50, rsi_max=80, atr_mult=3.0)
INTERVALLE = "1d"


def indicateurs(df, p=PARAMS):
    c, h, l = df["close"], df["high"], df["low"]
    out = df.copy()
    out["ema_f"] = c.ewm(span=p["ema_fast"], adjust=False).mean()
    out["ema_s"] = c.ewm(span=p["ema_slow"], adjust=False).mean()
    out["ema_t"] = c.ewm(span=p["ema_trend"], adjust=False).mean()
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    out["rsi"] = 100 - 100 / (1 + up / dn)
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    out["atr"] = tr.ewm(alpha=1 / 14, adjust=False).mean()
    return out


def signal_entree(row, p=PARAMS):
    return (row.ema_f > row.ema_s and row.close > row.ema_s and row.close > row.ema_t
            and p["rsi_min"] <= row.rsi <= p["rsi_max"])


def signal_sortie(row, plus_haut, p=PARAMS):
    """Retourne une raison de sortie ou None."""
    if row.close < row.ema_s:
        return "clôture sous EMA lente"
    if row.close < plus_haut - p["atr_mult"] * row.atr:
        return "stop suiveur ATR"
    return None
