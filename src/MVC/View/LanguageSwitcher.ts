import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";

export class LanguageSwitcher {
    public languageOption: number;
    private strings: Record<string, string[]>;

    constructor() {
        this.languageOption = 0;
        this.strings = {
            ButtonLang: ["ENGLISH", "PORTUGUÊS"],
            TextblockMeta: ["Objetivo: arraste os botões do seu time para lançá-los contra a bola e marcar gols. Cada peça tem uma massa diferente: para o mesmo impulso, peças leves saem rápido e peças pesadas saem devagar (p = m·v).", "Objective: drag your team's pieces to launch them at the ball and score goals. Each piece has a different mass: for the same impulse, light pieces move fast and heavy pieces move slowly (p = m·v)."],
            TextblockTitle: ["Joule Cup\n2026", "Joule Cup\n2026"],
            ButtonMenuStartA: ["Iniciar", "Start"],
            ButtonMenuStartB: ["Momento Linear", "Linear Momentum"],
            ButtonMenuStartC: ["None", "None"],
            TextblockMenuScore: ["Melhor resultado:", "High Score:"],
            TextBlockFirst: ["Momento Linear e Impulso", "Linear Momentum and Impulse"],
            TextblockSecond: ["p = m·v   |   J = F·Δt = Δp", "p = m·v   |   J = F·Δt = Δp"],
            TextBlockThird: ["p: momento linear (kg·m/s), m: massa (kg) e v: velocidade (m/s).", "p: linear momentum (kg·m/s), m: mass (kg) and v: velocity (m/s)."],
            TextBlockQuarter: ["J: impulso aplicado e Δp: variação do momento linear.", "J: applied impulse and Δp: change in linear momentum."],
            ButtonMenuContinuar: ["Próximo", "Next"],
            TextblockScoreGame: ["Você venceu!", "You won!"],
            TextblockMusic: ["Música:", "Music:"],
        };
    }

    public changeLanguage(advancedTexture: AdvancedDynamicTexture): void {
        this.languageOption = this.languageOption === 0 ? 1 : 0;
        this.updateText(advancedTexture);
    }

    public updateText(advancedTexture: AdvancedDynamicTexture): void {
        for (const key in this.strings) {
            if (this.strings.hasOwnProperty(key)) {
                const translations = this.strings[key];
                const control = advancedTexture.getControlByName(key);

                if (control instanceof TextBlock) {
                    control.text = translations[this.languageOption];
                } else if (control instanceof Button && control.textBlock) {
                    control.textBlock.text = translations[this.languageOption];
                }
            }
        }
    }

    public getCurrentLanguage(): number {
        return this.languageOption;
    }

    public getTranslation(key: string): string {
        return this.strings[key][this.languageOption];
    }
}
