import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Team } from "./PieceFactory"; // Unificado usando o tipo Team oficial

export class GameHUD {
    private scene: Scene;
    private ui: AdvancedDynamicTexture;
    // Constante estática para facilitar a calibração do tempo dos alertas (ex: 4500ms)
    private static readonly ALERT_DURATION = 4500;

    // Cabeçalho superior (Placar, Tempo, Toques)
    private topBar!: Rectangle;
    private playerScoreTxt!: TextBlock;
    private vsTxt!: TextBlock;
    private cpuScoreTxt!: TextBlock;
    private timerTxt!: TextBlock;
    private turnTxt!: TextBlock;
    private touchesDotsTxt!: TextBlock;
    private restartBtn!: Button;

    // Painel de Telemetria (Mira)
    private aimPanel!: Rectangle;
    private aimPositionTxt!: TextBlock;
    private aimEnergyTxt!: TextBlock;
    private aimTxt!: TextBlock;
    private energyBarFill!: Rectangle;
    private energyBarSpend!: Rectangle;

    // Overlays, Alertas de Cartões e Avisos
    private goalPanel!: Rectangle;       // Banner horizontal de transmissão de TV para Gols/Intervalo
    private goalPanelLineTop!: Rectangle; // Linha de acabamento superior do banner
    private goalPanelLineBottom!: Rectangle; // Linha de acabamento inferior do banner
    private goalTxt!: TextBlock;
    private alertPanel!: Rectangle; // Painel sólido de alto contraste para alertas
    private alertTxt!: TextBlock;
    private hintTxt!: TextBlock;
    private alertTimer: any = null;

    // Pool de textos flutuantes de impacto (Δp)
    private floatTexts: { tb: TextBlock; life: number }[] = [];

    // Fim de Jogo
    private gameOverPanel!: Rectangle;
    private gameOverTitle!: TextBlock;
    private gameOverPhrase!: TextBlock;
    private playAgainBtn!: Button;

    // Estado local de idioma
    private currentLang = 0;

    constructor(scene: Scene, onRestart: () => void) {
        this.scene = scene;
        this.ui = AdvancedDynamicTexture.CreateFullscreenUI("UI");
        this.buildGUI(onRestart);
    }

    public setLanguage(lang: number): void {
        this.currentLang = lang;
        if (this.playAgainBtn) {
            const block = this.playAgainBtn.textBlock;
            if (block) block.text = this.t("↺ Jogar novamente", "↺ Play again");
        }
    }

    private buildGUI(onRestart: () => void): void {
        // Barra superior de 92px (Z-Index baixo: 10)
        this.topBar = new Rectangle("topBar");
        this.topBar.width = "100%";
        this.topBar.height = "92px";
        this.topBar.thickness = 0;
        this.topBar.background = "rgba(0,0,0,0.5)";
        this.topBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.topBar.isHitTestVisible = false; // Permite cliques passarem para o 3D atrás dela
        this.topBar.zIndex = 10;
        this.ui.addControl(this.topBar);

        // Container para o placar em StackPanel (Garanto simetria absoluta)
        const scorePanel = new StackPanel("scorePanel");
        scorePanel.isVertical = false;
        scorePanel.height = "30px";
        scorePanel.top = "-30px";
        scorePanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        scorePanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        scorePanel.isHitTestVisible = false;
        this.topBar.addControl(scorePanel);

        this.playerScoreTxt = new TextBlock("playerScore", "");
        this.playerScoreTxt.color = "white";
        this.playerScoreTxt.fontSize = 17;
        this.playerScoreTxt.fontWeight = "bold";
        this.playerScoreTxt.resizeToFit = true;
        this.playerScoreTxt.isHitTestVisible = false;
        scorePanel.addControl(this.playerScoreTxt);

        this.vsTxt = new TextBlock("vs", "   ×   ");
        this.vsTxt.color = "white";
        this.vsTxt.fontSize = 17;
        this.vsTxt.fontWeight = "bold";
        this.vsTxt.resizeToFit = true;
        this.vsTxt.isHitTestVisible = false;
        scorePanel.addControl(this.vsTxt);

        this.cpuScoreTxt = new TextBlock("cpuScore", "");
        this.cpuScoreTxt.color = "white";
        this.cpuScoreTxt.fontSize = 17;
        this.cpuScoreTxt.fontWeight = "bold";
        this.cpuScoreTxt.resizeToFit = true;
        this.cpuScoreTxt.isHitTestVisible = false;
        scorePanel.addControl(this.cpuScoreTxt);

        this.timerTxt = new TextBlock("timer", "");
        this.timerTxt.color = "#FFE9A8";
        this.timerTxt.fontSize = 12;
        this.timerTxt.fontWeight = "bold";
        this.timerTxt.top = "-10px";
        this.timerTxt.isHitTestVisible = false;
        this.topBar.addControl(this.timerTxt);

        this.turnTxt = new TextBlock("turn", "");
        this.turnTxt.color = "#9FD4FF";
        this.turnTxt.fontSize = 12;
        this.turnTxt.top = "10px";
        this.turnTxt.isHitTestVisible = false;
        this.topBar.addControl(this.turnTxt);

        this.restartBtn = Button.CreateSimpleButton("restart", "↺");
        this.restartBtn.width = "30px";
        this.restartBtn.height = "30px";
        this.restartBtn.cornerRadius = 15;
        this.restartBtn.color = "white";
        this.restartBtn.background = "#444455";
        this.restartBtn.fontSize = 16;
        this.restartBtn.thickness = 0;
        this.restartBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.restartBtn.left = "-8px";
        this.restartBtn.isHitTestVisible = true; // Botão precisa registrar o clique!
        this.restartBtn.onPointerClickObservable.add(onRestart);
        this.topBar.addControl(this.restartBtn);

        // Indicador visual dos 12 toques
        this.touchesDotsTxt = new TextBlock("touchesDots", "");
        this.touchesDotsTxt.color = "#FFD24A";
        this.touchesDotsTxt.fontSize = 13;
        this.touchesDotsTxt.fontWeight = "bold";
        this.touchesDotsTxt.top = "30px";
        this.touchesDotsTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.touchesDotsTxt.isHitTestVisible = false;
        this.topBar.addControl(this.touchesDotsTxt);

        // Painel de telemetria da mira (Z-Index intermediário: 50)
        this.aimPanel = new Rectangle("aimPanel");
        this.aimPanel.width = "212px";
        this.aimPanel.height = "146px";
        this.aimPanel.cornerRadius = 8;
        this.aimPanel.thickness = 1;
        this.aimPanel.color = "#FFD24A";
        this.aimPanel.background = "rgba(10,10,30,0.78)";
        this.aimPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.aimPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.aimPanel.left = "12px";
        this.aimPanel.top = "-20px"; // Mantido o valor calíbrado de -20px do jogador
        this.aimPanel.isVisible = false;
        this.aimPanel.isHitTestVisible = false; // Dados de telemetria não obstruem cliques da mira
        this.aimPanel.zIndex = 50;
        this.ui.addControl(this.aimPanel);

        // Título da telemetria (CENTRALIZADO NO TOPO)
        this.aimPositionTxt = new TextBlock("aimPosition", "");
        this.aimPositionTxt.color = "white";
        this.aimPositionTxt.fontSize = 12;
        this.aimPositionTxt.fontWeight = "bold";
        this.aimPositionTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.aimPositionTxt.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.aimPositionTxt.top = "6px";
        this.aimPositionTxt.isHitTestVisible = false;
        this.aimPanel.addControl(this.aimPositionTxt);

        const barBg = new Rectangle("energyBarBg");
        barBg.width = "188px";
        barBg.height = "10px";
        barBg.thickness = 0;
        barBg.cornerRadius = 4;
        barBg.background = "rgba(255,255,255,0.16)";
        barBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        barBg.top = "26px";
        barBg.isHitTestVisible = false;
        this.aimPanel.addControl(barBg);

        this.energyBarFill = new Rectangle("energyBarFill");
        this.energyBarFill.height = "100%";
        this.energyBarFill.thickness = 0;
        this.energyBarFill.cornerRadius = 4;
        this.energyBarFill.background = "#37D67A";
        this.energyBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.energyBarFill.isHitTestVisible = false;
        barBg.addControl(this.energyBarFill);

        this.energyBarSpend = new Rectangle("energyBarSpend");
        this.energyBarSpend.height = "100%";
        this.energyBarSpend.thickness = 0;
        this.energyBarSpend.cornerRadius = 4;
        this.energyBarSpend.background = "#FF8A3D";
        this.energyBarSpend.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.energyBarSpend.isHitTestVisible = false;
        barBg.addControl(this.energyBarSpend);

        // Bloco de Energia Potencial e Trabalho
        this.aimEnergyTxt = new TextBlock("aimEnergyTxt", "");
        this.aimEnergyTxt.color = "#7FFFD4";
        this.aimEnergyTxt.fontSize = 11;
        this.aimEnergyTxt.fontWeight = "bold";
        this.aimEnergyTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.aimEnergyTxt.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.aimEnergyTxt.paddingLeft = "10px";
        this.aimEnergyTxt.paddingTop = "42px";
        this.aimEnergyTxt.isHitTestVisible = false;
        this.aimPanel.addControl(this.aimEnergyTxt);

        // Especificações físicas (m, v, p, K, P)
        this.aimTxt = new TextBlock("aimTxt", "");
        this.aimTxt.color = "white";
        this.aimTxt.fontSize = 11;
        this.aimTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.aimTxt.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.aimTxt.paddingLeft = "10px";
        this.aimTxt.paddingTop = "82px";
        this.aimTxt.isHitTestVisible = false;
        this.aimPanel.addControl(this.aimTxt);

        // Banner horizontal de comemoração de GOL/Intervalo (Estilo TV de Esportes)
        // Z-Index superior absoluto de 110 para desenhar por cima de tudo
        this.goalPanel = new Rectangle("goalPanel");
        this.goalPanel.width = "100%";
        this.goalPanel.height = "70px";
        this.goalPanel.thickness = 0;
        this.goalPanel.background = "rgba(10,10,32,0.88)"; // Fundo escuro premium
        this.goalPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.goalPanel.top = "-120px";
        this.goalPanel.isHitTestVisible = false;
        this.goalPanel.isVisible = false;
        this.goalPanel.zIndex = 110;
        this.ui.addControl(this.goalPanel);

        // Linha de acabamento superior do banner (dinâmica)
        this.goalPanelLineTop = new Rectangle("goalPanelLineTop");
        this.goalPanelLineTop.width = "100%";
        this.goalPanelLineTop.height = "3px";
        this.goalPanelLineTop.thickness = 0;
        this.goalPanelLineTop.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.goalPanelLineTop.isHitTestVisible = false;
        this.goalPanel.addControl(this.goalPanelLineTop);

        // Linha de acabamento inferior do banner (dinâmica)
        this.goalPanelLineBottom = new Rectangle("goalPanelLineBottom");
        this.goalPanelLineBottom.width = "100%";
        this.goalPanelLineBottom.height = "3px";
        this.goalPanelLineBottom.thickness = 0;
        this.goalPanelLineBottom.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.goalPanelLineBottom.isHitTestVisible = false;
        this.goalPanel.addControl(this.goalPanelLineBottom);

        this.goalTxt = new TextBlock("goal", "");
        this.goalTxt.fontSize = 28;
        this.goalTxt.fontWeight = "bold";
        this.goalTxt.color = "#FFD700";
        this.goalTxt.shadowColor = "rgba(0,0,0,0.9)";
        this.goalTxt.shadowBlur = 6;
        this.goalTxt.isHitTestVisible = false;
        this.goalPanel.addControl(this.goalTxt);

// Card de Alerta Avançado (Alta Legibilidade) (Z-Index alto: 100)
        // Posicionado a 130px do topo para dar folga perfeita de 10px abaixo da topBar de 92px
        this.alertPanel = new Rectangle("alertPanel");
        this.alertPanel.width = "90%";
        this.alertPanel.height = "56px";
        this.alertPanel.cornerRadius = 8;
        this.alertPanel.thickness = 2;
        this.alertPanel.color = "#FFC34D";
        this.alertPanel.background = "rgba(10,10,30,0.88)"; // Fundo escuro de alto contraste
        this.alertPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.alertPanel.top = "130px"; // Ajustado de 102px para 130px para evitar cortes
        this.alertPanel.isHitTestVisible = false; // Não bloqueia cliques
        this.alertPanel.isVisible = false;
        this.alertPanel.zIndex = 100;
        this.ui.addControl(this.alertPanel);

        this.alertTxt = new TextBlock("alert", "");
        this.alertTxt.fontSize = 13;
        this.alertTxt.fontWeight = "bold";
        this.alertTxt.color = "white"; // Fonte branca de alta leitura sobre o fundo escuro
        this.alertTxt.textWrapping = true;
        this.alertTxt.isHitTestVisible = false;
        this.alertPanel.addControl(this.alertTxt);

        // Dica
        this.hintTxt = new TextBlock("hint", "");
        this.hintTxt.color = "#FFFFFF";
        this.hintTxt.fontSize = 14;
        this.hintTxt.fontWeight = "bold";
        this.hintTxt.shadowColor = "rgba(0,0,0,0.9)";
        this.hintTxt.shadowBlur = 4;
        this.hintTxt.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.hintTxt.paddingBottom = "26px";
        this.hintTxt.isHitTestVisible = false;
        this.ui.addControl(this.hintTxt);

        for (let i = 0; i < 4; i++) {
            const tb = new TextBlock(`dp_${i}`, "");
            tb.color = "#7FFFD4";
            tb.fontWeight = "bold";
            tb.shadowColor = "rgba(0,0,0,0.9)";
            tb.shadowBlur = 4;
            tb.isVisible = false;
            tb.isHitTestVisible = false;
            this.ui.addControl(tb);
            this.floatTexts.push({ tb, life: 0 });
        }

        this.gameOverPanel = new Rectangle("gameOver");
        this.gameOverPanel.width = "86%";
        this.gameOverPanel.height = "220px";
        this.gameOverPanel.cornerRadius = 14;
        this.gameOverPanel.thickness = 2;
        this.gameOverPanel.color = "#FFD24A";
        this.gameOverPanel.background = "rgba(8,10,28,0.92)";
        this.gameOverPanel.isVisible = false;
        this.ui.addControl(this.gameOverPanel);

        this.gameOverTitle = new TextBlock("goTitle", "");
        this.gameOverTitle.color = "white";
        this.gameOverTitle.fontSize = 22;
        this.gameOverTitle.fontWeight = "bold";
        this.gameOverTitle.top = "-65px";
        this.gameOverPanel.addControl(this.gameOverTitle);

        this.gameOverPhrase = new TextBlock("goPhrase", "");
        this.gameOverPhrase.color = "#9FD4FF";
        this.gameOverPhrase.fontSize = 13;
        this.gameOverPhrase.top = "-10px";
        this.gameOverPanel.addControl(this.gameOverPhrase);

        this.playAgainBtn = Button.CreateSimpleButton("playAgain", "");
        this.playAgainBtn.width = "190px";
        this.playAgainBtn.height = "42px";
        this.playAgainBtn.cornerRadius = 10;
        this.playAgainBtn.color = "white";
        this.playAgainBtn.background = "#1A7A2E";
        this.playAgainBtn.fontSize = 15;
        this.playAgainBtn.fontWeight = "bold";
        this.playAgainBtn.top = "60px";
        this.playAgainBtn.onPointerClickObservable.add(onRestart);
        this.gameOverPanel.addControl(this.playAgainBtn);
    }

    public updateScore(playerScore: number, cpuScore: number, possession: Team): void {
        const isPT = this.currentLang === 0;
        this.playerScoreTxt.text = isPT ? `VOCÊ  🇧🇷  ${playerScore}` : `YOU  🇧🇷  ${playerScore}`;
        this.cpuScoreTxt.text = `${cpuScore}  🇩🇪  CPU`;

        if (possession === "player") {
            this.playerScoreTxt.color = "#39FF14"; // Verde Brilhante
            this.cpuScoreTxt.color = "white";
        } else {
            this.playerScoreTxt.color = "white";
            this.cpuScoreTxt.color = "#39FF14"; // Verde Brilhante
        }
    }

    public updateTimer(timeLeft: number, half: 1 | 2): void {
        const total = Math.max(Math.ceil(timeLeft), 0);
        const mm = String(Math.floor(total / 60)).padStart(2, "0");
        const ss = String(total % 60).padStart(2, "0");
        const halfLabel = half === 1 ? this.t("1º Tempo", "1st Half") : this.t("2º Tempo", "2nd Half");
        this.timerTxt.text = `${halfLabel} — ${mm}:${ss}`;
    }

    public updateTurnText(touchesLeft: number, maxTouches: number, state: string): void {
        const touches = `${touchesLeft}/${maxTouches}`;

        const filledCount = Math.max(touchesLeft, 0);
        const emptyCount = Math.max(maxTouches - filledCount, 0);
        this.touchesDotsTxt.text = "● ".repeat(filledCount) + "○ ".repeat(emptyCount).trim();

        switch (state) {
            case "PLAYER_AIM":
                this.turnTxt.text = this.t(`👆 Sua posse — Toques: ${touches}`, `👆 Your possession — Touches: ${touches}`);
                this.turnTxt.color = "#9FD4FF";
                break;
            case "CPU_TURN":
                this.turnTxt.text = this.t(`📺 Posse do adversário — Toques: ${touches}`, `📺 Opponent's possession — Touches: ${touches}`);
                this.turnTxt.color = "#FFAA99";
                break;
            case "ROLLING":
                this.turnTxt.text = this.t("⚽ Bola em jogo…", "⚽ Ball in play…");
                this.turnTxt.color = "#CCCCCC";
                break;
            case "HALF_TIME":
                this.turnTxt.text = this.t("⏸ Intervalo", "⏸ Half-time break");
                this.turnTxt.color = "#9FD4FF";
                break;
            default:
                this.turnTxt.text = "";
        }
    }

    public updateAimPanel(
        namePt: string, nameEn: string, mass: number, velocity: number, impulse: number,
        energyLeft: number, energyBarMax: number, energyLowThreshold: number,
        yellowCards: number
    ): void {
        const name = this.t(namePt, nameEn);
        const cardsStr = "🟨".repeat(yellowCards);
        this.aimPositionTxt.text = `${name.toUpperCase()} ${cardsStr}`.trim();

        const kinetic = 0.5 * mass * velocity * velocity;
        const power = kinetic / 0.1;

        this.aimTxt.text =
            `m = ${this.fmt(mass, 1)} kg | v = ${this.fmt(velocity, 1)} m/s\n` +
            `p = ${this.fmt(impulse, 1)} kg·m/s\n` +
            `K = ${this.fmt(kinetic, 1)} J | P = ${this.fmt(power, 1)} W`;

        const low = energyLeft - kinetic <= energyLowThreshold;
        this.aimEnergyTxt.text =
            this.t(`Energia Potencial: ${this.fmt(energyLeft, 1)} J`, `Potential Energy: ${this.fmt(energyLeft, 1)} J`) + "\n" +
            this.t(`Trabalho a ser realizado: ${this.fmt(kinetic, 1)} J`, `Work to be done: ${this.fmt(kinetic, 1)} J`) +
            (low ? this.t("\n⚠ Energia Baixa!", "\n⚠ Low Energy!") : "");
        this.aimEnergyTxt.color = low ? "#FF6655" : "#7FFFD4";

        const barW = 188;
        const remainAfter = Math.max(energyLeft - kinetic, 0);
        const spend = Math.min(kinetic, Math.max(energyLeft, 0));
        this.energyBarFill.width = `${(remainAfter / energyBarMax) * barW}px`;
        this.energyBarSpend.left = `${(remainAfter / energyBarMax) * barW}px`;
        this.energyBarSpend.width = `${(spend / energyBarMax) * barW}px`;

        this.aimPanel.isVisible = true;
    }

    public hideAimPanel(): void {
        this.aimPanel.isVisible = false;
    }

    public hideGoal(): void {
        this.goalPanel.isVisible = false;
    }

    public showGoal(text: string, color: string, isPlayerScorer: boolean): void {
        this.goalTxt.text = text;
        this.goalTxt.color = color;
        
        // Ajusta as linhas estéticas dourada/vermelha do banner conforme o autor do gol
        const lineColor = isPlayerScorer ? "#FFD24A" : "#FF5555";
        this.goalPanelLineTop.background = lineColor;
        this.goalPanelLineBottom.background = lineColor;

        this.goalPanel.isVisible = true;
    }

    public showAlert(text: string, color: string): void {
        this.alertTxt.text = text;
        this.alertPanel.color = color; // Muda a borda de acordo com o nível do aviso (amarelo ou vermelho)
        this.alertPanel.isVisible = true;

        // Limpa de forma segura qualquer temporizador ativo no escopo do navegador
        if (this.alertTimer) {
            window.clearTimeout(this.alertTimer);
            this.alertTimer = null;
        }

        // Registra o novo temporizador forçando o uso do escopo global window
        this.alertTimer = window.setTimeout(() => {
            this.alertTimer = null;
            this.alertPanel.isVisible = false;
        }, 2500); // 4.5 segundos de exibição legível
    }

    public showHint(hasShotOnce: boolean): void {
        this.hintTxt.text = hasShotOnce ? "" : this.t(
            "👆 Toque em um botão azul, arraste\npara trás e solte para lançar!",
            "👆 Tap a blue piece, drag it\nbackwards and release to shoot!"
        );
        this.hintTxt.isVisible = !hasShotOnce;
    }

    public triggerFloatText(point: Vector3, impulse: number, norm: number): void {
        const ft = this.floatTexts.find(f => f.life <= 0);
        if (!ft) return;
        ft.life = 1;
        ft.tb.text = `Δp = ${this.fmt(impulse, 1)} kg·m/s`;
        ft.tb.fontSize = 11 + Math.round(norm * 8);
        ft.tb.isVisible = true;
        ft.tb.moveToVector3(point.add(new Vector3(0, 0.6, 0)), this.scene);
    }

    public updateFeedbackAnimations(dt: number): void {
        for (const f of this.floatTexts) {
            if (f.life <= 0) continue;
            f.life -= dt * 0.8;
            if (f.life <= 0) { f.tb.isVisible = false; continue; }
            f.tb.alpha = Math.min(f.life * 2, 1);
            f.tb.linkOffsetY = (f.tb.linkOffsetY as number) - dt * 30;
        }
    }

    public showGameOver(title: string, phrase: string): void {
        this.gameOverTitle.text = title;
        this.gameOverPhrase.text = phrase;
        this.gameOverPanel.isVisible = true;
    }

    public hideGameOver(): void {
        this.gameOverPanel.isVisible = false;
    }

    private t(pt: string, en: string): string {
        return this.currentLang === 0 ? pt : en;
    }

    private fmt(n: number, dec: number): string {
        const s = n.toFixed(dec);
        return this.currentLang === 0 ? s.replace(".", ",") : s;
    }

    public dispose(): void {
        if (this.alertTimer) clearTimeout(this.alertTimer);
        this.ui.dispose();
        this.topBar.dispose();
        this.aimPanel.dispose();
        this.goalPanel.dispose();
        this.alertPanel.dispose();
        this.alertTxt.dispose();
        this.hintTxt.dispose();
        this.floatTexts.forEach(f => f.tb.dispose());
    }
}