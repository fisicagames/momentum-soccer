export interface IModel {
    toggleMusicPlayback(): void;
    isMusicEnabled(): boolean;
    pauseMusic(): void;
    resumeMusic(): void;

    setEndGameCallback(callback: (isVisible: boolean) => void): void;
    notifyEndGame(isVisible: boolean): void;
}
