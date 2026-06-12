// src\View\View.ts
import { Scene } from "@babylonjs/core/scene";

import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";

import { IView } from "./IView";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { PhysicsConceptualPhrases } from "./PhysicsConceptualPhrases";
import { LanguageDetector } from "./LanguageDetector";

export class View implements IView {
    private scene: Scene;
    public advancedTexture: AdvancedDynamicTexture;
    private rectangleMenu!: Rectangle;
    private buttonMenuStartA!: Button;
    private buttonMenuStartB!: Button;
    private buttonMenuStartC!: Button;
    private buttonMenuContinuar!: Button;
    private buttonMenu!: Button;
    private rectangleTop!: Rectangle;
    public textblockMenuMusic!: TextBlock;
    private buttonLang!: Button;
    private languageSwitcher: LanguageSwitcher;
    private rectangleGame!: Rectangle;
    private textblockMenuBest!: TextBlock;
    private textblockTotalScore!: TextBlock;
    private textblockScoreGame!: TextBlock;
    private textblockCenterPhrase!: TextBlock;
    private rectangleCenterPhrase!: Rectangle;
    private languageChangeListeners: ((lang: number) => void)[] = [];

    constructor(scene: Scene, advancedTexture: AdvancedDynamicTexture) {
        this.scene = scene;
        this.advancedTexture = advancedTexture;
        this.languageSwitcher = new LanguageSwitcher();
        this.initializeGUI();
        LanguageDetector.detectAndSetLanguage(() => this.changeLanguage());
    }

    public onLanguageChange(listener: (lang: number) => void): void {
        this.languageChangeListeners.push(listener);
    }

    public changeLanguage(): void {
        this.languageSwitcher.changeLanguage(this.advancedTexture);
        const lang = this.languageSwitcher.getCurrentLanguage();
        this.languageChangeListeners.forEach(fn => fn(lang));
    }

    private initializeGUI() {
        this.buttonMenuStartA = this.advancedTexture.getControlByName("ButtonMenuStartA") as Button;
        this.buttonMenuStartB = this.advancedTexture.getControlByName("ButtonMenuStartB") as Button;
        this.buttonMenuStartC = this.advancedTexture.getControlByName("ButtonMenuStartC") as Button;
        this.buttonMenu = this.advancedTexture.getControlByName("ButtonMenu") as Button;
        this.buttonMenu.isVisible = false;
        this.buttonMenuContinuar = this.advancedTexture.getControlByName("ButtonMenuContinuar") as Button;
        this.rectangleMenu = this.advancedTexture.getControlByName("RectangleMenu") as Rectangle;
        this.rectangleMenu.isVisible = true;
        this.rectangleTop = this.advancedTexture.getControlByName("RectangleTop") as Rectangle;
        this.rectangleTop.isVisible = false;
        this.textblockMenuMusic = this.advancedTexture.getControlByName("TextblockMenuMusic") as TextBlock;
        this.buttonLang = this.advancedTexture.getControlByName("ButtonLang") as Button;
        this.rectangleGame = this.advancedTexture.getControlByName("RectangleGame") as Rectangle;
        this.rectangleGame.isVisible = false;
        this.textblockMenuBest = this.advancedTexture.getControlByName("TextblockMenuBest") as TextBlock;
        this.textblockTotalScore = this.advancedTexture.getControlByName("TextblockTotalScore") as TextBlock;
        this.textblockScoreGame = this.advancedTexture.getControlByName("TextblockScoreGame") as TextBlock;
        this.textblockCenterPhrase = this.advancedTexture.getControlByName("TextblockCenterPhrase") as TextBlock;
        this.rectangleCenterPhrase = this.advancedTexture.getControlByName("RectangleCenterPhrase") as Rectangle;
        this.rectangleCenterPhrase.isVisible = false;
    }

    /** Exibe o melhor resultado salvo no menu (ex.: placar/recorde do Joule Cup 2026). */
    public updateBestStats(text: string): void {
        this.textblockMenuBest.text = text;
    }

    public hideMenuPanel(): void {
        this.rectangleMenu.isVisible = false;
    }

    public showMenuButton(): void {
        this.buttonMenu.isVisible = true;
    }

    public getCurrentLanguage(): number {
        return this.languageSwitcher.getCurrentLanguage();
    }

    public updateMainMenuVisibility(isVisible: boolean) {
        this.rectangleMenu.isVisible = isVisible;
        this.buttonMenu.isVisible = !isVisible;
        this.rectangleTop.isVisible = !isVisible;
        this.rectangleGame.isVisible = false;
        this.rectangleCenterPhrase.isVisible = false;
    }

    public onButtonMenuStartA(callback: () => void): void {
        this.buttonMenuStartA.onPointerUpObservable.add(() => {
            callback();
        });
    }

    public onButtonMenuStartB(callback: () => void): void {
        this.buttonMenuStartB.onPointerUpObservable.add(() => {
            callback();
        });
    }
    public onButtonMenuStartC(callback: () => void): void {
        this.buttonMenuStartC.onPointerUpObservable.add(callback);
    }
    public onButtonMenuContinuar(callback: () => void): void {
        this.buttonMenuContinuar.onPointerUpObservable.add(callback);
    }
    public onButtonMenu(callback: () => void): void {
        this.buttonMenu.onPointerUpObservable.add(callback);
    }

    public onToggleMusic(callback: () => void): void {
        this.textblockMenuMusic.onPointerUpObservable.add(() => {
            callback(); // Chama o callback passado
        });
    }

    public onButtonLang(callback: () => void): void {
        this.buttonLang.onPointerUpObservable.add(callback);
    }

    public setMusicIcon(isEnabled: boolean): void {
        this.textblockMenuMusic.text = isEnabled ? "🔊" : "🔈";
    }

    /** Atualiza os textos do painel de fim de jogo (placar e mensagem principal). */
    public updateEndGameTexts(scoreText: string, messageText: string): void {
        this.textblockTotalScore.text = scoreText;
        this.textblockScoreGame.text = messageText;
    }

    public showEndGamePanel(isVisible: boolean): void {
        this.rectangleGame.isVisible = isVisible;
        if (isVisible && !this.rectangleCenterPhrase.isVisible) {
            this.rectangleCenterPhrase.isVisible = isVisible;
            this.textblockCenterPhrase.text = PhysicsConceptualPhrases.getRandomMomentumPhrase(this.languageSwitcher.languageOption);
        }
        else {
            this.rectangleCenterPhrase.isVisible = isVisible;
        }
    }
}
