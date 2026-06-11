// src\MVC.ts
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Scene } from "@babylonjs/core/scene";

import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";

import { Controller } from "./Controller/Controller";
import { Model } from "./Model/Model";
import { View } from "./View/View";

export class MVC {
    private scene: Scene;
    private model: Model;
    private view: View;
    private controller: Controller;
    private advancedTexture: AdvancedDynamicTexture;

    constructor(scene: Scene, advancedTexture: AdvancedDynamicTexture, physicsPlugin?: HavokPlugin | null ) {
        this.scene = scene;
        this.advancedTexture = advancedTexture;
        this.model = new Model(this.scene, physicsPlugin);
        this.view = new View(this.scene, this.advancedTexture);
        this.controller = new Controller(this.scene, this.model, this.view, physicsPlugin);
    }
}
