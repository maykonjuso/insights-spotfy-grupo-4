#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convergence diagnostics for Q9 NetCDF idata files."""
import sys
import json
import warnings
warnings.filterwarnings("ignore")

import arviz as az
import numpy as np

FILES = [
    "q9_baseline_gaussian.nc",
    "q9_extended_gaussian.nc",
    "q9_baseline_bernoulli.nc",
    "q9_extended_bernoulli.nc",
    "q9_dropone_NO_GENRE_MULTI.nc",
    "q9_dropone_NO_KEY.nc",
    "q9_dropone_NO_KEY_SIN.nc",
    "q9_dropone_NO_MODE.nc",
    "q9_dropone_NO_TIME_SIG.nc",
    "q9_smoke_test.nc",
]

BASE = r"C:/Users/tito/OneDrive/Documentos/Projetos/spotify_challenge/insights-spotfy-grupo-4/relatorio/analises/resultados"

def safe(fn, default=None):
    try:
        return fn()
    except Exception as e:
        return f"ERR: {type(e).__name__}: {str(e)[:80]}"

def diagnose(path):
    out = {"file": path.split("/")[-1]}
    try:
        idata = az.from_netcdf(path)
    except Exception as e:
        out["error"] = f"load failed: {type(e).__name__}: {str(e)[:120]}"
        return out

    # Divergences
    try:
        divs = idata.sample_stats["diverging"].values
        out["divergences"] = int(np.sum(divs))
    except Exception as e:
        out["divergences"] = f"NA ({type(e).__name__})"

    # R-hat
    try:
        rhat = az.rhat(idata)
        # extract max
        rhats = []
        for v in rhat.data_vars:
            arr = np.asarray(rhat[v].values)
            arr = arr[np.isfinite(arr)]
            if arr.size:
                rhats.append(arr)
        if rhats:
            all_r = np.concatenate(rhats)
            out["rhat_max"] = float(np.nanmax(all_r))
        else:
            out["rhat_max"] = None
    except Exception as e:
        out["rhat_max"] = f"ERR: {type(e).__name__}: {str(e)[:60]}"

    # ESS bulk and tail
    try:
        ess_b = az.ess(idata, method="bulk")
        ess_t = az.ess(idata, method="tail")
        eb_vals, et_vals = [], []
        for v in ess_b.data_vars:
            a = np.asarray(ess_b[v].values)
            a = a[np.isfinite(a)]
            if a.size: eb_vals.append(a)
        for v in ess_t.data_vars:
            a = np.asarray(ess_t[v].values)
            a = a[np.isfinite(a)]
            if a.size: et_vals.append(a)
        if eb_vals:
            out["ess_bulk_min"] = float(np.nanmin(np.concatenate(eb_vals)))
        else:
            out["ess_bulk_min"] = None
        if et_vals:
            out["ess_tail_min"] = float(np.nanmin(np.concatenate(et_vals)))
        else:
            out["ess_tail_min"] = None
    except Exception as e:
        out["ess_bulk_min"] = f"ERR: {type(e).__name__}: {str(e)[:60]}"
        out["ess_tail_min"] = f"ERR: {type(e).__name__}: {str(e)[:60]}"

    # Pareto k from LOO
    try:
        loo = az.loo(idata, pointwise=True)
        k = np.asarray(loo.pareto_k.values)
        k = k[np.isfinite(k)]
        out["pareto_k_max"] = float(np.max(k)) if k.size else None
        out["pareto_k_gt_07"] = int(np.sum(k > 0.7)) if k.size else None
        out["pareto_k_gt_05"] = int(np.sum(k > 0.5)) if k.size else None
    except Exception as e:
        out["pareto_k_max"] = f"ERR: {type(e).__name__}: {str(e)[:80]}"
        out["pareto_k_gt_07"] = None
        out["pareto_k_gt_05"] = None

    return out

def main():
    results = []
    for fname in FILES:
        path = f"{BASE}/{fname}"
        r = diagnose(path)
        results.append(r)
        print(json.dumps(r, ensure_ascii=False))
    with open(f"{BASE}/_diag_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
