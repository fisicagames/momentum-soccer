import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";

/**
 * Campo retangular estático no plano XZ, alongado em Z (tela vertical).
 * O gol do jogador fica em -Z e o do adversário em +Z.
 */
export class Arena {
    public static readonly FIELD_W = 8;     // largura (eixo X)
    public static readonly FIELD_L = 15;    // comprimento (eixo Z)
    public static readonly GOAL_W = 3.0;    // abertura do gol
    public static readonly GOAL_DEPTH = 1.1;
    /** Pequena área (área de meta): largura e profundidade. */
    public static readonly AREA_W = Arena.GOAL_W + 1.6;
    public static readonly AREA_D = 1.7;
    public static readonly GOAL_LINE_Z = Arena.FIELD_L / 2;
    public static readonly WALL_H = 1.4;
    public static readonly POST_H = 1.0;

    /**
     * Constrói o campo e retorna os triggers de gol (um por extremidade).
     * `mesh.metadata.side` = +1 (gol da CPU) ou -1 (gol do jogador).
     */
    public static build(scene: Scene): Mesh[] {
        Arena.buildGround(scene);
        Arena.buildMarkings(scene);
        Arena.buildWalls(scene);
        Arena.buildGoal(scene, +1);
        Arena.buildGoal(scene, -1);
        return [Arena.buildGoalTrigger(scene, +1), Arena.buildGoalTrigger(scene, -1)];
    }

    /**
     * Gatilho de gol estritamente dentro da boca: o teto fica abaixo do
     * travessão, então bola que passa por cima da trave não conta gol.
     */
    private static buildGoalTrigger(scene: Scene, side: number): Mesh {
        const W = Arena.GOAL_W - 0.18;       // entre as traves
        const H = Arena.POST_H - 0.22;       // teto abaixo do travessão
        const D = Arena.GOAL_DEPTH * 0.65;
        const trigger = MeshBuilder.CreateBox(`goalTrigger_${side}`, {
            width: W, height: H, depth: D,
        }, scene);
        trigger.position.set(0, H / 2, side * (Arena.GOAL_LINE_Z + 0.30 + D / 2));
        trigger.isVisible = false;
        trigger.isPickable = false;
        trigger.metadata = { side };

        const aggregate = new PhysicsAggregate(trigger, PhysicsShapeType.BOX, { mass: 0 }, scene);
        aggregate.shape.isTrigger = true;
        return trigger;
    }

    private static buildGround(scene: Scene): void {
        // Chão físico (superfície do feltro em y = 0)
        const ground = MeshBuilder.CreateBox("ground", {
            width: Arena.FIELD_W + 6,
            height: 0.4,
            depth: Arena.FIELD_L + 2 * Arena.GOAL_DEPTH + 5,
        }, scene);
        ground.position.y = -0.2;
        const groundMat = new StandardMaterial("groundMat", scene);
        groundMat.diffuseColor = new Color3(0.10, 0.32, 0.10);
        groundMat.specularColor = Color3.Black();
        ground.material = groundMat;
        ground.isPickable = false;
        new PhysicsAggregate(ground, PhysicsShapeType.BOX,
            { mass: 0, friction: 0.45, restitution: 0.2 }, scene);

        // Faixas de grama alternadas (visual de gramado)
        const STRIPES = 8;
        const stripeDepth = Arena.FIELD_L / STRIPES;
        const matA = new StandardMaterial("stripeA", scene);
        matA.diffuseColor = new Color3(0.16, 0.48, 0.16);
        matA.specularColor = Color3.Black();
        const matB = new StandardMaterial("stripeB", scene);
        matB.diffuseColor = new Color3(0.13, 0.42, 0.13);
        matB.specularColor = Color3.Black();
        for (let i = 0; i < STRIPES; i++) {
            const stripe = MeshBuilder.CreateGround(`stripe_${i}`, {
                width: Arena.FIELD_W, height: stripeDepth,
            }, scene);
            stripe.position.set(0, 0.005, -Arena.FIELD_L / 2 + stripeDepth * (i + 0.5));
            stripe.material = i % 2 === 0 ? matA : matB;
            stripe.isPickable = false;
        }
    }

    private static buildMarkings(scene: Scene): void {
        const lineMat = new StandardMaterial("lineMat", scene);
        lineMat.diffuseColor = new Color3(1, 1, 1);
        lineMat.emissiveColor = new Color3(0.4, 0.4, 0.4);
        lineMat.specularColor = Color3.Black();

        // Linha central
        const center = MeshBuilder.CreateGround("centerLine", { width: Arena.FIELD_W, height: 0.08 }, scene);
        center.position.y = 0.012;
        center.material = lineMat;
        center.isPickable = false;

        // Círculo central
        const circle = MeshBuilder.CreateTorus("centerCircle", {
            diameter: 3.6, thickness: 0.07, tessellation: 48,
        }, scene);
        circle.position.y = 0.012;
        circle.scaling.y = 0.02;
        circle.material = lineMat;
        circle.isPickable = false;

        // Linhas laterais e de fundo (contorno)
        const mkLine = (w: number, d: number, x: number, z: number) => {
            const l = MeshBuilder.CreateGround(`fieldLine_${x}_${z}`, { width: w, height: d }, scene);
            l.position.set(x, 0.012, z);
            l.material = lineMat;
            l.isPickable = false;
        };
        mkLine(0.08, Arena.FIELD_L, -Arena.FIELD_W / 2, 0);
        mkLine(0.08, Arena.FIELD_L, Arena.FIELD_W / 2, 0);
        mkLine(Arena.FIELD_W, 0.08, 0, -Arena.GOAL_LINE_Z);
        mkLine(Arena.FIELD_W, 0.08, 0, Arena.GOAL_LINE_Z);

        // Pequenas áreas
        const AREA_W = Arena.AREA_W;
        const AREA_D = Arena.AREA_D;
        [-1, 1].forEach(side => {
            const zEdge = side * (Arena.GOAL_LINE_Z - AREA_D);
            mkLine(AREA_W, 0.06, 0, zEdge);
            mkLine(0.06, AREA_D, -AREA_W / 2, side * (Arena.GOAL_LINE_Z - AREA_D / 2));
            mkLine(0.06, AREA_D, AREA_W / 2, side * (Arena.GOAL_LINE_Z - AREA_D / 2));
        });
    }

    /** Muros físicos invisíveis que mantêm peças e bola dentro da quadra. */
    private static buildWalls(scene: Scene): void {
        const T = 0.3; // espessura
        const mkWall = (name: string, w: number, d: number, x: number, z: number) => {
            const wall = MeshBuilder.CreateBox(name, { width: w, height: Arena.WALL_H, depth: d }, scene);
            wall.position.set(x, Arena.WALL_H / 2, z);
            wall.isVisible = false;
            wall.isPickable = false;
            new PhysicsAggregate(wall, PhysicsShapeType.BOX,
                { mass: 0, friction: 0.1, restitution: 0.55 }, scene);
        };

        const halfW = Arena.FIELD_W / 2;
        const halfL = Arena.FIELD_L / 2;

        // Laterais (cobrem também a profundidade dos gols)
        const sideLen = Arena.FIELD_L + 2 * Arena.GOAL_DEPTH + 2 * T;
        mkWall("wallLeft", T, sideLen, -(halfW + T / 2), 0);
        mkWall("wallRight", T, sideLen, halfW + T / 2, 0);

        // Fundos, com abertura para a boca do gol
        const segW = (Arena.FIELD_W - Arena.GOAL_W) / 2;
        const segX = Arena.GOAL_W / 2 + segW / 2;
        [-1, 1].forEach(side => {
            const z = side * (halfL + T / 2);
            mkWall(`wallEndA_${side}`, segW, T, -segX, z);
            mkWall(`wallEndB_${side}`, segW, T, segX, z);
            // Caixa do gol: fundo e laterais
            mkWall(`goalBack_${side}`, Arena.GOAL_W + 2 * T, T, 0, side * (halfL + Arena.GOAL_DEPTH + T / 2));
            mkWall(`goalSideA_${side}`, T, Arena.GOAL_DEPTH, -(Arena.GOAL_W / 2 + T / 2), side * (halfL + Arena.GOAL_DEPTH / 2));
            mkWall(`goalSideB_${side}`, T, Arena.GOAL_DEPTH, Arena.GOAL_W / 2 + T / 2, side * (halfL + Arena.GOAL_DEPTH / 2));
        });
    }

    /** Traves visuais (com física) na extremidade indicada (side = ±1). */
    private static buildGoal(scene: Scene, side: number): void {
        const postMat = new StandardMaterial(`postMat_${side}`, scene);
        postMat.diffuseColor = new Color3(0.95, 0.95, 0.95);
        postMat.specularColor = new Color3(0.4, 0.4, 0.4);

        const POST_H = Arena.POST_H;
        const POST_D = 0.14;
        const z = side * Arena.GOAL_LINE_Z;

        [-1, 1].forEach(px => {
            const post = MeshBuilder.CreateCylinder(`post_${side}_${px}`, {
                height: POST_H, diameter: POST_D, tessellation: 16,
            }, scene);
            post.position.set(px * Arena.GOAL_W / 2, POST_H / 2, z);
            post.isPickable = false;
            new PhysicsAggregate(post, PhysicsShapeType.CYLINDER,
                { mass: 0, friction: 0.2, restitution: 0.6 }, scene);
        });

        // Travessão (com física: bola que bate nele rebate, não entra)
        const bar = MeshBuilder.CreateCylinder(`crossbar_${side}`, {
            height: Arena.GOAL_W + POST_D, diameter: POST_D, tessellation: 16,
        }, scene);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, POST_H, z);
        bar.material = postMat;
        bar.isPickable = false;
        new PhysicsAggregate(bar, PhysicsShapeType.CYLINDER, {
            mass: 0, friction: 0.2, restitution: 0.6,
            radius: POST_D / 2,
            pointA: new Vector3(0, -(Arena.GOAL_W + POST_D) / 2, 0),
            pointB: new Vector3(0, (Arena.GOAL_W + POST_D) / 2, 0),
        }, scene);

        // "Teto da rede": colisor invisível sobre a caixa do gol na altura do
        // travessão — bola que passa por cima da trave cai na rede e rola para
        // fora, sem nunca entrar no volume do gatilho de gol por cima.
        const roof = MeshBuilder.CreateBox(`goalRoof_${side}`, {
            width: Arena.GOAL_W + 0.6, height: 0.1, depth: Arena.GOAL_DEPTH + 0.3,
        }, scene);
        roof.position.set(0, POST_H + 0.05, side * (Arena.GOAL_LINE_Z + Arena.GOAL_DEPTH / 2));
        roof.isVisible = false;
        roof.isPickable = false;
        new PhysicsAggregate(roof, PhysicsShapeType.BOX,
            { mass: 0, friction: 0.3, restitution: 0.3 }, scene);

        // Rede simplificada: plano translúcido no fundo do gol
        const netMat = new StandardMaterial(`netMat_${side}`, scene);
        netMat.diffuseColor = new Color3(1, 1, 1);
        netMat.alpha = 0.18;
        netMat.backFaceCulling = false;
        const net = MeshBuilder.CreatePlane(`net_${side}`, { width: Arena.GOAL_W, height: POST_H }, scene);
        net.position.set(0, POST_H / 2, side * (Arena.GOAL_LINE_Z + Arena.GOAL_DEPTH));
        net.material = netMat;
        net.isPickable = false;

        // Aplica material aos postes (após criação)
        scene.meshes
            .filter(m => m.name.startsWith(`post_${side}_`))
            .forEach(m => { m.material = postMat; });
    }
}
