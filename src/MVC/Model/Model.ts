import { Scene } from "@babylonjs/core/scene";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

import { IModel } from "./IModel";
import { SoundModel } from "./SoundModel";

export class Model implements IModel {
    private scene: Scene;
    private backgroundMusic?: SoundModel;
    private menuMusic?: SoundModel; // Nova trilha do menu principal
    private allSounds: SoundModel[] = [];
    private physicsPlugin: HavokPlugin | null;
    private endGameCallback: ((isVisible: boolean) => void) | null = null;
    public endGame: boolean = false;

    // Rastreia se a partida está ativa para saber qual som retomar no desmudo
    private isGameActive: boolean = false;

    constructor(scene: Scene, physicsPlugin?: HavokPlugin | null) {
        this.scene = scene;
        this.physicsPlugin = physicsPlugin || null;

        this.startMusic();
    }

    private startMusic() {
        // 1. Trilha única de fundo do estádio para a gameplay
        this.backgroundMusic = new SoundModel(
            "backgroundSound",
            "./assets/sounds/football-sport-crowd.mp3",
            true
        );
        this.backgroundMusic.setVolume(1.0);
        this.allSounds.push(this.backgroundMusic);

        // 2. Trilha única Synth-pop do Menu Inicial (alex_kizenkov)
        this.menuMusic = new SoundModel(
            "menuSound",
            "./assets/sounds/alex_kizenkov-start-now-synth-pop-142103-compress.mp3",
            true // Autoplay ativado para iniciar o menu em looping
        );
        this.menuMusic.setVolume(0.40); // Volume sutil para dar respiro aos cliques
        this.allSounds.push(this.menuMusic);

        // Garante que o som do estádio comece silenciado enquanto o usuário navega pelo menu
        this.backgroundMusic.gamePause();
    }

    /** Alterna globalmente o mudo das músicas, ativando a trilha correspondente ao estado */
    public toggleMusicPlayback(): void {
        const isEnabled = !SoundModel.isMusicEnabled;
        SoundModel.isMusicEnabled = isEnabled;

        if (!isEnabled) {
            this.menuMusic?.pause();
            this.backgroundMusic?.pause();
        } else {
            if (this.isGameActive) {
                this.backgroundMusic?.play();
            } else {
                this.menuMusic?.play();
            }
        }
    }

    public isMusicEnabled(): boolean {
        return SoundModel.isMusicEnabled;
    }

    /** Ativa o som de torcida e pausa a trilha do menu */
    public startGameplay(): void {
        this.isGameActive = true;
        this.menuMusic?.gamePause();
        this.backgroundMusic?.gameResume();
    }

    /** Ativa a trilha synth-pop do menu e pausa o som de torcida */
    public stopGameplay(): void {
        this.isGameActive = false;
        this.backgroundMusic?.gamePause();
        this.menuMusic?.gameResume();
    }

    /** Pausa temporária controlada (ex: pop-up de intervalo) */
    public pauseMusic(): void {
        if (this.isGameActive) {
            this.backgroundMusic?.gamePause();
        } else {
            this.menuMusic?.gamePause();
        }
    }

    /** Retoma o som ativo */
    public resumeMusic(): void {
        if (this.isGameActive) {
            this.backgroundMusic?.gameResume();
        } else {
            this.menuMusic?.gameResume();
        }
    }

    public setEndGameCallback(callback: (isVisible: boolean) => void): void {
        this.endGameCallback = callback;
    }

    public notifyEndGame(isVisible: boolean): void {
        this.endGame = isVisible;
        this.endGameCallback?.(isVisible);
    }
}