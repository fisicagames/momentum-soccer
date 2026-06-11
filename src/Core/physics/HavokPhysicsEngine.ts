import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import HavokPhysics from "@babylonjs/havok";

export class HavokPhysicsEngine   {
    public async initialize(scene: Scene): Promise<HavokPlugin> {
        const havok = await HavokPhysics();
        //const havok = await HavokPhysics({
        //    locateFile: () => `./assets/wasm/HavokPhysics.wasm`
        //});

        const hk = new HavokPlugin(true, havok);
        //TODO: [X] Set gravity for the game.
        scene.enablePhysics(new Vector3(0, 0, 0), hk); //gravity

        return hk;
    }
}
