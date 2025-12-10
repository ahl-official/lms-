class LearningTools {
    constructor() {
        this.currentVideoId = null;
        this.container = null;
    }

    init(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('Learning Tools container not found');
            return;
        }
    }

    loadTools(videoId) {
        this.currentVideoId = videoId;
        this.renderTabs();
        this.loadFlashcards(); // Default tab
    }

    renderTabs() {
        this.container.innerHTML = `
            <div class="learning-tools-card card" style="margin-top: 1rem;">
                <div class="tools-header" style="border-bottom: 1px solid #eee; margin-bottom: 1rem; padding-bottom: 0.5rem;">
                    <h3 style="margin: 0;">🧠 Learning Tools</h3>
                </div>
                <div class="tools-tabs" style="display: flex; gap: 1rem; margin-bottom: 1rem; border-bottom: 1px solid #ddd;">
                    <button class="tab-btn active" onclick="learningTools.switchTab('flashcards')" id="tab-flashcards" style="padding: 0.5rem 1rem; background: none; border: none; border-bottom: 2px solid #007bff; color: #007bff; font-weight: bold; cursor: pointer;">Flashcards</button>
                    <button class="tab-btn" onclick="learningTools.switchTab('notes')" id="tab-notes" style="padding: 0.5rem 1rem; background: none; border: none; color: #666; cursor: pointer;">AI Notes</button>
                    <button class="tab-btn" onclick="learningTools.switchTab('visuals')" id="tab-visuals" style="padding: 0.5rem 1rem; background: none; border: none; color: #666; cursor: pointer;">Visual Aids</button>
                    <button class="tab-btn" onclick="learningTools.switchTab('mindmap')" id="tab-mindmap" style="padding: 0.5rem 1rem; background: none; border: none; color: #666; cursor: pointer;">Mind Map</button>
                </div>
                <div id="tools-content" style="min-height: 300px;">
                    <!-- Content will be loaded here -->
                </div>
            </div>
        `;
    }

    switchTab(tabName) {
        // Update tab styles
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.style.borderBottom = 'none';
            btn.style.color = '#666';
            btn.classList.remove('active');
        });
        const activeBtn = document.getElementById(`tab-${tabName}`);
        if (activeBtn) {
            activeBtn.style.borderBottom = '2px solid #007bff';
            activeBtn.style.color = '#007bff';
            activeBtn.classList.add('active');
        }

        // Load content
        switch (tabName) {
            case 'flashcards':
                this.loadFlashcards();
                break;
            case 'notes':
                this.loadNotes();
                break;
            case 'visuals':
                this.loadVisuals();
                break;
            case 'mindmap':
                this.loadMindMap();
                break;
        }
    }

    // --- Flashcards ---

    async loadFlashcards() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading flashcards...</div>';

        try {
            const response = await fetch(`/api/tools/flashcards/${this.currentVideoId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } // Assuming token is stored
            });

            // Handle if not authenticated or error
            if (response.status === 401) {
                contentDiv.innerHTML = '<div class="alert alert-error">Please log in to view flashcards.</div>';
                return;
            }

            const data = await response.json();

            if (data.flashcards && data.flashcards.length > 0) {
                this.renderFlashcards(data.flashcards);
            } else {
                this.renderGenerateFlashcardsBtn();
            }
        } catch (error) {
            console.error('Error loading flashcards:', error);
            contentDiv.innerHTML = '<div class="alert alert-error">Failed to load flashcards.</div>';
        }
    }

    renderGenerateFlashcardsBtn() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🎴</div>
                <h4>No Flashcards Yet</h4>
                <p>Generate AI-powered flashcards to help you revise this video.</p>
                <button onclick="learningTools.generateFlashcards()" class="btn btn-primary" style="margin-top: 1rem;">
                    ✨ Generate Flashcards
                </button>
            </div>
        `;
    }

    async generateFlashcards() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <div class="spinner" style="margin-bottom: 1rem;"></div>
                <h4>Generating Flashcards...</h4>
                <p>AI is analyzing the video transcript. This may take a few seconds.</p>
            </div>
        `;

        try {
            const response = await fetch('/api/tools/flashcards/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ videoId: this.currentVideoId })
            });

            const data = await response.json();
            if (data.success) {
                this.renderFlashcards(data.flashcards);
            } else {
                throw new Error(data.error || 'Generation failed');
            }
        } catch (error) {
            console.error('Error generating flashcards:', error);
            contentDiv.innerHTML = `
                <div class="alert alert-error">
                    Failed to generate flashcards: ${error.message}
                    <button onclick="learningTools.generateFlashcards()" class="btn btn-secondary" style="margin-left: 1rem;">Try Again</button>
                </div>
            `;
        }
    }

    renderFlashcards(flashcards) {
        const contentDiv = document.getElementById('tools-content');
        let currentIndex = 0;

        const renderCard = (index) => {
            const card = flashcards[index];
            return `
                <div class="flashcard-container" style="perspective: 1000px; width: 100%; max-width: 600px; margin: 0 auto;">
                    <div class="flashcard" onclick="this.classList.toggle('flipped')" style="
                        position: relative;
                        width: 100%;
                        height: 300px;
                        text-align: center;
                        transition: transform 0.6s;
                        transform-style: preserve-3d;
                        cursor: pointer;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                        border-radius: 10px;
                    ">
                        <div class="flashcard-front" style="
                            position: absolute;
                            width: 100%;
                            height: 100%;
                            -webkit-backface-visibility: hidden;
                            backface-visibility: hidden;
                            background-color: #fff;
                            color: #333;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            align-items: center;
                            border-radius: 10px;
                            border: 1px solid #ddd;
                            padding: 2rem;
                        ">
                            <span style="font-size: 0.9rem; color: #999; position: absolute; top: 1rem; left: 1rem;">Question</span>
                            <h3 style="margin: 0;">${card.front || card.front_content}</h3>
                            <p style="margin-top: 1rem; color: #666; font-size: 0.9rem;">(Click to flip)</p>
                        </div>
                        <div class="flashcard-back" style="
                            position: absolute;
                            width: 100%;
                            height: 100%;
                            -webkit-backface-visibility: hidden;
                            backface-visibility: hidden;
                            background-color: #f8f9fa;
                            color: #333;
                            transform: rotateY(180deg);
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            align-items: center;
                            border-radius: 10px;
                            border: 1px solid #ddd;
                            padding: 2rem;
                        ">
                            <span style="font-size: 0.9rem; color: #999; position: absolute; top: 1rem; left: 1rem;">Answer</span>
                            <p style="font-size: 1.1rem; line-height: 1.6;">${card.back || card.back_content}</p>
                        </div>
                    </div>
                </div>
                <div class="flashcard-controls" style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1.5rem;">
                    <button class="btn btn-secondary" onclick="learningTools.prevCard()" ${index === 0 ? 'disabled' : ''}>&larr; Previous</button>
                    <span style="font-weight: bold; color: #666;">${index + 1} / ${flashcards.length}</span>
                    <button class="btn btn-secondary" onclick="learningTools.nextCard()" ${index === flashcards.length - 1 ? 'disabled' : ''}>Next &rarr;</button>
                </div>
                <div style="text-align: center; margin-top: 2rem;">
                    <button class="btn btn-sm btn-outline-secondary" onclick="if(confirm('Are you sure you want to regenerate flashcards? This will replace existing ones.')) learningTools.generateFlashcards()">🔄 Regenerate Flashcards</button>
                </div>
            `;
        };

        // Store flashcards and index in the instance for navigation
        this.flashcards = flashcards;
        this.currentCardIndex = 0;

        this.updateCardDisplay = () => {
            contentDiv.innerHTML = renderCard(this.currentCardIndex);
            // Add CSS for flip effect if not already present
            if (!document.getElementById('flashcard-style')) {
                const style = document.createElement('style');
                style.id = 'flashcard-style';
                style.textContent = `
                    .flashcard.flipped {
                        transform: rotateY(180deg);
                    }
                `;
                document.head.appendChild(style);
            }
        };

        this.updateCardDisplay();
    }

    nextCard() {
        if (this.currentCardIndex < this.flashcards.length - 1) {
            this.currentCardIndex++;
            this.updateCardDisplay();
        }
    }

    prevCard() {
        if (this.currentCardIndex > 0) {
            this.currentCardIndex--;
            this.updateCardDisplay();
        }
    }

    // --- Placeholders for other features ---

    // --- AI Notes ---

    async loadNotes() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading notes...</div>';

        try {
            const response = await fetch(`/api/tools/notes/${this.currentVideoId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });

            if (response.status === 401) {
                contentDiv.innerHTML = '<div class="alert alert-error">Please log in to view notes.</div>';
                return;
            }

            const data = await response.json();

            if (data.notes && data.notes.content) {
                this.renderNotes(data.notes.content);
            } else {
                this.renderGenerateNotesBtn();
            }
        } catch (error) {
            console.error('Error loading notes:', error);
            contentDiv.innerHTML = '<div class="alert alert-error">Failed to load notes.</div>';
        }
    }

    renderGenerateNotesBtn() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📝</div>
                <h4>No Notes Yet</h4>
                <p>Generate AI-powered study notes for this video.</p>
                <button onclick="learningTools.generateNotes()" class="btn btn-primary" style="margin-top: 1rem;">
                    ✨ Generate Notes
                </button>
            </div>
        `;
    }

    async generateNotes() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <div class="spinner" style="margin-bottom: 1rem;"></div>
                <h4>Generating Notes...</h4>
                <p>AI is summarizing the video and creating study notes. This may take a minute.</p>
            </div>
        `;

        try {
            const response = await fetch('/api/tools/notes/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ videoId: this.currentVideoId })
            });

            const data = await response.json();
            if (data.success) {
                this.renderNotes(data.notes);
            } else {
                throw new Error(data.error || 'Generation failed');
            }
        } catch (error) {
            console.error('Error generating notes:', error);
            contentDiv.innerHTML = `
                <div class="alert alert-error">
                    Failed to generate notes: ${error.message}
                    <button onclick="learningTools.generateNotes()" class="btn btn-secondary" style="margin-left: 1rem;">Try Again</button>
                </div>
            `;
        }
    }

    renderNotes(content) {
        const contentDiv = document.getElementById('tools-content');

        // Simple markdown parser (or use a library if available, but for now simple regex)
        // In a real app, we should use 'marked' library. 
        // Assuming 'marked' might not be available, let's try to use it if it is, or fallback to simple formatting.

        let htmlContent = content;
        if (typeof marked !== 'undefined') {
            htmlContent = marked.parse(content);
        } else {
            // Very basic fallback
            htmlContent = content
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
                .replace(/\n/gim, '<br>');
        }

        contentDiv.innerHTML = `
            <div class="notes-container" style="max-width: 800px; margin: 0 auto;">
                <div class="notes-toolbar" style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-bottom: 1rem;">
                    <button class="btn btn-secondary btn-sm" onclick="if(confirm('Regenerate notes? Current notes will be lost.')) learningTools.generateNotes()">🔄 Regenerate</button>
                    <button class="btn btn-secondary btn-sm" onclick="learningTools.editNotes()">✏️ Edit</button>
                    <button class="btn btn-secondary btn-sm" onclick="learningTools.exportNotes()">📥 Export</button>
                </div>
                <div id="notes-display" style="background: #fff; padding: 2rem; border: 1px solid #ddd; border-radius: 8px; line-height: 1.6;">
                    ${htmlContent}
                </div>
                <div id="notes-editor" style="display: none;">
                    <textarea id="notes-textarea" style="width: 100%; height: 400px; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; font-family: monospace;">${content}</textarea>
                    <div style="margin-top: 1rem; text-align: right;">
                        <button class="btn btn-secondary" onclick="learningTools.cancelEdit()">Cancel</button>
                        <button class="btn btn-primary" onclick="learningTools.saveNotes()">Save Changes</button>
                    </div>
                </div>
            </div>
        `;
    }

    editNotes() {
        document.getElementById('notes-display').style.display = 'none';
        document.getElementById('notes-editor').style.display = 'block';
        document.querySelector('.notes-toolbar').style.display = 'none';
    }

    cancelEdit() {
        document.getElementById('notes-display').style.display = 'block';
        document.getElementById('notes-editor').style.display = 'none';
        document.querySelector('.notes-toolbar').style.display = 'flex';
    }

    async saveNotes() {
        const newContent = document.getElementById('notes-textarea').value;
        const btn = document.querySelector('#notes-editor .btn-primary');
        const originalText = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        try {
            const response = await fetch('/api/tools/notes/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    videoId: this.currentVideoId,
                    content: newContent
                })
            });

            if (response.ok) {
                this.renderNotes(newContent);
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            console.error('Error saving notes:', error);
            alert('Failed to save notes');
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    exportNotes() {
        const content = document.getElementById('notes-display').innerText;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notes-video-${this.currentVideoId}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    // --- Visual Aids ---

    async loadVisuals() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading visual aids...</div>';

        try {
            const response = await fetch(`/api/tools/visuals/${this.currentVideoId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });

            if (response.status === 401) {
                contentDiv.innerHTML = '<div class="alert alert-error">Please log in to view visual aids.</div>';
                return;
            }

            const data = await response.json();

            if (data.visualAid && data.visualAid.content) {
                this.renderVisuals(data.visualAid.content);
            } else {
                this.renderGenerateVisualsBtn();
            }
        } catch (error) {
            console.error('Error loading visual aids:', error);
            contentDiv.innerHTML = '<div class="alert alert-error">Failed to load visual aids.</div>';
        }
    }

    renderGenerateVisualsBtn() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📊</div>
                <h4>No Visual Aids Yet</h4>
                <p>Generate AI-powered diagrams and flowcharts for this video.</p>
                <button onclick="learningTools.generateVisuals()" class="btn btn-primary" style="margin-top: 1rem;">
                    ✨ Generate Diagram
                </button>
            </div>
        `;
    }

    async generateVisuals() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <div class="spinner" style="margin-bottom: 1rem;"></div>
                <h4>Generating Diagram...</h4>
                <p>AI is visualizing the concepts. This may take a moment.</p>
            </div>
        `;

        try {
            const response = await fetch('/api/tools/visuals/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ videoId: this.currentVideoId })
            });

            const data = await response.json();
            if (data.success) {
                this.renderVisuals(data.visualCode);
            } else {
                throw new Error(data.error || 'Generation failed');
            }
        } catch (error) {
            console.error('Error generating visual aid:', error);
            contentDiv.innerHTML = `
                <div class="alert alert-error">
                    Failed to generate visual aid: ${error.message}
                    <button onclick="learningTools.generateVisuals()" class="btn btn-secondary" style="margin-left: 1rem;">Try Again</button>
                </div>
            `;
        }
    }

    renderVisuals(mermaidCode) {
        const contentDiv = document.getElementById('tools-content');

        contentDiv.innerHTML = `
            <div class="visuals-container" style="max-width: 100%; overflow-x: auto; padding: 1rem; background: white; border-radius: 8px; border: 1px solid #ddd;">
                <div class="mermaid" style="text-align: center;">
                    ${mermaidCode}
                </div>
                <div style="text-align: center; margin-top: 1rem; color: #666; font-size: 0.9rem;">
                    AI-generated diagram based on video content
                </div>
                <div style="text-align: center; margin-top: 0.5rem; display: flex; justify-content: center; gap: 1rem;">
                    <button class="btn btn-sm btn-secondary" onclick="document.getElementById('raw-mermaid').style.display = document.getElementById('raw-mermaid').style.display === 'none' ? 'block' : 'none'">Show/Hide Raw Code</button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="if(confirm('Regenerate visual aid?')) learningTools.generateVisuals()">🔄 Regenerate</button>
                </div>
                <pre id="raw-mermaid" style="display: none; margin-top: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; text-align: left; overflow-x: auto;">${mermaidCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>
        `;

        // Initialize Mermaid
        if (typeof mermaid !== 'undefined') {
            try {
                mermaid.init(undefined, document.querySelectorAll('.mermaid'));
            } catch (e) {
                console.error('Mermaid rendering error:', e);
                contentDiv.innerHTML += `<div class="alert alert-error">Failed to render diagram. Syntax error in AI output. <br>Check "Show Raw Code" to see what was generated.</div>`;
            }
        } else {
            console.error('Mermaid library not loaded');
            contentDiv.innerHTML += '<div class="alert alert-warning">Mermaid library not loaded. Cannot render diagram.</div>';
        }
    }

    // --- Mind Maps ---

    async loadMindMap() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading mind map...</div>';

        try {
            const response = await fetch(`/api/tools/mindmap/${this.currentVideoId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });

            if (response.status === 401) {
                contentDiv.innerHTML = '<div class="alert alert-error">Please log in to view mind map.</div>';
                return;
            }

            const data = await response.json();

            if (data.mindMap && data.mindMap.data_json) {
                const mindMapData = JSON.parse(data.mindMap.data_json);
                this.renderMindMap(mindMapData);
            } else {
                this.renderGenerateMindMapBtn();
            }
        } catch (error) {
            console.error('Error loading mind map:', error);
            contentDiv.innerHTML = '<div class="alert alert-error">Failed to load mind map.</div>';
        }
    }

    renderGenerateMindMapBtn() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🧠</div>
                <h4>No Mind Map Yet</h4>
                <p>Generate an AI-powered mind map to visualize connections.</p>
                <button onclick="learningTools.generateMindMap()" class="btn btn-primary" style="margin-top: 1rem;">
                    ✨ Generate Mind Map
                </button>
            </div>
        `;
    }

    async generateMindMap() {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <div class="spinner" style="margin-bottom: 1rem;"></div>
                <h4>Generating Mind Map...</h4>
                <p>AI is structuring the concepts. This may take a moment.</p>
            </div>
        `;

        try {
            const response = await fetch('/api/tools/mindmap/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ videoId: this.currentVideoId })
            });

            const data = await response.json();
            if (data.success) {
                this.renderMindMap(data.mindMapData);
            } else {
                throw new Error(data.error || 'Generation failed');
            }
        } catch (error) {
            console.error('Error generating mind map:', error);
            contentDiv.innerHTML = `
                <div class="alert alert-error">
                    Failed to generate mind map: ${error.message}
                    <button onclick="learningTools.generateMindMap()" class="btn btn-secondary" style="margin-left: 1rem;">Try Again</button>
                </div>
            `;
        }
    }

    renderMindMap(data) {
        const contentDiv = document.getElementById('tools-content');
        contentDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="font-size: 0.9rem; color: #666;">
                    <span style="margin-right: 1rem;">🖱️ Scroll to Zoom</span>
                    <span>👆 Drag to Pan</span>
                </div>
                <button class="btn btn-sm btn-outline-secondary" onclick="if(confirm('Regenerate mind map?')) learningTools.generateMindMap()">🔄 Regenerate</button>
            </div>
            <div id="mindmap-svg-container" style="width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #f8f9fa; cursor: move;"></div>
        `;

        if (typeof d3 === 'undefined') {
            contentDiv.innerHTML += '<div class="alert alert-warning">D3 library not loaded. Cannot render mind map.</div>';
            return;
        }

        const container = document.getElementById('mindmap-svg-container');
        const width = container.clientWidth;
        const height = 600;

        // Create SVG
        const svg = d3.select("#mindmap-svg-container")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        // Add a group for the content that will be zoomed/panned
        const g = svg.append("g");

        // Setup Zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });

        svg.call(zoom);

        // Create Tree Layout
        // Increase size to allow for better spacing
        const treeLayout = d3.tree().size([height * 2, width * 1.5]);

        // Process data
        const root = d3.hierarchy(data);
        treeLayout(root);

        // Center the tree initially
        const initialScale = 0.8;
        const initialX = 100;
        const initialY = height / 2 - (root.x ? root.x : 0); // Center vertically based on root

        svg.call(zoom.transform, d3.zoomIdentity.translate(initialX, height / 2).scale(initialScale));


        // Draw Links (Curved lines)
        g.selectAll(".link")
            .data(root.links())
            .enter().append("path")
            .attr("class", "link")
            .attr("d", d3.linkHorizontal()
                .x(d => d.y)
                .y(d => d.x))
            .style("fill", "none")
            .style("stroke", "#cbd5e0")
            .style("stroke-width", "2px");

        // Draw Nodes
        const node = g.selectAll(".node")
            .data(root.descendants())
            .enter().append("g")
            .attr("class", d => "node" + (d.children ? " node--internal" : " node--leaf"))
            .attr("transform", d => `translate(${d.y},${d.x})`);

        // Node Circles
        node.append("circle")
            .attr("r", d => d.depth === 0 ? 10 : (d.children ? 8 : 6))
            .style("fill", d => {
                if (d.depth === 0) return "#4299e1"; // Root: Blue
                if (d.children) return "#ed8936"; // Branch: Orange
                return "#48bb78"; // Leaf: Green
            })
            .style("stroke", "#fff")
            .style("stroke-width", "2px")
            .style("cursor", "pointer")
            .on("mouseover", function () { d3.select(this).attr("r", d => (d.depth === 0 ? 12 : (d.children ? 10 : 8))); })
            .on("mouseout", function () { d3.select(this).attr("r", d => (d.depth === 0 ? 10 : (d.children ? 8 : 6))); });

        // Node Labels
        node.append("text")
            .attr("dy", 4)
            .attr("x", d => d.children ? -12 : 12)
            .style("text-anchor", d => d.children ? "end" : "start")
            .text(d => d.data.name)
            .style("font-family", "'Inter', sans-serif")
            .style("font-size", d => d.depth === 0 ? "16px" : "14px")
            .style("font-weight", d => d.depth === 0 ? "bold" : "normal")
            .style("fill", "#2d3748")
            .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff"); // Halo effect for readability
    }
}

// Initialize global instance
window.learningTools = new LearningTools();
