export interface IView {
    onButtonMenuStartA(callback: () => void): void;
    onButtonMenuStartB(callback: () => void): void;
    onButtonMenuStartC(callback: () => void): void;
    onButtonMenu(callback: () => void): void;
    onButtonMenuContinuar(callback: () => void): void;
    onToggleMusic(callback: () => void): void;
    setMusicIcon(isEnabled: boolean): void;
    onButtonLang(callback: () => void): void;
    onButtonResetStats(callback: () => void): void; // Adicionado contrato para reset de estatísticas

    updateBestStats(text: string): void;

    updateMainMenuVisibility(isVisible: boolean): void;
    hideMenuPanel(): void;
    showMenuButton(): void;
    getCurrentLanguage(): number;
    onLanguageChange(listener: (lang: number) => void): void;
    changeLanguage(): void;

    updateEndGameTexts(scoreText: string, messageText: string): void;
    showEndGamePanel(isVisible: boolean): void;
}