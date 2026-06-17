//TODO: Implement a conditionally import for HavokPlugin.
import "@babylonjs/loaders/glTF";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ScenePerformancePriority } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

//TODO: Re-enable if needed for Momentum Cup 2026:
// import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
// import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
// import { CameraInitializer } from "./CameraInitializer";

import { optimizeMaterials } from "./MaterialOptimizer";
import { GUILoader } from "./GUILoader";
import { HavokPhysicsEngine } from "./physics/HavokPhysicsEngine";
import { MVC } from "../MVC/MVC";
//TODO: Create a variable for enable ModelsLoader;
import { ModelsLoader } from "./ModelsLoader";

export class SceneInitializer {
    private _canvas: HTMLCanvasElement;
    private _engine: Engine;
    private _scene: Scene;
    private useHavok: boolean;

    public get scene(): Scene {
        return this._scene;
    }

    constructor(canvas: HTMLCanvasElement, engine: Engine, useHavok = false) {
        this._canvas = canvas;
        this._engine = engine;
        this._scene = new Scene(this._engine);
        this.useHavok = useHavok; 
        this.initialize();
    }

    private async initialize(): Promise<void> {
        const advancedTexture = await GUILoader.loadGUI(this._scene, "./assets/gui/guiTexture.json");
        //TODO: [ ]: Update 3d models content.
        //await ModelsLoader.loadModels(this._scene, "./assets/models/", "carnotBox.gltf", true, true);

        this.sceneOptimizer();
        
        // Fundo escuro e neutro de carregamento (evita clarões e esbranquiçamento)
        this._scene.clearColor = new Color4(0.04, 0.12, 0.03, 1.0); 
        this._scene.fogMode = Scene.FOGMODE_EXP2;
        this._scene.fogDensity = 0.003;
        this._scene.fogColor = new Color3(0.02, 0.08, 0.02);

        //TODO: Re-enable lights if needed:
        // const light1 = new HemisphericLight("light1", new Vector3(0, 1, 0), this._scene);
        // light1.intensity = 0.75;

        //TODO: Re-enable glow layer for future games:
        // const glowLayer = new GlowLayer("glow", this._scene);
        // glowLayer.intensity = 0.9;

        // Câmera mínima para o menu: scene.render() exige activeCamera para funcionar.
        // MomentumSoccerGame.start() substituirá esta câmera ao iniciar o jogo.
        const menuCamera = new ArcRotateCamera("menuCam", 0, Math.PI / 3, 20, Vector3.Zero(), this._scene);
        this._scene.activeCamera = menuCamera;

        //TODO: Re-enable cameras if needed:
        // const universalCamera = CameraInitializer.createUniversalCamera(this._scene, this._canvas);
        // const followCamera = CameraInitializer.createFollowCamera(this._scene);
        // this._scene.activeCamera = universalCamera;

        let physicsPlugin: HavokPlugin | null = null;

        if (this.useHavok) {
            const physicsEngine = new HavokPhysicsEngine();
            physicsPlugin = await physicsEngine.initialize(this._scene);
        }

        const mvc = new MVC(this._scene, advancedTexture, physicsPlugin);

        await this._scene.whenReadyAsync(); //optional
        this._engine.hideLoadingUI(); //optional
        this.sceneLoop();
    }

    private sceneLoop() {
        this._engine.runRenderLoop(() => {
            this._scene.render();
        });
    }

    private sceneOptimizer() {
        this._scene.skipPointerMovePicking = true;
        //this._scene.freezeActiveMeshes();
        this._scene.performancePriority = ScenePerformancePriority.BackwardCompatible;
       
    }
}