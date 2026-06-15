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
    
    // Propriedades do menu ativo (utilizadas na Joule Cup 2026)
    private rectangleMenu!: Rectangle;
    private buttonMenuStartA!: Button;
    private textblockMenuBest!: TextBlock;
    public textblockMenuMusic!: TextBlock;
    private buttonLang!: Button;
    
    private languageSwitcher: LanguageSwitcher;
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
        // Elementos do Menu Principal
        this.rectangleMenu = this.advancedTexture.getControlByName("RectangleMenu") as Rectangle;
        this.rectangleMenu.isVisible = true;

        this.buttonMenuStartA = this.advancedTexture.getControlByName("ButtonMenuStartA") as Button;
        this.textblockMenuBest = this.advancedTexture.getControlByName("TextblockMenuBest") as TextBlock;
        this.textblockMenuMusic = this.advancedTexture.getControlByName("TextblockMenuMusic") as TextBlock;
        this.buttonLang = this.advancedTexture.getControlByName("ButtonLang") as Button;
        
        // Failsafe: Oculta botões legados caso persistam em cache do ADT
        const buttonMenu = this.advancedTexture.getControlByName("ButtonMenu") as Button;
        if (buttonMenu) buttonMenu.isVisible = false;
    }

    /** Exibe o melhor resultado salvo no menu (ex.: placar/recorde do Joule Cup 2026). */
    public updateBestStats(text: string): void {
        if (this.textblockMenuBest) {
            this.textblockMenuBest.text = text;
        }
    }

    public hideMenuPanel(): void {
        this.rectangleMenu.isVisible = false;
    }

    public showMenuButton(): void {
        const buttonMenu = this.advancedTexture.getControlByName("ButtonMenu") as Button;
        if (buttonMenu) buttonMenu.isVisible = true;
    }

    public getCurrentLanguage(): number {
        return this.languageSwitcher.getCurrentLanguage();
    }

    public updateMainMenuVisibility(isVisible: boolean) {
        this.rectangleMenu.isVisible = isVisible;
        
        const buttonMenu = this.advancedTexture.getControlByName("ButtonMenu");
        if (buttonMenu) buttonMenu.isVisible = !isVisible;
        
        const rectangleTop = this.advancedTexture.getControlByName("RectangleTop");
        if (rectangleTop) rectangleTop.isVisible = !isVisible;
        
        const rectangleGame = this.advancedTexture.getControlByName("RectangleGame");
        if (rectangleGame) rectangleGame.isVisible = false;
        
        const rectangleCenterPhrase = this.advancedTexture.getControlByName("RectangleCenterPhrase");
        if (rectangleCenterPhrase) rectangleCenterPhrase.isVisible = false;
    }

    public onButtonMenuStartA(callback: () => void): void {
        this.buttonMenuStartA.onPointerUpObservable.add(() => {
            callback();
        });
    }

    // ── MOCKS DEFENSIVOS DE COMPATIBILIDADE DE INTERFACE (IView) ─────────────
    // Garantem que Controllers legados não quebrem em runtime devido a chamadas em botões removidos.

    public onButtonMenuStartB(callback: () => void): void {
        const control = this.advancedTexture.getControlByName("ButtonMenuStartB") as Button;
        if (control) control.onPointerUpObservable.add(callback);
    }

    public onButtonMenuStartC(callback: () => void): void {
        const control = this.advancedTexture.getControlByName("ButtonMenuStartC") as Button;
        if (control) control.onPointerUpObservable.add(callback);
    }

    public onButtonMenuContinuar(callback: () => void): void {
        const control = this.advancedTexture.getControlByName("ButtonMenuContinuar") as Button;
        if (control) control.onPointerUpObservable.add(callback);
    }

    public onButtonMenu(callback: () => void): void {
        const control = this.advancedTexture.getControlByName("ButtonMenu") as Button;
        if (control) control.onPointerUpObservable.add(callback);
    }

    public onToggleMusic(callback: () => void): void {
        if (this.textblockMenuMusic) {
            this.textblockMenuMusic.onPointerUpObservable.add(() => {
                callback();
            });
        }
    }

    public onButtonLang(callback: () => void): void {
        if (this.buttonLang) {
            this.buttonLang.onPointerUpObservable.add(callback);
        }
    }

    public setMusicIcon(isEnabled: boolean): void {
        if (this.textblockMenuMusic) {
            this.textblockMenuMusic.text = isEnabled ? "🔊" : "🔈";
        }
    }

    public updateEndGameTexts(scoreText: string, messageText: string): void {
        const scoreControl = this.advancedTexture.getControlByName("TextblockTotalScore") as TextBlock;
        if (scoreControl) scoreControl.text = scoreText;
        
        const msgControl = this.advancedTexture.getControlByName("TextblockScoreGame") as TextBlock;
        if (msgControl) msgControl.text = messageText;
    }

    public showEndGamePanel(isVisible: boolean): void {
        const rectangleGame = this.advancedTexture.getControlByName("RectangleGame") as Rectangle;
        if (rectangleGame) rectangleGame.isVisible = isVisible;
        
        const rectangleCenterPhrase = this.advancedTexture.getControlByName("RectangleCenterPhrase") as Rectangle;
        if (rectangleCenterPhrase) {
            rectangleCenterPhrase.isVisible = isVisible;
            if (isVisible) {
                const textblockCenterPhrase = this.advancedTexture.getControlByName("TextblockCenterPhrase") as TextBlock;
                if (textblockCenterPhrase) {
                    textblockCenterPhrase.text = PhysicsConceptualPhrases.getRandomMomentumPhrase(this.languageSwitcher.languageOption);
                }
            }
        }
    }
}