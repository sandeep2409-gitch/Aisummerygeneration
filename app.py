import os
import threading
import torch
from flask import Flask, request, jsonify, render_template
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline

app = Flask(__name__)

# Default model
DEFAULT_MODEL = "sshleifer/distilbart-cnn-6-6"

class ModelManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.current_model_name = ""
        self.tokenizer = None
        self.model = None
        self.summarizer = None
        self.status = "idle"  # idle, loading, ready, error
        self.error_message = ""
        
        # Detect device
        if torch.cuda.is_available():
            self.device = "cuda"
        elif torch.backends.mps.is_available():
            self.device = "mps"
        else:
            self.device = "cpu"
        print(f"[ModelManager] Detected device: {self.device}")

    def get_status(self):
        with self.lock:
            return {
                "status": self.status,
                "model_name": self.current_model_name,
                "device": self.device,
                "error": self.error_message
            }

    def set_status(self, status, model_name, error=""):
        with self.lock:
            self.status = status
            self.current_model_name = model_name
            self.error_message = error

    def load_model_thread(self, model_name):
        try:
            self.set_status("loading", model_name)
            print(f"[ModelManager] Loading model {model_name} on {self.device}...")
            
            # Load tokenizer and model
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
            
            # Move model to device
            model = model.to(self.device)
            
            # Create pipeline
            summarizer = pipeline("summarization", model=model, tokenizer=tokenizer)
            
            with self.lock:
                self.tokenizer = tokenizer
                self.model = model
                self.summarizer = summarizer
                self.status = "ready"
                self.current_model_name = model_name
                
            print(f"[ModelManager] Model {model_name} loaded successfully and is ready.")
        except Exception as e:
            print(f"[ModelManager] Error loading model {model_name}: {e}")
            self.set_status("error", model_name, error=str(e))

    def load_model(self, model_name):
        with self.lock:
            if self.current_model_name == model_name and self.status == "ready":
                return
            if self.status == "loading" and self.current_model_name == model_name:
                return

        # Start background thread to load
        thread = threading.Thread(target=self.load_model_thread, args=(model_name,))
        thread.daemon = True
        thread.start()

    def summarize(self, text, max_length=150, min_length=30, num_beams=4, temperature=1.0):
        with self.lock:
            if self.status != "ready":
                raise ValueError("Model is not ready.")
            summarizer = self.summarizer
            model_name = self.current_model_name
            
        # T5 models expect the prefix "summarize: "
        if "t5" in model_name.lower():
            text = "summarize: " + text

        # Word count mapping and parameter adjustments
        input_length = len(text.split())
        
        # Ensure values make sense
        adjusted_max_length = min(max_length, input_length)
        adjusted_min_length = min(min_length, adjusted_max_length - 1)
        
        # Safeguards
        if adjusted_min_length < 5:
            adjusted_min_length = 5
        if adjusted_max_length <= adjusted_min_length:
            adjusted_max_length = adjusted_min_length + 10

        # Run pipeline
        result = summarizer(
            text,
            max_length=adjusted_max_length,
            min_length=adjusted_min_length,
            num_beams=int(num_beams),
            temperature=float(temperature),
            early_stopping=True
        )
        return result[0]['summary_text']

manager = ModelManager()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/status', methods=['GET'])
def get_status():
    return jsonify(manager.get_status())

@app.route('/load-model', methods=['POST'])
def load_model():
    data = request.get_json() or {}
    model_name = data.get('model_name', DEFAULT_MODEL)
    manager.load_model(model_name)
    return jsonify({"message": f"Started loading model {model_name} in background."})

@app.route('/summarize', methods=['POST'])
def summarize():
    status_info = manager.get_status()
    if status_info['status'] != 'ready':
        return jsonify({"error": f"Model is not ready. Current status: {status_info['status']}"}), 503
        
    data = request.get_json() or {}
    text = data.get('text', '').strip()
    if not text:
        return jsonify({"error": "Text to summarize cannot be empty."}), 400
        
    # Check word count
    word_count = len(text.split())
    if word_count < 10:
        return jsonify({"error": "Text is too short to summarize. Please enter at least 10 words."}), 400
        
    # Parameters
    min_length = int(data.get('min_length', 30))
    max_length = int(data.get('max_length', 150))
    num_beams = int(data.get('num_beams', 4))
    temperature = float(data.get('temperature', 1.0))
    
    try:
        summary = manager.summarize(
            text, 
            max_length=max_length, 
            min_length=min_length, 
            num_beams=num_beams, 
            temperature=temperature
        )
        return jsonify({
            "success": True,
            "summary": summary,
            "original_words": word_count,
            "summary_words": len(summary.split())
        })
    except Exception as e:
        return jsonify({"error": f"Summarization failed: {str(e)}"}), 500

# Pre-load default model on startup
with app.app_context():
    manager.load_model(DEFAULT_MODEL)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8888))
    app.run(host='0.0.0.0', port=port, debug=False)
