import { PhysicsViewer } from "@babylonjs/core/Debug/physicsViewer";
import { Scene } from "@babylonjs/core/scene";

export class PhysicsDebugger {
    public static enablePhysicsViewer(scene: Scene, enable: boolean): void {
        if (enable) {
            const physicsViewer = new PhysicsViewer();
            for (const mesh of scene.rootNodes) {
                if (PhysicsDebugger.hasPhysicsBody(mesh)) {
                    const debugMesh = physicsViewer.showBody((mesh as any).physicsBody);
                }
            }
        }
    }

    private static hasPhysicsBody(mesh: any): mesh is { physicsBody: any } {
        return mesh && 'physicsBody' in mesh;
    }
}