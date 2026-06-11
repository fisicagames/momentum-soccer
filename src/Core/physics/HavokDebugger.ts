import { Scene } from "@babylonjs/core/scene";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

export class HavokDebugger {
    private static getPhysicsPlugin(scene: Scene): HavokPlugin {
        const physicsEngine = scene.getPhysicsEngine();
        if (!physicsEngine) {
            throw new Error("Physics engine is not initialized in the scene.");
        }

        const plugin = physicsEngine.getPhysicsPlugin();
        if (!(plugin instanceof HavokPlugin)) {
            throw new Error("The physics plugin is not Havok.");
        }

        return plugin as HavokPlugin;
    }

    /**
     * Logs the number of physics bodies and shapes in the Havok plugin.
     * @param scene - The Babylon.js scene with Havok physics enabled.
     */
    public static logPhysicsStats(scene: Scene): void {
        try {
            const plugin = this.getPhysicsPlugin(scene);

            // Cast para acessar propriedades privadas
            const numBodies = (plugin as any)._bodies.size;
            const numShapes = (plugin as any)._shapes.size;

            console.log(`Havok Debugger - Number of Bodies: ${numBodies}`);
            console.log(`Havok Debugger - Number of Shapes: ${numShapes}`);
        } catch (error) {
            if (error instanceof Error) {
                console.error("HavokDebugger Error:", error.message);
            } else {
                console.error("HavokDebugger Error: An unknown error occurred.");
            }        }
    }

    public static getNumBodies(scene: Scene): number {
        const plugin = this.getPhysicsPlugin(scene);
        return (plugin as any)._bodies.size;
    }

    public static getNumShapes(scene: Scene): number {
        const plugin = this.getPhysicsPlugin(scene);
        return (plugin as any)._shapes.size;
    }
}