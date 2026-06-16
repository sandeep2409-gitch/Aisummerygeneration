/* ==========================================================================
   Day 24 - AI Text Summarizer Interactive Engine
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const themeToggleBtn = document.getElementById('theme-toggle');
    const statusContainer = document.getElementById('status-container');
    const statusText = document.getElementById('status-text');
    const deviceBadge = document.getElementById('device-badge');
    const sourceTextarea = document.getElementById('source-text');
    const charCounter = document.getElementById('char-counter');
    const wordCounter = document.getElementById('word-counter');
    const modelSelect = document.getElementById('model-select');
    const lengthButtons = document.querySelectorAll('#length-selector .segment-btn');
    const customLengthSliders = document.getElementById('custom-length-sliders');
    const minWordsSlider = document.getElementById('min-words');
    const maxWordsSlider = document.getElementById('max-words');
    const minWordsVal = document.getElementById('min-words-val');
    const maxWordsVal = document.getElementById('max-words-val');
    const tempSlider = document.getElementById('slider-temp');
    const beamsSlider = document.getElementById('slider-beams');
    const tempVal = document.getElementById('temp-val');
    const beamsVal = document.getElementById('beams-val');
    const btnSummarize = document.getElementById('btn-summarize');
    const btnText = document.getElementById('btn-text');
    const btnSample = document.getElementById('btn-sample');
    const btnPaste = document.getElementById('btn-paste');
    const btnClear = document.getElementById('btn-clear');
    
    // Output DOM Elements
    const outputActionsContainer = document.getElementById('output-actions-container');
    const btnCopy = document.getElementById('btn-copy');
    const btnDownload = document.getElementById('btn-download');
    const btnSpeak = document.getElementById('btn-speak');
    const summaryEmpty = document.getElementById('summary-empty');
    const summaryLoading = document.getElementById('summary-loading');
    const summaryResult = document.getElementById('summary-result');
    const summaryTextEl = document.getElementById('summary-text');
    const loaderTitle = document.getElementById('loader-title');
    const loaderSubtitle = document.getElementById('loader-subtitle');
    
    // Analytics DOM Elements
    const analyticsPanel = document.getElementById('analytics-panel');
    const reductionRateEl = document.getElementById('reduction-rate');
    const metricOrigWordsEl = document.getElementById('metric-orig-words');
    const metricSumWordsEl = document.getElementById('metric-sum-words');
    const efficiencyProgressBar = document.getElementById('efficiency-progress');

    // App State
    let isModelReady = false;
    let pollInterval = null;
    let selectedLengthMode = 'medium'; // short, medium, long, custom
    let activeUtterance = null;
    let isSpeaking = false;

    // Sample text for immediate testing
    const sampleText = `Artificial Intelligence (AI) has experienced a remarkable evolution since its inception in the mid-20th century. What began as a series of theoretical discussions among mathematicians and computer scientists, including Alan Turing, has grown into a transformative force that shapes modern global industries. In the early days, researchers focused on symbolic AI, writing explicit rules to solve logic problems and play games like chess. However, these systems struggled with the ambiguity and complexity of real-world data, leading to periods of reduced funding and interest known as the "AI Winters." The paradigm shifted dramatically with the advent of Machine Learning, particularly Deep Learning. By utilizing multi-layered artificial neural networks, algorithms gained the ability to automatically discover patterns in large datasets. This breakthrough, powered by the rise of high-performance graphics processing units (GPUs) and massive internet-scale data collections, enabled monumental achievements in computer vision, speech recognition, and natural language processing. Today, large language models and generative artificial intelligence represent the frontier of this technology, assisting humans in writing, coding, medical research, and creative pursuits. As AI continues to integrate deeper into our daily lives, society must navigate complex ethical challenges, including data privacy, bias in decision-making algorithms, and the future of labor in an automated economy.`;

    // Loading messages to cycle through during inference
    const loadingTips = [
        "Ingesting source document...",
        "Analyzing semantics and structure...",
        "Evaluating key sentence clusters...",
        "Loading tensors into execution memory...",
        "Running deep learning inference...",
        "Generating model tokens...",
        "Polishing vocabulary and readability...",
        "Structuring summary outputs..."
    ];
    let tipIndex = 0;
    let tipTimer = null;

    /* ==========================================================================
       1. Theme / Dark Mode Logic
       ========================================================================== */
    const initTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.className = savedTheme;
            updateThemeIcon(savedTheme);
        } else {
            // Adaptive to system default
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const initialTheme = systemPrefersDark ? 'dark' : 'light';
            document.documentElement.className = initialTheme;
            updateThemeIcon(initialTheme);
        }
    };

    const updateThemeIcon = (theme) => {
        const icon = themeToggleBtn.querySelector('i');
        if (theme === 'dark') {
            icon.className = 'fa-solid fa-sun';
        } else {
            icon.className = 'fa-solid fa-moon';
        }
    };

    themeToggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark');
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.className = newTheme;
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });

    initTheme();

    /* ==========================================================================
       2. Model Polling & Status
       ========================================================================== */
    const updateStatusUI = (status, modelName, device, error) => {
        statusContainer.className = 'status-badge';
        deviceBadge.style.display = 'none';

        if (status === 'loading') {
            statusContainer.classList.add('status-loading');
            statusText.textContent = `Downloading Model...`;
            isModelReady = false;
            btnSummarize.disabled = true;
            modelSelect.disabled = true;
        } else if (status === 'ready') {
            statusContainer.classList.add('status-ready');
            // Clean up the model display name
            const cleanModelName = modelName.split('/').pop().toUpperCase();
            statusText.textContent = `${cleanModelName} Ready`;
            
            if (device) {
                deviceBadge.style.display = 'inline-block';
                deviceBadge.textContent = device.toUpperCase();
            }
            
            isModelReady = true;
            modelSelect.disabled = false;
            validateInputs();
        } else if (status === 'error') {
            statusContainer.classList.add('status-error');
            statusText.textContent = `Error: Load Failed`;
            isModelReady = false;
            btnSummarize.disabled = true;
            modelSelect.disabled = false;
            console.error("[Status] Server model loading error:", error);
        } else {
            statusContainer.classList.add('status-loading');
            statusText.textContent = `Initializing...`;
            isModelReady = false;
            btnSummarize.disabled = true;
        }
    };

    const checkModelStatus = async () => {
        try {
            const response = await fetch('/status');
            if (!response.ok) throw new Error("Status endpoint returned error");
            const data = await response.json();
            
            updateStatusUI(data.status, data.model_name, data.device, data.error);
            
            if (data.status === 'ready' || data.status === 'error') {
                if (pollInterval) {
                    clearInterval(pollInterval);
                    pollInterval = null;
                }
            }
        } catch (err) {
            console.error("Error fetching model status:", err);
            updateStatusUI('error', '', '', err.message);
        }
    };

    const startStatusPolling = () => {
        if (pollInterval) clearInterval(pollInterval);
        checkModelStatus();
        pollInterval = setInterval(checkModelStatus, 2000);
    };

    // Initialize polling on startup
    startStatusPolling();

    // Trigger loading of a different model
    modelSelect.addEventListener('change', async () => {
        const selectedModel = modelSelect.value;
        updateStatusUI('loading', selectedModel, '', '');
        
        try {
            const response = await fetch('/load-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_name: selectedModel })
            });
            if (!response.ok) throw new Error("Failed to post load-model");
            
            // Start polling status
            startStatusPolling();
        } catch (err) {
            console.error("Error switching model:", err);
            updateStatusUI('error', selectedModel, '', err.message);
        }
    });

    /* ==========================================================================
       3. Dynamic Input Validation & Word Counter
       ========================================================================== */
    const getWordCount = (text) => {
        const clean = text.trim();
        return clean === '' ? 0 : clean.split(/\s+/).length;
    };

    const validateInputs = () => {
        const text = sourceTextarea.value;
        const words = getWordCount(text);
        
        charCounter.textContent = `${text.length} character${text.length === 1 ? '' : 's'}`;
        wordCounter.textContent = `${words} word${words === 1 ? '' : 's'}`;
        
        if (words >= 10) {
            wordCounter.style.color = '';
            if (isModelReady) {
                btnSummarize.disabled = false;
                return;
            }
        } else {
            if (words > 0) {
                wordCounter.style.color = 'var(--badge-error-text)';
            } else {
                wordCounter.style.color = '';
            }
        }
        btnSummarize.disabled = true;
    };

    sourceTextarea.addEventListener('input', validateInputs);

    /* ==========================================================================
       4. Segmented Control & Slider Adjustments
       ========================================================================== */
    // Slider label updates
    minWordsSlider.addEventListener('input', () => {
        minWordsVal.textContent = minWordsSlider.value;
        // Make sure max is always at least equal to min
        if (parseInt(maxWordsSlider.value) < parseInt(minWordsSlider.value)) {
            maxWordsSlider.value = minWordsSlider.value;
            maxWordsVal.textContent = minWordsSlider.value;
        }
    });

    maxWordsSlider.addEventListener('input', () => {
        maxWordsVal.textContent = maxWordsSlider.value;
        // Make sure min is always at most equal to max
        if (parseInt(minWordsSlider.value) > parseInt(maxWordsSlider.value)) {
            minWordsSlider.value = maxWordsSlider.value;
            minWordsVal.textContent = maxWordsSlider.value;
        }
    });

    tempSlider.addEventListener('input', () => {
        tempVal.textContent = parseFloat(tempSlider.value).toFixed(1);
    });

    beamsSlider.addEventListener('input', () => {
        beamsVal.textContent = beamsSlider.value;
    });

    // Length Buttons Selection
    lengthButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            lengthButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            selectedLengthMode = btn.dataset.len;
            
            if (selectedLengthMode === 'custom') {
                // Show sliders
                customLengthSliders.style.display = 'block';
                // Trigger dynamic slider sync
                minWordsVal.textContent = minWordsSlider.value;
                maxWordsVal.textContent = maxWordsSlider.value;
            } else {
                // Hide sliders
                customLengthSliders.style.display = 'none';
                
                // Map presets directly to sliders
                minWordsSlider.value = btn.dataset.min;
                maxWordsSlider.value = btn.dataset.max;
                minWordsVal.textContent = btn.dataset.min;
                maxWordsVal.textContent = btn.dataset.max;
            }
        });
    });

    /* ==========================================================================
       5. Document Helper Actions (Paste, Clear, Sample)
       ========================================================================== */
    btnSample.addEventListener('click', () => {
        sourceTextarea.value = sampleText;
        validateInputs();
        sourceTextarea.focus();
    });

    btnClear.addEventListener('click', () => {
        sourceTextarea.value = '';
        validateInputs();
        sourceTextarea.focus();
    });

    btnPaste.addEventListener('click', async () => {
        try {
            const clipboardText = await navigator.clipboard.readText();
            sourceTextarea.value = clipboardText;
            validateInputs();
            sourceTextarea.focus();
        } catch (err) {
            alert("Could not access system clipboard. Please paste manually using Cmd+V / Ctrl+V.");
        }
    });

    /* ==========================================================================
       6. API Inference Execution
       ========================================================================== */
    const cycleLoadingTips = () => {
        tipIndex = (tipIndex + 1) % loadingTips.length;
        loaderSubtitle.textContent = loadingTips[tipIndex];
    };

    btnSummarize.addEventListener('click', async () => {
        const text = sourceTextarea.value.trim();
        if (getWordCount(text) < 10) return;

        // UI Loading State
        btnSummarize.disabled = true;
        btnText.textContent = "Processing...";
        sourceTextarea.disabled = true;
        modelSelect.disabled = true;
        lengthButtons.forEach(b => b.disabled = true);
        minWordsSlider.disabled = true;
        maxWordsSlider.disabled = true;
        tempSlider.disabled = true;
        beamsSlider.disabled = true;
        btnSample.disabled = true;
        btnPaste.disabled = true;
        btnClear.disabled = true;

        // Display results load structures
        summaryEmpty.style.display = 'none';
        summaryResult.style.display = 'none';
        analyticsPanel.style.display = 'none';
        outputActionsContainer.style.display = 'none';
        summaryLoading.style.display = 'flex';
        
        // Reset TTS
        stopSpeech();

        // Tip cycler
        tipIndex = 0;
        loaderSubtitle.textContent = loadingTips[0];
        tipTimer = setInterval(cycleLoadingTips, 3000);

        // API Request payload
        const payload = {
            text: text,
            model_name: modelSelect.value,
            min_length: parseInt(minWordsSlider.value),
            max_length: parseInt(maxWordsSlider.value),
            num_beams: parseInt(beamsSlider.value),
            temperature: parseFloat(tempSlider.value)
        };

        try {
            const response = await fetch('/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            clearInterval(tipTimer);
            tipTimer = null;

            if (!response.ok) {
                throw new Error(data.error || "Inference server error.");
            }

            // Populate summary text
            summaryTextEl.textContent = data.summary;
            summaryLoading.style.display = 'none';
            summaryResult.style.display = 'block';
            outputActionsContainer.style.display = 'flex';

            // Show Efficiency Metrics
            analyticsPanel.style.display = 'flex';
            metricOrigWordsEl.textContent = `${data.original_words} words`;
            metricSumWordsEl.textContent = `${data.summary_words} words`;
            
            const reduction = Math.round((1 - data.summary_words / data.original_words) * 100);
            reductionRateEl.textContent = `Saved ${reduction}%`;
            
            // Trigger animation frame on the progress bar
            setTimeout(() => {
                efficiencyProgressBar.style.width = `${reduction}%`;
            }, 100);

        } catch (err) {
            if (tipTimer) clearInterval(tipTimer);
            summaryLoading.style.display = 'none';
            summaryEmpty.style.display = 'flex';
            
            // Show alert styled error
            alert(`Summarization Error: ${err.message}`);
        } finally {
            // Restore interactive components
            btnSummarize.disabled = false;
            btnText.textContent = "Summarize Text";
            sourceTextarea.disabled = false;
            modelSelect.disabled = false;
            lengthButtons.forEach(b => b.disabled = false);
            minWordsSlider.disabled = false;
            maxWordsSlider.disabled = false;
            tempSlider.disabled = false;
            beamsSlider.disabled = false;
            btnSample.disabled = false;
            btnPaste.disabled = false;
            btnClear.disabled = false;
        }
    });

    /* ==========================================================================
       7. Output Actions (Copy, Save, TTS)
       ========================================================================== */
    // Clipboard Action
    btnCopy.addEventListener('click', async () => {
        const text = summaryTextEl.textContent;
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            const originalHTML = btnCopy.innerHTML;
            btnCopy.innerHTML = '<i class="fa-solid fa-check" style="color: #34c759;"></i> Copied!';
            btnCopy.style.borderColor = '#34c759';
            btnCopy.style.color = '#34c759';
            
            setTimeout(() => {
                btnCopy.innerHTML = originalHTML;
                btnCopy.style.borderColor = '';
                btnCopy.style.color = '';
            }, 2000);
        } catch (err) {
            alert("Failed to copy to clipboard.");
        }
    });

    // File download
    btnDownload.addEventListener('click', () => {
        const text = summaryTextEl.textContent;
        if (!text) return;

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `summary_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    });

    // Text to Speech
    const stopSpeech = () => {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        isSpeaking = false;
        btnSpeak.innerHTML = '<i class="fa-solid fa-volume-high"></i> Speak';
        btnSpeak.style.borderColor = '';
        btnSpeak.style.color = '';
    };

    const speakSummary = () => {
        const text = summaryTextEl.textContent;
        if (!text || !window.speechSynthesis) return;

        activeUtterance = new SpeechSynthesisUtterance(text);
        activeUtterance.onend = () => {
            stopSpeech();
        };
        activeUtterance.onerror = () => {
            stopSpeech();
        };

        btnSpeak.innerHTML = '<i class="fa-solid fa-circle-stop"></i> Stop';
        btnSpeak.style.borderColor = 'var(--accent)';
        btnSpeak.style.color = 'var(--accent)';
        isSpeaking = true;

        window.speechSynthesis.speak(activeUtterance);
    };

    btnSpeak.addEventListener('click', () => {
        if (isSpeaking) {
            stopSpeech();
        } else {
            speakSummary();
        }
    });

    // Clean speech on exit
    window.addEventListener('beforeunload', stopSpeech);
});
