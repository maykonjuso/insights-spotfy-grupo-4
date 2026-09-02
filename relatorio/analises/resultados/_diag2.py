#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convergence diagnostics for Q9 NetCDF idata files (lighter version)."""
import sys
import json
import warnings
warnings.filterwarnings("ignore")

import arviz as az
import numpy as np

BASE = r"C:/Users/tito/OneDrive/Documentos/Projetos/spotify_challenge/insights-spotfy-grupo-4/relatorio/analises/resultados"

FILES = [
    "q9_smoke_test.nc",
    "q9_baseline_gaussian.nc",
    "q9_baseline_bernoulli.nc",
    "q9_extended_gaussian.nc",
    "q9_extended_bernoulli.nc",
    "q9_dropone_NO_GENRE_MULTI.nc",
    "q9_dropone_NO_KEY.nc",
    "q9_dropone_NO_KEY_SIN.nc",
    "q9_dropone_NO_MODE.nc",
    "q9_dropone_NO_TIME_SIG.nc",
]

def main():
    results = []
    for fname in FILES:
        path = f"{BASE}/{fname}"
        print(f"START {fname}", flush=True)
        r = {"file": fname}
        try:
            idata = az.from_netcdf(path)
        except Exception as e:
            r["error"] = f"load failed: {type(e).__name__}: {str(e)[:120]}"
            results.append(r)
            print(f"DONE {fname} LOAD_ERR", flush=True)
            continue

        # Divergences
        try:
            divs = idata.sample_stats["diverging"].values
            r["divergences"] = int(np.sum(divs))
        except Exception as e:
            r["divergences"] = None

        # R-hat
        try:
            rhat = az.rhat(idata)
            rhats = []
            for v in rhat.data_vars:
                arr = np.asarray(rhat[v].values)
                arr = arr[np.isfinite(arr)]
                if arr.size:
                    rhats.append(arr)
            if rhats:
                r["rhat_max"] = float(np.nanmax(np.concatenate(rhats)))
            else:
                r["rhat_max"] = None
        except Exception as e:
            r["rhat_max"] = None

        # ESS bulk and tail
        try:
            ess_b = az.ess(idata, method="bulk")
            eb_vals = []
            for v in ess_b.data_vars:
                a = np.asarray(ess_b[v].values)
                a = a[np.isfinite(a)]
                if a.size: eb_vals.append(a)
            r["ess_bulk_min"] = float(np.nanmin(np.concatenate(eb_vals))) if eb_vals else None
        except Exception:
            r["ess_bulk_min"] = None

        try:
            ess_t = az.ess(idata, method="tail")
            et_vals = []
            for v in ess_t.data_vars:
                a = np.asarray(ess_t[v].values)
                a = a[np.isfinite(a)]
                if a.size: et_vals.append(a)
            r["ess_tail_min"] = float(np.nanmin(np.concatenate(et_vals))) if et_vals else None
        except Exception:
            r["ess_tail_min"] = None

        # Pareto k from LOO (lightweight: skip if too slow)
        try:
            loo = az.loo(idata, pointwise=True)
            k = np.asarray(loo.pareto_k.values)
            k = k[np.isfinite(k)]
            r["pareto_k_max"] = float(np.max(k)) if k.size else None
            r["pareto_k_gt_07"] = int(np.sum(k > 0.7)) if k.size else None
            r["pareto_k_gt_05"] = int(np.sum(k > 0.5)) if k.size else None
        except Exception as e:
            r["pareto_k_max"] = f"ERR: {type(e).__name__}: {str(e)[:60]}"
            r["pareto_k_gt_07"] = None
            r["pareto_k_gt_05"] = None

        results.append(r)
        # Write incrementally
        with open(f"{BASE}/_diag_results.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"DONE {fname}", flush=True)

    print("ALL DONE", flush=True)

if __name__ == "__main__":
    main()
