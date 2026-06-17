import { Scene } from "@babylonjs/core/scene";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

import { IModel } from "./IModel";
import { SoundModel } from "./SoundModel";

export class Model implements IModel {
    private scene: Scene;
    private backgroundMusic?: SoundModel;
    private allSounds: SoundModel[] = [];
    private physicsPlugin: HavokPlugin | null;
    private endGameCallback: ((isVisible: boolean) => void) | null = null;
    public endGame: boolean = false;

    constructor(scene: Scene, physicsPlugin?: HavokPlugin | null) {
        this.scene = scene;
        this.physicsPlugin = physicsPlugin || null;

        this.startMusic();
        // ── GARANTE QUE O SOM DE TORCIDA COMECE EM SILÊNCIO NO MENU PRINCIPAL ──
        this.pauseMusic();
    }

    private startMusic() {
        //TODO: [X]: Setup the music soundtrack:
        //https://pixabay.com/music/video-games-8-bit-arcade-mode-158814/
        //Music by Dimitrios Gkorilas from Pixabay
        this.backgroundMusic = new SoundModel(
            "backgroundSound",
            "./assets/sounds/football-sport-crowd.mp3",
            true
        );
        this.backgroundMusic.setVolume(1.0);
        this.allSounds.push(this.backgroundMusic);
    }

    public toggleMusicPlayback(): void {
        if (this.backgroundMusic) {
            this.backgroundMusic.togglePlayback();
        }
    }

    public isMusicEnabled(): boolean {
        return SoundModel.isMusicEnabled;
    }

    public pauseMusic(): void {
        this.backgroundMusic?.gamePause();
    }

    public resumeMusic(): void {
        this.backgroundMusic?.gameResume();
    }

    public setEndGameCallback(callback: (isVisible: boolean) => void): void {
        this.endGameCallback = callback;
    }

    /** Dispara (ou esconde) o painel de fim de jogo na View via Controller. */
    public notifyEndGame(isVisible: boolean): void {
        this.endGame = isVisible;
        this.endGameCallback?.(isVisible);
    }
}
