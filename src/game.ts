import "@babylonjs/core/Loading/loadingScreen";

import { Engine } from "@babylonjs/core/Engines/engine";
import { CanvasInitializer } from "./Core/CanvasInitializer";
import { EngineInitializer } from "./Core/EngineInitializer";
import { SceneInitializer } from "./Core/SceneInitializer";

export class Game {
    private canvas: HTMLCanvasElement;
    private engine: Engine;
    //TODO: [X] Config Havok physics use for each games:
    private static useHavok: boolean = false; // física gerenciada pelo jogo (MomentumSoccerGame inicializa o próprio Havok)
    private static useInspectorDebugModel: boolean;

    static { // Bloco estático
        const inspectorEnabledString = import.meta.env.VITE_INSPECTOR_ENABLED;

        if (inspectorEnabledString === 'true') {
            Game.useInspectorDebugModel = true;
            console.log("Inspector habilitado pela variável de ambiente.");
        } else {
            Game.useInspectorDebugModel = false;
        }
    }

    constructor() {
        this.canvas = CanvasInitializer.createAndAdjustCanvas();
        this.engine = EngineInitializer.createEngine(this.canvas);
    }

    public async startMainScene() {
        const mainScene = new SceneInitializer(this.canvas, this.engine, Game.useHavok);

        // Carregar e habilitar o modelo do inspector de forma condicional
        // Use a variável de ambiente diretamente aqui para o Tree Shaking funcionar melhor
        if (import.meta.env.VITE_INSPECTOR_ENABLED === 'true') {
            console.log("Carregando Inspector...");
            const { InspectorDebugModel } = await import('./Core/InspectorDebugModel');
            InspectorDebugModel.enable(mainScene.scene);
        }
    }
}

export function startGame(): void {
    const game = new Game();
    game.startMainScene();
}
