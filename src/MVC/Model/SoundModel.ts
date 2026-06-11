import {
    CreateAudioEngineAsync,
    CreateSoundAsync,
    AudioEngineV2,
    AbstractSound
} from "@babylonjs/core/AudioV2";

import { ISoundInterface } from "./ISoundInterface";

export class SoundModel implements ISoundInterface {
    private _sound: AbstractSound | null = null;
    public static isMusicEnabled: boolean = true;
    private _autoPlay: boolean = false;

    // Gerenciamento global estático da engine de áudio V2
    private static _audioEnginePromise: Promise<AudioEngineV2> | null = null;

    // Guardamos o estado das ações que ocorrem antes do download do som terminar
    private _requestedVolume: number = 0.3;
    private _requestedLoop: boolean = true;
    private _playRequested: boolean = false;

    // Pausa temporária controlada pelo jogo (GAMEOVER), independente da vontade do usuário
    private _gamePaused: boolean = false;

    // Controle interno exato do estado de reprodução
    private _isPlaying: boolean = false;

    public toggleAllMusicsEnabled() {
        SoundModel.isMusicEnabled = !SoundModel.isMusicEnabled;
        return SoundModel.isMusicEnabled;
    }

    constructor(name: string, path: string, autoplay: boolean) {
        this._autoPlay = autoplay;
        this.setupVisibilityHandler();
        this.loadAudioAsync(name, path);
    }

    private static getAudioEngine(): Promise<AudioEngineV2> {
        if (!SoundModel._audioEnginePromise) {
            SoundModel._audioEnginePromise = CreateAudioEngineAsync();
        }
        return SoundModel._audioEnginePromise;
    }

    private async loadAudioAsync(name: string, path: string) {
        try {
            await SoundModel.getAudioEngine();
            
            this._sound = await CreateSoundAsync(name, path, {
                loop: this._requestedLoop,
                autoplay: false 
            });
            
            this._sound.volume = this._requestedVolume;

            // Sincroniza nossa variável caso o som chegue ao fim naturalmente
            this._sound.onEndedObservable.add(() => {
                this._isPlaying = false;
            });

            if (this._autoPlay && SoundModel.isMusicEnabled) {
                this.handleInitialPlay();
            } else if (this._playRequested && SoundModel.isMusicEnabled) {
                this.handleInitialPlay();
            }

        } catch (error) {
            console.error(`Erro ao carregar o som V2 ${name}:`, error);
        }
    }

    private async handleInitialPlay() {
        if (!this._sound || this._isPlaying) return;

        const engine = await SoundModel.getAudioEngine();
        
        try {
            await engine.unlockAsync();
        } catch (e) {
            console.warn("Áudio ignorado por falta de interação.");
            return;
        }

        if (SoundModel.isMusicEnabled && !this._isPlaying) {
            this._isPlaying = true;
            
            // CORREÇÃO CRUCIAL V9: 
            // Se já existem instâncias ativas na memória (ou seja, foi pausado antes), usamos resume()
            // Se for 0, usamos play() para instanciar a reprodução na primeira vez.
            if (this._sound.activeInstancesCount > 0) {
                this._sound.resume();
            } else {
                this._sound.play();
            }
        }
    }

    private setupVisibilityHandler(): void {
        const tryPlay = () => {
            if (document.visibilityState === "visible" && this._autoPlay && SoundModel.isMusicEnabled && !this._gamePaused) {
                this.play();
            }
        };

        const tryPause = () => {
            if (this._isPlaying) {
                this.pause();
                // O pause global de visibilidade não deve alterar a variável isMusicEnabled
            }
        };

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") tryPlay();
            else tryPause();
        });

        window.addEventListener("blur", () => tryPause());
        window.addEventListener("focus", () => tryPlay());
    }

    public pause(): void {
        this._playRequested = false;
        if (this._sound && this._isPlaying) {
            this._isPlaying = false;
            this._sound.pause();
        }
    }

    public play(): void {
        this._playRequested = true;

        if (!this._sound) return;

        if (!this._isPlaying && SoundModel.isMusicEnabled && !this._gamePaused) {
            this.handleInitialPlay();
        }
    }

    /** Pausa controlada pelo jogo (GAMEOVER) — não altera a preferência do usuário. */
    public gamePause(): void {
        this._gamePaused = true;
        if (this._sound && this._isPlaying) {
            this._isPlaying = false;
            this._sound.pause();
        }
    }

    /** Retoma a música após pausa do jogo, se o usuário não a desligou. */
    public gameResume(): void {
        this._gamePaused = false;
        if (!this._isPlaying && SoundModel.isMusicEnabled) {
            this.handleInitialPlay();
        }
    }

    public togglePlayback(): void {
        // Usar isMusicEnabled é mais seguro caso alguém clique no botão freneticamente 
        // antes do download terminar.
        if (SoundModel.isMusicEnabled) {
            SoundModel.isMusicEnabled = false;
            this.pause();
        } else {
            SoundModel.isMusicEnabled = true;
            this.play();
        }
    }

    public setVolume(volume: number): void {
        this._requestedVolume = volume;
        if (this._sound) {
            this._sound.volume = volume;
        }
    }

    public getVolume(): number {
        return this._sound ? this._sound.volume : this._requestedVolume;
    }

    public setLoop(loop: boolean): void {
        this._requestedLoop = loop;
        if (this._sound) {
            (this._sound as any).loop = loop;
        }
    }
}