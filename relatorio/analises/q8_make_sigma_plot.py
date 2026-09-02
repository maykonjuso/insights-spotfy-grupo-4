"""Roda apenas save_sigma_plot() usando os CSVs ja gerados."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from q8_bayes_hierarquico import save_sigma_plot
save_sigma_plot()
print("[done]")