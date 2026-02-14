/**
 * ui.js — All DOM-based UI: mode panel, stats panel, game-over screen
 */

class UIManager {
    constructor(game) {
        this.game    = game;
        this.overlay = document.getElementById('ui-overlay');

        this._buildStatsPanel();
        this._buildModePanel();
    }

    // ── Stats panel (always visible during play) ──────────────

    _buildStatsPanel() {
        this.statsPanel = _el('div', { id: 'stats-panel' });
        this.statsPanel.innerHTML = `
            <div class="stat-row"><span class="stat-label">Shots</span><span class="stat-value" id="sv-shots">0</span></div>
            <div class="stat-row"><span class="stat-label">Hits</span><span class="stat-value" id="sv-hits">0</span></div>
            <div class="stat-row"><span class="stat-label">Accuracy</span><span class="stat-value" id="sv-acc">0%</span></div>
            <div class="stat-divider"></div>
            <div class="stat-row"><span class="stat-label">Avg RT</span><span class="stat-value" id="sv-avg-rt">--</span></div>
            <div class="stat-row"><span class="stat-label">Best RT</span><span class="stat-value" id="sv-best-rt">--</span></div>
            <div class="stat-row"><span class="stat-label">Consistency</span><span class="stat-value" id="sv-cons">--</span></div>
            <div class="stat-row timer-row" id="timer-row" style="display:none">
                <span class="stat-label">Time</span>
                <span class="stat-value timer" id="sv-timer">30.0s</span>
            </div>
        `;
        this.overlay.appendChild(this.statsPanel);
    }

    updateStats(shots, hits, accuracy) {
        _setText('sv-shots', shots);
        _setText('sv-hits',  hits);
        _setText('sv-acc',   accuracy.toFixed(1) + '%');
    }

    updateReactionStats(avg, best, consistency) {
        _setReactionText('sv-avg-rt',  avg,         200, 300, 400);
        _setReactionText('sv-cons',    consistency, 30,  50,  80);

        const bestEl = document.getElementById('sv-best-rt');
        if (best < Infinity) {
            bestEl.textContent  = best.toFixed(0) + 'ms';
            bestEl.style.color  = '#00ffff';
        } else {
            bestEl.textContent  = '--';
            bestEl.style.color  = '#00ff00';
        }
    }

    resetStats() {
        this.updateStats(0, 0, 0);
        this.updateReactionStats(0, Infinity, 0);
    }

    showTimer() {
        document.getElementById('timer-row').style.display = 'flex';
    }

    hideTimer() {
        document.getElementById('timer-row').style.display = 'none';
    }

    updateTimer(remaining) {
        const el = document.getElementById('sv-timer');
        el.textContent = Math.max(0, remaining).toFixed(1) + 's';
        el.style.color = remaining > 10 ? '#00ff00' : remaining > 5 ? '#ffaa00' : '#ff4444';
    }

    // ── Mode panel (start screen) ─────────────────────────────

    _buildModePanel() {
        const s   = this.game.statsManager.display();
        const hasStats = s.sessions > 0;

        const statsBlock = hasStats ? `
            <div class="persistent-stats">
                <h3>Your Stats</h3>
                <div class="persistent-stats-grid">
                    ${_statCell(s.bestAccuracy.toFixed(1) + '%', 'Best Accuracy')}
                    ${_statCell(s.bestReactionMs > 0 ? s.bestReactionMs.toFixed(0) + 'ms' : '--', 'Best Reaction')}
                    ${_statCell(_fmtNum(s.totalShots), 'Total Shots')}
                    ${_statCell(s.lifetimeAcc.toFixed(1) + '%', 'Lifetime Accuracy')}
                </div>
                <div class="stats-footer">
                    <span>Sessions: ${s.sessions}</span>
                    <span>•</span>
                    <span>Last played: ${this.game.statsManager.lastPlayedText()}</span>
                </div>
            </div>` : `
            <div class="persistent-stats">
                <p class="no-stats">Complete a timed session to start tracking your progress.</p>
            </div>`;

        this.modePanel = _el('div', { id: 'mode-panel' });
        this.modePanel.innerHTML = `
            <h2>FPS Aim Trainer</h2>
            ${statsBlock}
            <div class="mode-section">
                <h3>Basic</h3>
                <div class="mode-buttons">
                    <button class="mode-btn" data-mode="freeplay">Free Play</button>
                    <button class="mode-btn" data-mode="timed">30s Challenge</button>
                </div>
            </div>
            <div class="mode-section">
                <h3>Presets</h3>
                <div class="mode-buttons">
                    <button class="mode-btn preset-btn" data-preset="flick"><span class="preset-icon">⚡</span>Flick</button>
                    <button class="mode-btn preset-btn" data-preset="tracking"><span class="preset-icon">🎯</span>Tracking</button>
                    <button class="mode-btn preset-btn" data-preset="micro-adjust"><span class="preset-icon">🔬</span>Micro-Adjust</button>
                </div>
            </div>
            <div class="mode-section">
                <h3>Drills</h3>
                <div class="mode-buttons">
                    <button class="mode-btn drill-btn" data-mode="strafe">Strafing</button>
                    <button class="mode-btn drill-btn" data-mode="peek">Peek-a-Boo</button>
                    <button class="mode-btn drill-btn" data-mode="micro">Precision Micro</button>
                </div>
            </div>
            <p class="mode-description">Click to select a mode</p>
        `;
        this.overlay.appendChild(this.modePanel);

        // Delegate all button clicks
        this.modePanel.addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const mode   = btn.dataset.mode;
            const preset = btn.dataset.preset;
            if (mode)   this.game.startMode(mode);
            if (preset) this.game.startPreset(preset);
            this.hideModePanel();
        });
    }

    showModePanel() {
        // Rebuild to refresh persistent stats
        this.modePanel?.remove();
        this._buildModePanel();
        this.modePanel.style.display = 'block';
    }

    hideModePanel() {
        if (this.modePanel) this.modePanel.style.display = 'none';
    }

    // ── Game-over screen ──────────────────────────────────────

    showGameOver(finalStats) {
        const reactionBlock = finalStats.avgReaction > 0 ? `
            <div class="reaction-stats-section">
                <h3>Reaction Time</h3>
                <div class="reaction-stats">
                    <div class="reaction-stat">
                        <div class="reaction-stat-value">${finalStats.avgReaction.toFixed(0)}ms</div>
                        <div class="reaction-stat-label">Average</div>
                    </div>
                    <div class="reaction-stat">
                        <div class="reaction-stat-value best">${finalStats.bestReaction.toFixed(0)}ms</div>
                        <div class="reaction-stat-label">Best</div>
                    </div>
                    <div class="reaction-stat">
                        <div class="reaction-stat-value">${finalStats.consistency.toFixed(0)}ms</div>
                        <div class="reaction-stat-label">Consistency</div>
                    </div>
                </div>
            </div>` : '';

        const panel = _el('div', { id: 'gameover-panel' });
        panel.innerHTML = `
            <h1>Time's Up!</h1>
            <div class="final-stats">
                ${_finalStat(finalStats.hits,                'Hits')}
                ${_finalStat(finalStats.shots,               'Shots')}
                ${_finalStat(finalStats.accuracy.toFixed(1) + '%', 'Accuracy')}
            </div>
            ${reactionBlock}
            <div class="mode-buttons" style="margin-top:30px">
                <button class="mode-btn" id="btn-retry">Try Again</button>
                <button class="mode-btn" id="btn-menu">Main Menu</button>
            </div>
        `;
        this.overlay.appendChild(panel);

        document.getElementById('btn-retry').onclick = () => {
            panel.remove();
            this.game.restartLastMode();
        };
        document.getElementById('btn-menu').onclick = () => {
            panel.remove();
            this.showModePanel();
        };
    }

    // ── Crosshair hint ────────────────────────────────────────

    showCrosshairHint() {
        const hint = _el('div', { id: 'crosshair-hint' });
        hint.innerHTML = '<p>Aim with the crosshair</p><p>Left-click to shoot</p>';
        this.overlay.appendChild(hint);
        setTimeout(() => {
            hint.style.opacity = '0';
            setTimeout(() => hint.remove(), 1000);
        }, 3000);
    }
}

// ── DOM helpers (module-private) ─────────────────────────────

function _el(tag, attrs = {}) {
    const el = document.createElement(tag);
    Object.assign(el, attrs);
    return el;
}

function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function _setReactionText(id, value, good, ok, warn) {
    const el = document.getElementById(id);
    if (!el) return;
    if (value > 0) {
        el.textContent = value.toFixed(0) + 'ms';
        el.style.color = value < good ? '#00ff00'
                       : value < ok   ? '#88ff00'
                       : value < warn ? '#ffff00'
                       : '#ff8800';
    } else {
        el.textContent = '--';
        el.style.color = '#00ff00';
    }
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
