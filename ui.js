/**
 * ui.js — Start screen (mode select) → 30s round → end stats
 */

class UIManager {
    constructor(game) {
        this.game          = game;
        this.overlay       = document.getElementById('ui-overlay');
        this._selectedMode = 'static';
        this._lastReaction = null;

        this._buildStatsPanel();
        this._buildModePanel();
    }

    // ── Live stats panel (top-right, visible during round) ────

    _buildStatsPanel() {
        this.statsPanel = _el('div', { id: 'stats-panel' });
        this.statsPanel.innerHTML = `
            <div class="stat-row">
                <span class="stat-label">Hits</span>
                <span class="stat-value" id="sv-hits">0</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Shots</span>
                <span class="stat-value" id="sv-shots">0</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Accuracy</span>
                <span class="stat-value" id="sv-acc">0.0%</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-row" id="timer-row">
                <span class="stat-label">Time</span>
                <span class="stat-value timer" id="sv-timer">30.0s</span>
            </div>
        `;
        this.overlay.appendChild(this.statsPanel);
        this.statsPanel.style.display = 'none';
    }

    updateStats(shots, hits, accuracy) {
        _setText('sv-shots', shots);
        _setText('sv-hits',  hits);
        _setText('sv-acc',   accuracy.toFixed(1) + '%');
    }

    updateReactionStats(avg, best, consistency) {
        this._lastReaction = { avg, best, consistency };
    }

    resetStats() {
        this.updateStats(0, 0, 0);
        _setText('sv-timer', '30.0s');
        this._lastReaction = null;
    }

    showTimer() { this.statsPanel.style.display = 'block'; }
    hideTimer() { this.statsPanel.style.display = 'none';  }

    updateTimer(remaining) {
        const el = document.getElementById('sv-timer');
        if (!el) return;
        el.textContent = Math.max(0, remaining).toFixed(1) + 's';
        el.style.color = remaining > 10 ? '#00ff00'
                       : remaining > 5  ? '#ffaa00'
                       : '#ff4444';
    }

    // ── Start / mode-select screen ────────────────────────────

    _buildModePanel() {
        const s        = this.game.statsManager.display();
        const hasStats = s.sessions > 0;

        const statsBlock = hasStats ? `
            <div class="persistent-stats">
                <div class="persistent-stats-grid">
                    ${_statCell(s.bestAccuracy.toFixed(1) + '%',                               'Best Accuracy')}
                    ${_statCell(s.bestReactionMs > 0 ? s.bestReactionMs.toFixed(0) + 'ms' : '--', 'Best Reaction')}
                    ${_statCell(_fmtNum(s.totalShots),                                         'Total Shots')}
                    ${_statCell(s.lifetimeAcc.toFixed(1) + '%',                               'Lifetime Acc')}
                </div>
                <div class="stats-footer">
                    <span>${s.sessions} session${s.sessions !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>Last: ${this.game.statsManager.lastPlayedText()}</span>
                </div>
            </div>` : '';

        this.modePanel = _el('div', { id: 'mode-panel' });
        this.modePanel.innerHTML = `
            <h2>FPS Aim Trainer</h2>
            <p class="mode-subtitle">Select a mode · 30 second round</p>
            ${statsBlock}
            <div class="mode-grid">
                <button class="mode-card selected" data-mode="static">
                    <span class="mode-card-icon">🎯</span>
                    <span class="mode-card-name">Classic</span>
                    <span class="mode-card-desc">Static targets at mixed distances</span>
                </button>
                <button class="mode-card" data-mode="strafe">
                    <span class="mode-card-icon">↔️</span>
                    <span class="mode-card-name">Strafing</span>
                    <span class="mode-card-desc">Targets moving left and right</span>
                </button>
                <button class="mode-card" data-mode="peek">
                    <span class="mode-card-icon">👁️</span>
                    <span class="mode-card-name">Peek-a-Boo</span>
                    <span class="mode-card-desc">Targets that pop up briefly</span>
                </button>
                <button class="mode-card" data-mode="flick">
                    <span class="mode-card-icon">⚡</span>
                    <span class="mode-card-name">Flick</span>
                    <span class="mode-card-desc">Single target, random position</span>
                </button>
                <button class="mode-card" data-mode="micro">
                    <span class="mode-card-icon">🔬</span>
                    <span class="mode-card-name">Precision</span>
                    <span class="mode-card-desc">Small distant targets</span>
                </button>
            </div>
            <button class="mode-btn start-btn" id="btn-start">▶&nbsp;&nbsp;Start Round</button>
            <p class="mode-hint">Click the range to capture your mouse · Esc to return here</p>
        `;
        this.overlay.appendChild(this.modePanel);

        // Mode card selection
        this.modePanel.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('click', () => {
                this.modePanel.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this._selectedMode = card.dataset.mode;
            });
        });

        // Restore last selected mode highlight
        const prev = this.modePanel.querySelector(`[data-mode="${this._selectedMode}"]`);
        if (prev) {
            this.modePanel.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
            prev.classList.add('selected');
        }

        document.getElementById('btn-start').addEventListener('click', () => {
            this.hideModePanel();
            this.showTimer();
            this.game.startMode(this._selectedMode);
        });
    }

    showModePanel() {
        this.modePanel?.remove();
        this._buildModePanel();
        this.modePanel.style.display = 'block';
        this.hideTimer();
    }

    hideModePanel() {
        if (this.modePanel) this.modePanel.style.display = 'none';
    }

    // ── End screen ────────────────────────────────────────────

    showGameOver(finalStats) {
        if (this.game.input) this.game.input._suppressMenu = true;
        document.exitPointerLock();

        const acc   = finalStats.accuracy;
        const grade = acc >= 90 ? { label: 'S', color: '#ffd700' }
                    : acc >= 75 ? { label: 'A', color: '#00ff88' }
                    : acc >= 60 ? { label: 'B', color: '#00ccff' }
                    : acc >= 45 ? { label: 'C', color: '#ffaa00' }
                    :             { label: 'D', color: '#ff4444' };

        const rt = this._lastReaction;
        const reactionBlock = (rt && rt.avg > 0) ? `
            <div class="reaction-stats-section">
                <h3>Reaction Time</h3>
                <div class="reaction-stats">
                    <div class="reaction-stat">
                        <div class="reaction-stat-value">${rt.avg.toFixed(0)}ms</div>
                        <div class="reaction-stat-label">Average</div>
                    </div>
                    <div class="reaction-stat">
                        <div class="reaction-stat-value best">${rt.best < Infinity ? rt.best.toFixed(0) : '--'}ms</div>
                        <div class="reaction-stat-label">Best</div>
                    </div>
                    <div class="reaction-stat">
                        <div class="reaction-stat-value">${rt.consistency.toFixed(0)}ms</div>
                        <div class="reaction-stat-label">Consistency</div>
                    </div>
                </div>
            </div>` : '';

        const panel = _el('div', { id: 'gameover-panel' });
        panel.innerHTML = `
            <div class="grade-badge" style="color:${grade.color};border-color:${grade.color}">${grade.label}</div>
            <h1>Time's Up!</h1>
            <div class="final-stats">
                ${_finalStat(finalStats.hits,                    'Hits')}
                ${_finalStat(finalStats.shots,                   'Shots')}
                ${_finalStat(finalStats.accuracy.toFixed(1)+'%', 'Accuracy')}
            </div>
            ${reactionBlock}
            <div class="mode-buttons" style="margin-top:28px">
                <button class="mode-btn start-btn" id="btn-retry">▶&nbsp;&nbsp;Play Again</button>
                <button class="mode-btn" id="btn-menu">Main Menu</button>
            </div>
        `;
        this.overlay.appendChild(panel);

        document.getElementById('btn-retry').addEventListener('click', () => {
            panel.remove();
            this.showTimer();
            this.game.startMode(this._selectedMode);
        });
        document.getElementById('btn-menu').addEventListener('click', () => {
            panel.remove();
            this.showModePanel();
        });
    }

    showCrosshairHint() {} // hint lives in start panel
}

// ── DOM helpers ───────────────────────────────────────────────

function _el(tag, attrs = {}) {
    const el = document.createElement(tag);
    Object.assign(el, attrs);
    return el;
}

function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function _statCell(value, label) {
    return `<div class="persistent-stat">
        <div class="persistent-stat-value">${value}</div>
        <div class="persistent-stat-label">${label}</div>
    </div>`;
}

function _finalStat(value, label) {
    return `<div class="final-stat">
        <div class="final-stat-value">${value}</div>
        <div class="final-stat-label">${label}</div>
    </div>`;
}

function _fmtNum(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
