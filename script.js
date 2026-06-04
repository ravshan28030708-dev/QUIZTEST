// Core Application Logic
class QuizApp {
    constructor() {
        this.questions = [];
        this.currentSection = 0;
        this.currentQuestion = 0;
        this.userAnswers = {};
        this.bookmarkedQuestions = new Set();
        this.timer = null;
        this.timeRemaining = 3600; // 60 minutes in seconds
        this.testStartTime = null;
        this.stats = this.loadStats();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.registerServiceWorker();
        this.loadTheme();
        this.updateStatsDisplay();
    }

    setupEventListeners() {
        // Theme Toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        
        // Stats Button
        document.getElementById('statsBtn').addEventListener('click', () => this.showStatsPage());
        
        // Upload
        const uploadBox = document.getElementById('uploadBox');
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.querySelector('.upload-btn');
        
        uploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadBox.classList.add('dragover');
        });
        
        uploadBox.addEventListener('dragleave', () => {
            uploadBox.classList.remove('dragover');
        });
        
        uploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadBox.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileUpload(files[0]);
            }
        });
        
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files[0]);
            }
        });
        
        // Back to Home
        document.getElementById('backToHome').addEventListener('click', () => {
            this.showPage('homePage');
        });
        
        // Quiz Navigation
        document.getElementById('prevBtn').addEventListener('click', () => this.previousQuestion());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextQuestion());
        document.getElementById('finishBtn').addEventListener('click', () => this.showFinishModal());
        document.getElementById('bookmarkBtn').addEventListener('click', () => this.toggleBookmark());
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('reviewBtn').addEventListener('click', () => this.showReviewModal());
        document.getElementById('searchBtn').addEventListener('click', () => this.showSearchModal());
        
        // Results Tab Navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        // Modal Buttons
        document.getElementById('confirmFinish').addEventListener('click', () => this.finishTest());
        document.getElementById('cancelFinish').addEventListener('click', () => this.hideFinishModal());
        document.getElementById('closeSearch').addEventListener('click', () => this.hideSearchModal());
        document.getElementById('closeReview').addEventListener('click', () => this.hideReviewModal());
        document.getElementById('retakeBtn').addEventListener('click', () => this.retakeTest());
        document.getElementById('exportPdfBtn').addEventListener('click', () => this.exportPdf());
        document.getElementById('printBtn').addEventListener('click', () => this.printResults());
        document.getElementById('closeStatsBtn').addEventListener('click', () => this.showPage('homePage'));
        
        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => this.searchQuestions(e.target.value));
        
        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker registration failed:', err));
        }
    }

    loadTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            document.getElementById('themeToggle').textContent = '☀️';
        }
    }

    toggleTheme() {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        document.getElementById('themeToggle').textContent = isDark ? '☀️' : '🌙';
    }

    async handleFileUpload(file) {
        // Validate file
        const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'];
        if (!validTypes.includes(file.type)) {
            alert('Please upload a PDF, DOCX, JPG, or PNG file');
            return;
        }

        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            alert('File size must be less than 50MB');
            return;
        }

        this.showProcessing();
        try {
            const text = await this.extractTextFromFile(file);
            await this.analyzeWithAI(text);
        } catch (error) {
            console.error('Upload error:', error);
            alert('Error processing file. Please try again.');
            this.hideProcessing();
        }
    }

    async extractTextFromFile(file) {
        let text = '';

        if (file.type === 'application/pdf') {
            text = await this.extractFromPDF(file);
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            text = await this.extractFromDocx(file);
        } else if (file.type === 'image/jpeg' || file.type === 'image/png') {
            text = await this.extractFromImage(file);
        }

        return text;
    }

    async extractFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            text += textContent.items.map(item => item.str).join(' ') + '\n';
            this.updateProgress((i / pdf.numPages) * 50);
        }

        return text;
    }

    async extractFromDocx(file) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    }

    async extractFromImage(file) {
        const reader = new FileReader();
        return new Promise((resolve) => {
            reader.onload = async (e) => {
                const { data: { text } } = await Tesseract.recognize(e.target.result, 'eng');
                resolve(text);
            };
            reader.readAsDataURL(file);
        });
    }

    async analyzeWithAI(text) {
        this.updateStatus('Analyzing with AI...');
        this.updateProgress(60);

        try {
            // Call backend API
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            const data = await response.json();
            this.questions = data.questions;
            this.createSections();
            this.updateProgress(100);
            this.hideProcessing();
            this.showSectionsPage();
        } catch (error) {
            console.error('AI analysis error:', error);
            // Mock data for demo
            this.generateMockQuestions();
            this.hideProcessing();
            this.showSectionsPage();
        }
    }

    generateMockQuestions() {
        // Demo data for testing
        const mockQuestions = [
            {
                question: 'What is the capital of France?',
                options: ['Paris', 'London', 'Berlin', 'Madrid'],
                correct: 0,
                explanation: 'Paris is the capital and largest city of France.'
            },
            {
                question: 'What is 2 + 2?',
                options: ['3', '4', '5', '6'],
                correct: 1,
                explanation: 'Basic arithmetic: 2 + 2 = 4'
            },
            {
                question: 'What is the largest planet in our solar system?',
                options: ['Saturn', 'Neptune', 'Jupiter', 'Mars'],
                correct: 2,
                explanation: 'Jupiter is the largest planet in the solar system.'
            }
        ];
        this.questions = mockQuestions;
    }

    createSections() {
        const sections = [];
        const questionsPerSection = 25;
        
        for (let i = 0; i < this.questions.length; i += questionsPerSection) {
            sections.push(this.questions.slice(i, i + questionsPerSection));
        }

        this.sections = sections;
        this.renderSections();
    }

    renderSections() {
        const container = document.getElementById('sectionsContainer');
        container.innerHTML = '';

        this.sections.forEach((section, index) => {
            const card = document.createElement('div');
            card.className = 'section-card';
            card.innerHTML = `
                <div class="section-icon">📚</div>
                <h3 class="section-title">Section ${index + 1}</h3>
                <p class="section-info">${section.length} questions</p>
                <span class="section-badge">Practice Test</span>
                <button class="section-btn" onclick="app.startQuiz(${index})">Start Section</button>
            `;
            container.appendChild(card);
        });

        // Add Mixed Questions section
        if (this.sections.length > 1) {
            const mixedCard = document.createElement('div');
            mixedCard.className = 'section-card';
            mixedCard.innerHTML = `
                <div class="section-icon">🔀</div>
                <h3 class="section-title">Mixed Questions</h3>
                <p class="section-info">25 random questions</p>
                <span class="section-badge">Challenge</span>
                <button class="section-btn" onclick="app.startMixedQuiz()">Start Quiz</button>
            `;
            container.appendChild(mixedCard);
        }
    }

    startQuiz(sectionIndex) {
        this.currentSection = sectionIndex;
        this.currentQuestion = 0;
        this.userAnswers = {};
        this.bookmarkedQuestions.clear();
        this.testStartTime = Date.now();
        this.timeRemaining = 3600;
        this.startTimer();
        this.showPage('quizPage');
        this.renderQuestion();
    }

    startMixedQuiz() {
        const allQuestions = this.questions;
        const mixed = allQuestions.sort(() => Math.random() - 0.5).slice(0, 25);
        this.sections = [mixed];
        this.startQuiz(0);
    }

    startTimer() {
        if (this.timer) clearInterval(this.timer);
        
        this.timer = setInterval(() => {
            this.timeRemaining--;
            this.updateTimerDisplay();

            if (this.timeRemaining <= 0) {
                this.finishTest();
            }
        }, 1000);
    }

    updateTimerDisplay() {
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        document.getElementById('timerDisplay').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        if (this.timeRemaining <= 600) { // Last 10 minutes
            document.getElementById('timerDisplay').style.color = '#ef4444';
        }
    }

    renderQuestion() {
        const section = this.sections[this.currentSection];
        const question = section[this.currentQuestion];

        // Update progress
        const totalQuestions = section.length;
        const progress = ((this.currentQuestion + 1) / totalQuestions) * 100;
        document.getElementById('progressBarQuiz').style.width = progress + '%';
        document.getElementById('questionCount').textContent = `Question ${this.currentQuestion + 1}/${totalQuestions}`;
        document.getElementById('currentSection').textContent = `Section ${this.currentSection + 1}`;

        // Render question
        document.getElementById('questionText').textContent = question.question;

        // Render options
        const optionsContainer = document.getElementById('optionsContainer');
        optionsContainer.innerHTML = '';

        question.options.forEach((option, index) => {
            const button = document.createElement('button');
            button.className = 'option';
            button.innerHTML = `<span class="option-text">${String.fromCharCode(65 + index)}. ${option}</span>`;
            
            const questionId = `${this.currentSection}-${this.currentQuestion}`;
            if (this.userAnswers[questionId] === index) {
                button.classList.add('selected');
            }

            button.addEventListener('click', () => this.selectAnswer(index));
            optionsContainer.appendChild(button);
        });

        // Update bookmark button
        const questionId = `${this.currentSection}-${this.currentQuestion}`;
        const bookmarkBtn = document.getElementById('bookmarkBtn');
        if (this.bookmarkedQuestions.has(questionId)) {
            bookmarkBtn.classList.add('bookmarked');
            bookmarkBtn.textContent = '💛';
        } else {
            bookmarkBtn.classList.remove('bookmarked');
            bookmarkBtn.textContent = '🔖';
        }

        // Hide explanation initially
        document.getElementById('explanationBox').style.display = 'none';

        // Update navigation buttons
        document.getElementById('prevBtn').disabled = this.currentQuestion === 0;
        document.getElementById('nextBtn').disabled = this.currentQuestion === section.length - 1;

        this.saveProgress();
    }

    selectAnswer(optionIndex) {
        const questionId = `${this.currentSection}-${this.currentQuestion}`;
        this.userAnswers[questionId] = optionIndex;
        this.renderQuestion();
    }

    nextQuestion() {
        const section = this.sections[this.currentSection];
        if (this.currentQuestion < section.length - 1) {
            this.currentQuestion++;
            this.renderQuestion();
        }
    }

    previousQuestion() {
        if (this.currentQuestion > 0) {
            this.currentQuestion--;
            this.renderQuestion();
        }
    }

    toggleBookmark() {
        const questionId = `${this.currentSection}-${this.currentQuestion}`;
        if (this.bookmarkedQuestions.has(questionId)) {
            this.bookmarkedQuestions.delete(questionId);
        } else {
            this.bookmarkedQuestions.add(questionId);
        }
        this.renderQuestion();
    }

    toggleFullscreen() {
        const quizPage = document.getElementById('quizPage');
        if (!document.fullscreenElement) {
            quizPage.requestFullscreen().catch(err => {
                alert(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    showFinishModal() {
        document.getElementById('finishModal').classList.remove('hidden');
    }

    hideFinishModal() {
        document.getElementById('finishModal').classList.add('hidden');
    }

    finishTest() {
        clearInterval(this.timer);
        const results = this.calculateResults();
        this.displayResults(results);
        this.saveStats(results);
        this.showPage('resultsPage');
    }

    calculateResults() {
        const section = this.sections[this.currentSection];
        let correct = 0, wrong = 0, skipped = 0;
        const analysis = [];

        section.forEach((question, index) => {
            const questionId = `${this.currentSection}-${index}`;
            const userAnswer = this.userAnswers[questionId];

            let result = {
                question: question.question,
                userAnswer: userAnswer !== undefined ? question.options[userAnswer] : 'Not answered',
                correctAnswer: question.options[question.correct],
                isCorrect: userAnswer === question.correct,
                explanation: question.explanation || ''
            };

            if (userAnswer === undefined) {
                skipped++;
            } else if (userAnswer === question.correct) {
                correct++;
            } else {
                wrong++;
            }

            analysis.push(result);
        });

        const total = section.length;
        const percentage = (correct / total) * 100;
        const score = Math.round(percentage);

        return {
            correct,
            wrong,
            skipped,
            total,
            percentage: Math.round(percentage * 100) / 100,
            score,
            grade: this.calculateGrade(score),
            analysis,
            timestamp: new Date()
        };
    }

    calculateGrade(score) {
        if (score >= 90) return '5 (A)';
        if (score >= 70) return '4 (C)';
        if (score >= 60) return '3 (D)';
        return '2 (F)';
    }

    displayResults(results) {
        document.getElementById('correctCount').textContent = results.correct;
        document.getElementById('wrongCount').textContent = results.wrong;
        document.getElementById('skippedCount').textContent = results.skipped;
        document.getElementById('scoreText').textContent = `Score: ${results.score}/100`;
        document.getElementById('percentageText').textContent = `Percentage: ${results.percentage}%`;
        document.getElementById('gradeValue').textContent = results.grade.split(' ')[0];

        // Render analysis
        const analysisContainer = document.getElementById('analysisContainer');
        analysisContainer.innerHTML = '';

        results.analysis.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `analysis-item ${item.isCorrect ? 'correct' : 'incorrect'}`;
            div.innerHTML = `
                <div class="analysis-question">Q${index + 1}: ${item.question}</div>
                <div class="analysis-answer">Your answer: <strong>${item.userAnswer}</strong></div>
                <div class="analysis-answer">Correct answer: <strong>${item.correctAnswer}</strong></div>
                ${item.explanation ? `<div class="analysis-answer">Explanation: ${item.explanation}</div>` : ''}
                <span class="analysis-result ${item.isCorrect ? 'correct' : 'incorrect'}">
                    ${item.isCorrect ? '✔ Correct' : '✖ Wrong'}
                </span>
            `;
            analysisContainer.appendChild(div);
        });

        // Draw chart
        this.drawResultsChart(results);
    }

    drawResultsChart(results) {
        const ctx = document.getElementById('resultsChart').getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Correct', 'Wrong', 'Skipped'],
                datasets: [{
                    data: [results.correct, results.wrong, results.skipped],
                    backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                    borderColor: ['#059669', '#dc2626', '#d97706'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    showReviewModal() {
        const section = this.sections[this.currentSection];
        const reviewContainer = document.getElementById('reviewContainer');
        reviewContainer.innerHTML = '';

        section.forEach((question, index) => {
            const questionId = `${this.currentSection}-${index}`;
            const isAnswered = this.userAnswers[questionId] !== undefined;
            const item = document.createElement('div');
            item.className = 'review-item';
            item.innerHTML = `
                <div class="review-item-number">Q${index + 1}</div>
                <div class="review-item-text">${question.question.substring(0, 50)}...</div>
                <span class="review-item-status ${isAnswered ? 'answered' : 'unanswered'}">
                    ${isAnswered ? '✔ Answered' : '⚠ Unanswered'}
                </span>
            `;
            item.addEventListener('click', () => {
                this.currentQuestion = index;
                this.renderQuestion();
                this.hideReviewModal();
            });
            reviewContainer.appendChild(item);
        });

        document.getElementById('reviewModal').classList.remove('hidden');
    }

    hideReviewModal() {
        document.getElementById('reviewModal').classList.add('hidden');
    }

    showSearchModal() {
        document.getElementById('searchModal').classList.remove('hidden');
    }

    hideSearchModal() {
        document.getElementById('searchModal').classList.add('hidden');
    }

    searchQuestions(query) {
        const section = this.sections[this.currentSection];
        const results = section
            .map((q, i) => ({ question: q, index: i }))
            .filter(item => item.question.question.toLowerCase().includes(query.toLowerCase()));

        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = '';

        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `
                <div>${item.question.question}</div>
                <div class="search-result-text">Question ${item.index + 1}</div>
            `;
            div.addEventListener('click', () => {
                this.currentQuestion = item.index;
                this.renderQuestion();
                this.hideSearchModal();
            });
            resultsContainer.appendChild(div);
        });
    }

    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        event.target.classList.add('active');
        document.getElementById(tab + 'Tab').classList.add('active');
    }

    exportPdf() {
        const element = document.getElementById('resultsPage');
        const opt = {
            margin: 10,
            filename: `QUIZTEST_Results_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
        };
        html2pdf().set(opt).from(element).save();
    }

    printResults() {
        window.print();
    }

    retakeTest() {
        this.showPage('sectionsPage');
    }

    saveProgress() {
        localStorage.setItem('quizProgress', JSON.stringify({
            currentSection: this.currentSection,
            currentQuestion: this.currentQuestion,
            userAnswers: this.userAnswers,
            timeRemaining: this.timeRemaining,
            bookmarkedQuestions: Array.from(this.bookmarkedQuestions)
        }));
    }

    loadStats() {
        const saved = localStorage.getItem('quizStats');
        return saved ? JSON.parse(saved) : [];
    }

    saveStats(results) {
        this.stats.push(results);
        localStorage.setItem('quizStats', JSON.stringify(this.stats));
    }

    updateStatsDisplay() {
        if (this.stats.length === 0) {
            document.getElementById('totalTests').textContent = '0';
            document.getElementById('avgScore').textContent = '0';
            document.getElementById('bestScore').textContent = '0';
            document.getElementById('worstScore').textContent = '0';
            return;
        }

        const scores = this.stats.map(s => s.score);
        const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

        document.getElementById('totalTests').textContent = this.stats.length;
        document.getElementById('avgScore').textContent = avgScore;
        document.getElementById('bestScore').textContent = Math.max(...scores);
        document.getElementById('worstScore').textContent = Math.min(...scores);

        this.drawStatsCharts();
    }

    drawStatsCharts() {
        // Grade Distribution
        const gradeCounts = { '2': 0, '3': 0, '4': 0, '5': 0 };
        this.stats.forEach(s => {
            const grade = s.grade.split(' ')[0];
            gradeCounts[grade]++;
        });

        const gradeCtx = document.getElementById('gradeChart').getContext('2d');
        new Chart(gradeCtx, {
            type: 'bar',
            data: {
                labels: ['Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'],
                datasets: [{
                    label: 'Count',
                    data: [gradeCounts['2'], gradeCounts['3'], gradeCounts['4'], gradeCounts['5']],
                    backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']
                }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true } }
            }
        });

        // Performance Over Time
        const perfCtx = document.getElementById('performanceChart').getContext('2d');
        new Chart(perfCtx, {
            type: 'line',
            data: {
                labels: this.stats.map((_, i) => `Test ${i + 1}`),
                datasets: [{
                    label: 'Score',
                    data: this.stats.map(s => s.score),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                scales: { y: { min: 0, max: 100 } }
            }
        });
    }

    showStatsPage() {
        this.updateStatsDisplay();
        this.showPage('statsPage');
    }

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }

    showSectionsPage() {
        this.showPage('sectionsPage');
    }

    showProcessing() {
        document.getElementById('processingStatus').classList.remove('hidden');
    }

    hideProcessing() {
        document.getElementById('processingStatus').classList.add('hidden');
    }

    updateStatus(text) {
        document.getElementById('statusText').textContent = text;
    }

    updateProgress(percent) {
        const fill = document.getElementById('progressFill');
        fill.style.width = percent + '%';
        document.getElementById('progressText').textContent = Math.round(percent) + '%';
    }

    handleKeyboard(e) {
        // Answer shortcuts (A, B, C, D)
        if (e.key === 'a' || e.key === 'A') this.selectAnswer(0);
        if (e.key === 'b' || e.key === 'B') this.selectAnswer(1);
        if (e.key === 'c' || e.key === 'C') this.selectAnswer(2);
        if (e.key === 'd' || e.key === 'D') this.selectAnswer(3);

        // Navigation
        if (e.key === 'ArrowRight') this.nextQuestion();
        if (e.key === 'ArrowLeft') this.previousQuestion();

        // Bookmark
        if (e.key === 'b' || e.key === 'B') this.toggleBookmark();

        // Close modals
        if (e.key === 'Escape') {
            document.getElementById('finishModal').classList.add('hidden');
            document.getElementById('searchModal').classList.add('hidden');
            document.getElementById('reviewModal').classList.add('hidden');
        }
    }
}

// Initialize app
const app = new QuizApp();