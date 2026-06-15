import { Scene } from "@babylonjs/core/scene";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

import { IModel } from "../Model/IModel";
import { IView } from "../View/IView";
import { MomentumSoccerGame } from "../../Game/MomentumSoccerGame";

export class Controller {
    private scene: Scene;
    private model: IModel;
    private view: IView;
    private physicsPlugin: HavokPlugin | null;
    private game: MomentumSoccerGame | null = null;

    constructor(scene: Scene, model: IModel, view: IView, physicsPlugin?: HavokPlugin | null) {
        this.scene = scene;
        this.model = model;
        this.view = view;
        this.physicsPlugin = physicsPlugin || null;

        this.setupMenuCallbacks();

        this.model.setEndGameCallback((isVisible: boolean) => {
            this.view.showEndGamePanel(isVisible);
        });

        this.view.setMusicIcon(this.model.isMusicEnabled());
        this.view.onLanguageChange(lang => {
            this.game?.setLanguage(lang);
            this.updateMenuRecord();
        });
        this.updateMenuRecord();
    }

    /** Exibe no menu o histórico de partidas e a maior vitória salva pelo jogo. */
    private updateMenuRecord(): void {
        let wins = 0, losses = 0, draws = 0;
        let bestMatchScore = "";
        try {
            const raw = localStorage.getItem("momentum_soccer_record");
            if (raw) {
                const data = JSON.parse(raw);
                wins = data.wins ?? 0;
                losses = data.losses ?? 0;
                draws = data.draws ?? 0;
                bestMatchScore = data.bestMatchScore ?? "";
            }
        } catch { /* sem armazenamento: mostra zeros */ }
        
        const isPT = this.view.getCurrentLanguage() === 0;

        // Estruturação multilinha limpa e otimizada com quebra de linha
        const campaignLine = isPT
            ? `Vitórias: ${wins} | Empates: ${draws} | Derrotas: ${losses}`
            : `Wins: ${wins} | Draws: ${draws} | Losses: ${losses}`;

        const bestMatchLine = bestMatchScore
            ? (isPT ? `Recorde: ${bestMatchScore}` : `Best: ${bestMatchScore}`)
            : (isPT ? `Recorde: N/A` : `Best: N/A`);

        this.view.updateBestStats(`${campaignLine}\n${bestMatchLine}`);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  MÉTODOS DE UI E FLUXO DO JOGO
    // ══════════════════════════════════════════════════════════════════════
    private setupMenuCallbacks() {
        this.view.onButtonMenuStartA(() => {
            this.view.hideMenuPanel();
            this.launchGame();
        });

        this.view.onButtonMenuStartB(() => {
            this.view.hideMenuPanel();
            this.launchGame();
        });
        this.view.onButtonMenuStartC(() => {
            this.view.hideMenuPanel();
            this.launchGame();
        });

        this.view.onButtonMenuContinuar(() => this.view.showEndGamePanel(false));

        this.view.onButtonMenu(() => this.showMenu());

        // Callback para deletar dados e resetar estatísticas de forma limpa
        this.view.onButtonResetStats(() => {
            try {
                localStorage.removeItem("momentum_soccer_record");
            } catch { /* erro silencioso */ }
            this.updateMenuRecord();
        });

        this.view.onToggleMusic(() => {
            this.model.toggleMusicPlayback();
            const actualState = this.model.isMusicEnabled();
            this.view.setMusicIcon(actualState);
        });

        this.view.onButtonLang(() => this.changeLanguage());
    }

    private showMenu(): void {
        if (this.game) {
            this.game.dispose();
            this.game = null;
        }
        this.model.resumeMusic();
        this.updateMenuRecord();
        this.view.updateMainMenuVisibility(true);
    }

    private changeLanguage(): void {
        this.view.changeLanguage();
    }

    private async launchGame(): Promise<void> {
        if (this.game) return;
        this.game = new MomentumSoccerGame(this.scene);
        await this.game.start();
        this.game.setLanguage(this.view.getCurrentLanguage());
        this.game.setOnGameOver(() => this.model.pauseMusic());
        this.game.setOnGameResume(() => this.model.resumeMusic());
        this.view.showMenuButton();
    }
}