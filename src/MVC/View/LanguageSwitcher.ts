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
            TextblockMeta: [
                "Objetivo: derrote a CPU neste futebol de botão por turnos com 12 toques! Use a física a seu favor: domine o momento linear (p=m·v) e a energia das peças. Vença aliando tática e ciência!",
                "Objective: defeat the CPU in this turn-based button soccer game with 12 touches! Use physics to your advantage: master linear momentum (p=m·v) and piece energy. Win by combining tactics and science!"
            ],
            TextblockTitle: ["Joule Cup\n2026", "Joule Cup\n2026"],
            ButtonMenuStartA: ["Iniciar", "Start"],
            TextblockMenuScore: ["Melhor resultado:", "High Score:"],
            TextblockMusic: ["Sons:", "Sounds:"]
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
                } else if (control instanceof Button) {
                    // Resolve o bug do JSON buscando o bloco de texto internamente nos filhos do botão
                    const textBlock = control.textBlock || 
                        (control.children && control.children.find(c => c instanceof TextBlock || c.name === "Button_button")) as TextBlock;
                    
                    if (textBlock) {
                        textBlock.text = translations[this.languageOption];
                    }
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