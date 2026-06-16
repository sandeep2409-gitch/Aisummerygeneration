import sys
print("Python Version:", sys.version)

print("Importing torch...")
import torch
print("Torch version:", torch.__version__)
print("MPS available:", torch.backends.mps.is_available())

print("Importing transformers...")
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
print("Transformers imported.")

model_name = "t5-small"
print(f"Loading tokenizer for {model_name}...")
tokenizer = AutoTokenizer.from_pretrained(model_name)
print("Tokenizer loaded successfully.")

print(f"Loading model for {model_name}...")
model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
print("Model loaded successfully.")

device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"Moving model to {device}...")
model = model.to(device)
print("Model moved to device successfully.")
