export interface ISoundInterface {
    toggleAllMusicsEnabled(): boolean;
    play(): void;
    pause(): void;
    gamePause(): void;
    gameResume(): void;
    togglePlayback(): void;
    setVolume(volume: number): void;
    getVolume(): number;
    setLoop(loop: boolean): void;
}
