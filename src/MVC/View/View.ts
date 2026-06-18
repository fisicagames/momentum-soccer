import { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { LinearGradient } from "@babylonjs/gui";
import { IView } from "./IView";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { PhysicsConceptualPhrases } from "./PhysicsConceptualPhrases";
import { LanguageDetector } from "./LanguageDetector";

// Importações do módulo do jogo para obter os dados das seleções disponíveis
import { TeamRegistry, TeamConfig } from "../../Game/PieceFactory";

export class View implements IView {
    private scene: Scene;
    public advancedTexture: AdvancedDynamicTexture;
    
    private rectangleMenu!: Rectangle;
    private buttonMenuStartA!: Button;
    private textblockMenuBest!: TextBlock;
    public textblockMenuMusic!: TextBlock;
    private buttonLang!: Button;
    private buttonResetStats!: Button;
    private buttonMenu!: Button;
    
    private languageSwitcher: LanguageSwitcher;
    private languageChangeListeners: ((lang: number) => void)[] = [];

    // Referências de estado do painel seletor de seleções
    private playerTeamIdx = 0; // Brasil (padrão)
    private cpuTeamIdx = 1;    // Alemanha (padrão)
    private selectionModal: Rectangle | null = null;

    private modalTitleTxt!: TextBlock;
    private playerRowLabel!: TextBlock;
    private playerRowValue!: TextBlock;
    private cpuRowLabel!: TextBlock;
    private cpuRowValue!: TextBlock;
    private btnConfirmTxt!: TextBlock;
    private btnCancelTxt!: TextBlock;

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
        
        // Atualiza dinamicamente as traduções do modal se ele estiver ativo em tela
        this.updateSelectionModalTexts();
    }

    private initializeGUI() {
        this.rectangleMenu = this.advancedTexture.getControlByName("RectangleMenu") as Rectangle;
        this.rectangleMenu.isVisible = true;

        this.buttonMenuStartA = this.advancedTexture.getControlByName("ButtonMenuStartA") as Button;
        this.textblockMenuBest = this.advancedTexture.getControlByName("TextblockMenuBest") as TextBlock;
        this.textblockMenuMusic = this.advancedTexture.getControlByName("TextblockMenuMusic") as TextBlock;
        this.buttonLang = this.advancedTexture.getControlByName("ButtonLang") as Button;
        this.buttonResetStats = this.advancedTexture.getControlByName("ButtonResetStats") as Button;
        
        this.buttonMenu = this.advancedTexture.getControlByName("ButtonMenu") as Button;
        this.buttonMenu.isVisible = false;

        this.rectangleMenu.onDirtyObservable.add(() => {
            const measure = this.rectangleMenu._currentMeasure;
            const gradient = new LinearGradient(0, measure.top, 0, measure.top + measure.height);
            gradient.addColorStop(0, "rgb(8, 48, 4)");
            gradient.addColorStop(0.5, "rgb(4, 30, 2)");
            gradient.addColorStop(1, "rgb(15, 9, 5)");
            
            this.rectangleMenu.backgroundGradient = gradient;
        });
    }

    /**
     * Retorna a classificação por estrelas de cada seleção com base no seu nível de IA.
     * Centralizado na classe para reusabilidade.
     */
    private getTeamDifficultyStars(teamId: string): string {
        const eliteTeams = ["brazil", "germany", "argentina", "france", "england", "portugal", "netherlands", "belgium", "spain"];
        const structuredTeams = ["australia", "austria", "colombia", "korea_republic", "cote_d_ivoire", "croatia", "egypt", "ecuador", "usa", "japan", "morocco", "mexico", "norway", "senegal", "sweden", "switzerland", "turkiye", "uruguay"];

        if (eliteTeams.includes(teamId)) return " ★★★";
        if (structuredTeams.includes(teamId)) return " ★★☆";
        return " ★☆☆";
    }

    /**
     * Constrói e exibe o modal de escolha de seleções na tela com uma camada
     * de fundo escurecida (backdrop) para cobrir e ocultar o menu principal.
     */
    public showTeamSelection(onConfirm: (playerTeamId: string, cpuTeamId: string) => void): void {
        const teamList: TeamConfig[] = Object.values(TeamRegistry.TEAMS);

        // Remove instâncias antigas para evitar sobreposição ou vazamento de memória
        if (this.selectionModal) {
            this.advancedTexture.removeControl(this.selectionModal);
            this.selectionModal.dispose();
        }

        // 1. Camada de fundo opaca (Backdrop) que encobre o menu traseiro completamente
        const backdrop = new Rectangle("teamSelectionBackdrop");
        backdrop.width = "100%";
        backdrop.height = "100%";
        backdrop.thickness = 0;
        backdrop.background = "rgba(10, 15, 8, 0.96)"; // Verde-musgo extremamente escuro quase preto
        backdrop.zIndex = 200;
        this.advancedTexture.addControl(backdrop);
        this.selectionModal = backdrop;

        // 2. Caixa de Diálogo Centralizada
        const modal = new Rectangle("teamSelectionModalBox");
        modal.width = "88%";
        modal.height = "400px";
        modal.cornerRadius = 14;
        modal.thickness = 2;
        modal.color = "#FFD24A";
        modal.background = "rgba(12, 12, 28, 0.98)"; // Azul escuro sólido de alta legibilidade
        backdrop.addControl(modal); // O modal é inserido dentro do backdrop para herdar a hierarquia

        // Título do modal com altura e alinhamentos estritos para evitar overlaps
        const title = new TextBlock("modalTitle", "");
        title.color = "#FFD24A";
        title.fontSize = 18;
        title.fontWeight = "bold";
        title.height = "30px"; // Altura delimitada
        title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        title.top = "18px";
        title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        title.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        modal.addControl(title);
        this.modalTitleTxt = title;

        const isPT = () => this.languageSwitcher.getCurrentLanguage() === 0;

        const updateTeamTexts = () => {
            const pTeam = teamList[this.playerTeamIdx];
            const cTeam = teamList[this.cpuTeamIdx];
            
            // Exibe a bandeira, o nome traduzido e a classificação por estrelas de forma compacta
            this.playerRowValue.text = `${pTeam.flag}  ${isPT() ? pTeam.namePt : pTeam.nameEn}`;
            this.cpuRowValue.text = `${cTeam.flag}  ${isPT() ? cTeam.namePt : cTeam.nameEn}\n${this.getTeamDifficultyStars(cTeam.id)}`;
        };

        // Linha de escolha: Seu Time (Player) - espaçamento ajustado
        const pRow = this.createSelectorRow(
            modal,
            "62px",
            "SEU TIME",
            "YOUR TEAM",
            () => teamList[this.playerTeamIdx],
            () => {
                this.playerTeamIdx = (this.playerTeamIdx - 1 + teamList.length) % teamList.length;
                updateTeamTexts();
            },
            () => {
                this.playerTeamIdx = (this.playerTeamIdx + 1) % teamList.length;
                updateTeamTexts();
            }
        );
        this.playerRowLabel = pRow.label;
        this.playerRowValue = pRow.value;

        // Linha de escolha: Adversário (CPU) - espaçamento ajustado
        const cRow = this.createSelectorRow(
            modal,
            "162px",
            "ADVERSÁRIO (CPU)",
            "OPPONENT (CPU)",
            () => teamList[this.cpuTeamIdx],
            () => {
                this.cpuTeamIdx = (this.cpuTeamIdx - 1 + teamList.length) % teamList.length;
                updateTeamTexts();
            },
            () => {
                this.cpuTeamIdx = (this.cpuTeamIdx + 1) % teamList.length;
                updateTeamTexts();
            }
        );
        this.cpuRowLabel = cRow.label;
        this.cpuRowValue = cRow.value;

        // Container de botões de ação na base do modal
        const actionsContainer = new Rectangle();
        actionsContainer.width = "90%";
        actionsContainer.height = "88px";
        actionsContainer.thickness = 0;
        actionsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        actionsContainer.top = "-15px";
        modal.addControl(actionsContainer);

        // Botão de Confirmação/Início
        const btnConfirm = Button.CreateSimpleButton("btnConfirm", "");
        btnConfirm.width = "100%";
        btnConfirm.height = "42px";
        btnConfirm.cornerRadius = 10;
        btnConfirm.thickness = 0;
        btnConfirm.background = "#1A7A2E";
        btnConfirm.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        btnConfirm.onPointerUpObservable.add(() => {
            const playerTeam = teamList[this.playerTeamIdx].id;
            const cpuTeam = teamList[this.cpuTeamIdx].id;
            
            this.advancedTexture.removeControl(backdrop);
            backdrop.dispose();
            this.selectionModal = null;
            
            onConfirm(playerTeam, cpuTeam);
        });
        actionsContainer.addControl(btnConfirm);
        this.btnConfirmTxt = btnConfirm.textBlock!;
        this.btnConfirmTxt.color = "white";
        this.btnConfirmTxt.fontSize = 15;
        this.btnConfirmTxt.fontWeight = "bold";

        // Botão Cancelar/Retornar
        const btnCancel = Button.CreateSimpleButton("btnCancel", "");
        btnCancel.width = "100%";
        btnCancel.height = "36px";
        btnCancel.cornerRadius = 10;
        btnCancel.thickness = 0;
        btnCancel.background = "#444455";
        btnCancel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        btnCancel.onPointerUpObservable.add(() => {
            this.advancedTexture.removeControl(backdrop);
            backdrop.dispose();
            this.selectionModal = null;
        });
        actionsContainer.addControl(btnCancel);
        this.btnCancelTxt = btnCancel.textBlock!;
        this.btnCancelTxt.color = "white";
        this.btnCancelTxt.fontSize = 14;

        this.updateSelectionModalTexts();
    }

    /** 
     * Método auxiliar que constrói os controles visuais de alternância lateral.
     * Define limites explícitos de altura para todos os TextBlocks para evitar overlaps indesejados.
     */
    private createSelectorRow(
        parent: Rectangle,
        topOffset: string,
        labelPt: string,
        labelEn: string,
        getCurrentTeam: () => TeamConfig,
        onPrev: () => void,
        onNext: () => void
    ): { label: TextBlock; value: TextBlock } {
        const rowContainer = new Rectangle();
        rowContainer.width = "90%";
        rowContainer.height = "75px";
        rowContainer.thickness = 0;
        rowContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        rowContainer.top = topOffset;
        parent.addControl(rowContainer);

        const label = new TextBlock();
        label.text = this.languageSwitcher.getCurrentLanguage() === 0 ? labelPt : labelEn;
        label.color = "#9FD4FF";
        label.fontSize = 12;
        label.fontWeight = "bold";
        label.height = "20px";
        label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        label.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        label.isHitTestVisible = false; // Impede que o label bloqueie cliques de elementos próximos
        rowContainer.addControl(label);

        const selectorContainer = new Rectangle();
        selectorContainer.width = "100%";
        selectorContainer.height = "40px";
        selectorContainer.thickness = 0;
        selectorContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        rowContainer.addControl(selectorContainer);

        // Botão Esquerdo (Prev) - Nome único e comportamento de segurar para rolar
        const btnPrev = Button.CreateSimpleButton(`${parent.name}_btnPrev`, "◀");
        btnPrev.width = "40px";
        btnPrev.height = "36px";
        btnPrev.color = "#FFD24A";
        btnPrev.background = "#2C2C3C";
        btnPrev.cornerRadius = 6;
        btnPrev.thickness = 1;
        btnPrev.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.setupHoldToScroll(btnPrev, onPrev); // Configura o Hold-to-Scroll automático
        selectorContainer.addControl(btnPrev);

        // Bloco de Texto central de exibição da Seleção
        const valueTxt = new TextBlock();
        const team = getCurrentTeam();
        valueTxt.text = `${team.flag}  ${this.languageSwitcher.getCurrentLanguage() === 0 ? team.namePt : team.nameEn}`;
        valueTxt.color = "white";
        valueTxt.fontSize = 15;
        valueTxt.fontWeight = "bold";
        valueTxt.height = "36px";
        valueTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        valueTxt.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        
        // Torna o texto invisível para detecção de cliques
        valueTxt.isHitTestVisible = false; 
        
        selectorContainer.addControl(valueTxt);

        // Botão Direito (Next) - Nome único e comportamento de segurar para rolar
        const btnNext = Button.CreateSimpleButton(`${parent.name}_btnNext`, "▶");
        btnNext.width = "40px";
        btnNext.height = "36px";
        btnNext.color = "#FFD24A";
        btnNext.background = "#2C2C3C";
        btnNext.cornerRadius = 6;
        btnNext.thickness = 1;
        btnNext.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.setupHoldToScroll(btnNext, onNext); // Configura o Hold-to-Scroll automático
        selectorContainer.addControl(btnNext);

        return { label, value: valueTxt };
    }

    /**
     * Configura o comportamento de pressionar e segurar para rolar automaticamente
     * a lista de seleções em um intervalo de tempo confortável.
     */
    private setupHoldToScroll(button: Button, action: () => void): void {
        let timeoutId: any = null;
        let intervalId: any = null;

        const stopScrolling = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        };

        // Evento ao segurar o clique/toque (onPointerDown)
        button.onPointerDownObservable.add(() => {
            // 1. Executa imediatamente uma vez no primeiro toque (comportamento de clique simples)
            action();

            // 2. Aguarda um delay para certificar que o usuário está segurando o botão
            stopScrolling(); // Limpeza preventiva de instâncias
            timeoutId = setTimeout(() => {
                // 3. Inicia o loop infinito em velocidade confortável (160ms por mudança)
                intervalId = setInterval(() => {
                    action();
                }, 160);
            }, 350); // Atraso de 350ms para diferenciar clique curto de segurar
        });

        // ── FAILSAFE: Interrompe a rolagem ao soltar ou arrastar o dedo/mouse para fora do botão ──
        button.onPointerUpObservable.add(stopScrolling);
        button.onPointerOutObservable.add(stopScrolling);
    }

    /** Atualiza as strings traduzidas das seleções e elementos do modal dinamicamente */
    public updateSelectionModalTexts(): void {
        if (!this.selectionModal) return;

        const isPT = this.languageSwitcher.getCurrentLanguage() === 0;
        const teamList: TeamConfig[] = Object.values(TeamRegistry.TEAMS);

        this.modalTitleTxt.text = isPT ? "ESCOLHA OS TIMES" : "CHOOSE TEAMS";
        this.playerRowLabel.text = isPT ? "SEU TIME" : "YOUR TEAM";
        this.cpuRowLabel.text = isPT ? "ADVERSÁRIO (CPU)" : "OPPONENT (CPU)";

        const pTeam = teamList[this.playerTeamIdx];
        const cTeam = teamList[this.cpuTeamIdx];
        this.playerRowValue.text = `${pTeam.flag}  ${isPT ? pTeam.namePt : pTeam.nameEn}`;
        
        // ── CORREÇÃO: Garante que as estrelas táticas também sejam renderizadas no carregamento inicial ──
        this.cpuRowValue.text = `${cTeam.flag}  ${isPT ? cTeam.namePt : cTeam.nameEn}\n${this.getTeamDifficultyStars(cTeam.id)}`;

        if (this.btnConfirmTxt) {
            this.btnConfirmTxt.text = isPT ? "⚽ INICIAR JOGO" : "⚽ START MATCH";
        }
        if (this.btnCancelTxt) {
            this.btnCancelTxt.text = isPT ? "✕ VOLTAR" : "✕ BACK";
        }
    }

    public updateBestStats(text: string): void {
        if (this.textblockMenuBest) {
            this.textblockMenuBest.text = text;
        }
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

    public onButtonMenu(callback: () => void): void {
        this.buttonMenu.onPointerUpObservable.add(() => {
            callback();
        });
    }

    public onButtonResetStats(callback: () => void): void {
        if (this.buttonResetStats) {
            this.buttonResetStats.onPointerUpObservable.add(() => {
                callback();
            });
        }
    }

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
            this.textblockMenuMusic.text = isEnabled ? "♫" : "✖";
            this.textblockMenuMusic.color = isEnabled ? "#00E5FF" : "#D32F2F";
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