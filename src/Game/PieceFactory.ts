import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";

export type Team = "player" | "cpu";

/** Posições táticas oficiais da formação 3-4-3 (+ goleiro). */
export type PositionId =
    | "goalkeeper"
    | "left_back" | "center_back" | "right_back"
    | "left_midfielder" | "volante" | "meia_armador" | "right_midfielder"
    | "left_winger" | "center_forward" | "right_winger";

export interface PositionSpec {
    id: PositionId;
    namePt: string;
    nameEn: string;
    mass: number;     // kg
    radius: number;   // m
    height: number;   // m
    specular: number; // brilho (defensores são metálicos)
}

/**
 * Posições do futebol real com massas proporcionais à função: defesa pesada
 * (8 kg), meio-campo de apoio (3 kg), ataque veloz (1 kg) e goleiro de 10 kg.
 */
export const POSITIONS: Record<PositionId, PositionSpec> = {
    // Goleiro
    goalkeeper:       { id: "goalkeeper",       namePt: "Goleiro",          nameEn: "Goalkeeper",           mass: 10.0, radius: 0.42, height: 0.26, specular: 0.95 },

    // Linha de defesa (zagueiros de 8 kg)
    left_back:        { id: "left_back",        namePt: "Zagueiro Esquerdo", nameEn: "Left Center Back",   mass: 8.0, radius: 0.40, height: 0.29, specular: 0.95 },
    center_back:      { id: "center_back",      namePt: "Zagueiro Central",  nameEn: "Center Back",        mass: 8.0, radius: 0.40, height: 0.29, specular: 0.95 },
    right_back:       { id: "right_back",       namePt: "Zagueiro Direito",  nameEn: "Right Center Back",  mass: 8.0, radius: 0.40, height: 0.29, specular: 0.95 },

    // Meio-campo (apoiadores de 3 kg)
    left_midfielder:  { id: "left_midfielder",  namePt: "Ala Esquerdo",      nameEn: "Left Midfielder",      mass: 3.0, radius: 0.31, height: 0.19, specular: 0.40 },
    volante:          { id: "volante",          namePt: "Volante",           nameEn: "Defensive Midfielder", mass: 3.0, radius: 0.31, height: 0.19, specular: 0.40 },
    meia_armador:     { id: "meia_armador",     namePt: "Meia Armador",      nameEn: "Attacking Midfielder", mass: 3.0, radius: 0.31, height: 0.19, specular: 0.40 },
    right_midfielder: { id: "right_midfielder", namePt: "Ala Direito",       nameEn: "Right Midfielder",     mass: 3.0, radius: 0.31, height: 0.19, specular: 0.40 },

    // Ataque (velocistas de 1 kg)
    left_winger:      { id: "left_winger",      namePt: "Ponta Esquerda",    nameEn: "Left Winger",   mass: 1.0, radius: 0.25, height: 0.13, specular: 0.25 },
    center_forward:   { id: "center_forward",   namePt: "Centroavante",      nameEn: "Center Forward", mass: 1.0, radius: 0.25, height: 0.13, specular: 0.25 },
    right_winger:     { id: "right_winger",     namePt: "Ponta Direita",     nameEn: "Right Winger",  mass: 1.0, radius: 0.25, height: 0.13, specular: 0.25 },
};

/** Cor exclusiva do goleiro (Amarelo Ouro), igual nos dois times. */
const GK_COLOR = new Color3(1.0, 0.78, 0.05);

export interface Piece {
    mesh: Mesh;
    aggregate: PhysicsAggregate;
    spec: PositionSpec;
    team: Team;
    /** Posição inicial (formação), usada em resets e no filtro de segurança. */
    home: Vector3;
}

export interface Ball {
    mesh: Mesh;
    aggregate: PhysicsAggregate;
    radius: number;
    mass: number;
    home: Vector3;
}

const TEAM_COLORS: Record<Team, { base: Color3; secondary: Color3; knob: Color3 }> = {
    player: { base: new Color3(0.12, 0.35, 0.85), secondary: new Color3(0.95, 0.88, 0.65), knob: new Color3(0.30, 0.55, 1.0) },
    cpu:    { base: new Color3(0.80, 0.15, 0.12), secondary: new Color3(0.92, 0.92, 0.90), knob: new Color3(1.0, 0.38, 0.30) },
};

/** Plano com a massa estampada no selo do botão (reforço visual do conceito). */
function createMassLabel(scene: Scene, spec: PositionSpec, team: Team): Mesh {
    // Material compartilhado entre as peças do mesmo arquétipo/time (são 22 botões)
    const cached = scene.getMaterialByName(`massMat_${team}_${spec.id}`) as StandardMaterial | null;
    if (cached) {
        const plane = MeshBuilder.CreatePlane(`massLabel_${team}_${spec.id}`, { size: spec.radius * 0.88 }, scene);
        plane.rotation.x = Math.PI / 2;
        plane.material = cached;
        return plane;
    }
    // Alta resolução + contorno espesso: número legível à distância sobre
    // qualquer cor de base (são só 8 texturas — 4 arquétipos × 2 times)
    const size = 512;
    const tex = new DynamicTexture(`massTex_${team}_${spec.id}`, { width: size, height: size }, scene, true);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);
    ctx.font = "bold 330px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 34;
    ctx.strokeStyle = "rgba(8, 8, 16, 0.9)";
    const massText = `${spec.mass.toFixed(0)}`;
    ctx.strokeText(massText, size / 2, size / 2 + 14);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(massText, size / 2, size / 2 + 14);
    tex.update();

    const mat = new StandardMaterial(`massMat_${team}_${spec.id}`, scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;

    const plane = MeshBuilder.CreatePlane(`massLabel_${team}_${spec.id}`, { size: spec.radius * 0.88 }, scene);
    plane.rotation.x = Math.PI / 2;
    plane.material = mat;
    return plane;
}

/**
 * Perfil de botão profissional de acrílico (lenticular/saucer), gerado por
 * superfície de revolução: base plana, bainha externa inclinada, domo convexo
 * e cavidade central rasa (área do selo). Coordenadas locais centradas em Y.
 */
function buttonLatheShape(radius: number, height: number): Vector3[] {
    const r = radius;
    const y = (t: number) => t * height - height / 2; // centra o perfil em Y
    return [
        new Vector3(0.012, y(0), 0),
        new Vector3(r * 0.60, y(0), 0),       // base plana
        new Vector3(r * 0.95, y(0.30), 0),    // bainha inclinada
        new Vector3(r * 1.00, y(0.55), 0),    // borda externa
        new Vector3(r * 0.90, y(0.85), 0),    // ombro superior
        new Vector3(r * 0.58, y(1.00), 0),    // topo do domo
        new Vector3(r * 0.40, y(0.90), 0),    // desce para a cavidade
        new Vector3(r * 0.16, y(0.84), 0),    // fundo da cavidade (selo)
        new Vector3(0.012, y(0.84), 0),
    ];
}

export function createPiece(scene: Scene, position: PositionId, team: Team, home: Vector3): Piece {
    const spec = POSITIONS[position];
    // Goleiro usa a cor exclusiva; peças de linha usam a cor primária do time
    const baseColor = position === "goalkeeper" ? GK_COLOR : TEAM_COLORS[team].base;
    const name = `piece_${team}_${position}`;

    // Corpo do botão: perfil de acrílico em superfície de revolução
    const base = MeshBuilder.CreateLathe(name, {
        shape: buttonLatheShape(spec.radius, spec.height),
        tessellation: 28,
        sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    base.position.copyFrom(home);
    base.rotationQuaternion = Quaternion.Identity();

    const baseMat = new StandardMaterial(name + "_mat", scene);
    baseMat.diffuseColor = baseColor;
    baseMat.specularColor = new Color3(spec.specular, spec.specular, spec.specular);
    if (position === "goalkeeper") {
        baseMat.emissiveColor = new Color3(0.25, 0.18, 0.0); // leve brilho próprio
    }
    base.material = baseMat;

    // Domo bicolor: disco central na cor secundária do time (anel externo = cor primária)
    let dome: Mesh | null = null;
    if (position !== "goalkeeper") {
        const domeMat = new StandardMaterial(name + "_dome_mat", scene);
        domeMat.diffuseColor = TEAM_COLORS[team].secondary;
        domeMat.specularColor = new Color3(spec.specular * 0.8, spec.specular * 0.8, spec.specular * 0.8);
        domeMat.backFaceCulling = false;
        dome = MeshBuilder.CreateDisc(name + "_dome", { radius: spec.radius * 0.52, tessellation: 28 }, scene);
        dome.rotation.x = Math.PI / 2;
        dome.parent = base;
        dome.position.y = spec.height * 0.45;
        dome.material = domeMat;
    }

    // Massa estampada na cavidade central (selo)
    const label = createMassLabel(scene, spec, team);
    label.parent = base;
    label.position.y = spec.height * 0.37; // logo acima do fundo da cavidade

    // Física: cilindro explícito (ignora os filhos decorativos)
    const aggregate = new PhysicsAggregate(base, PhysicsShapeType.CYLINDER, {
        mass: spec.mass,
        radius: spec.radius,
        pointA: new Vector3(0, -spec.height / 2, 0),
        pointB: new Vector3(0, spec.height / 2, 0),
        friction: 0.35,
        restitution: 0.45,
    }, scene);

    // Trava de rotação nos eixos X e Z: inércia nula nesses eixos impede capotamento;
    // o botão só pode girar em torno do próprio eixo vertical Y (spin).
    const inertiaY = 0.5 * spec.mass * spec.radius * spec.radius; // cilindro maciço
    aggregate.body.setMassProperties({ mass: spec.mass, inertia: new Vector3(0, inertiaY, 0) });

    // "Feltro liso": pouco amortecimento linear — as peças deslizam e ricocheteiam
    aggregate.body.setLinearDamping(0.04);
    aggregate.body.setAngularDamping(0.9);

    // Permite teleporte por manipulação direta do mesh (resets e filtro de segurança)
    aggregate.body.disablePreStep = false;

    const piece: Piece = { mesh: base, aggregate, spec, team, home: home.clone() };

    // Metadata para picking do slingshot (inclui o domo bicolor e o selo)
    base.metadata = { piece };
    if (dome) dome.metadata = { piece };
    label.metadata = { piece };

    return piece;
}

export function createBall(scene: Scene, home: Vector3): Ball {
    const radius = 0.18; // proporção realista frente aos botões (era 0.30)
    const mass = 1.0;

    const mesh = MeshBuilder.CreateSphere("ball", { diameter: radius * 2, segments: 24 }, scene);
    mesh.position.copyFrom(home);
    mesh.rotationQuaternion = Quaternion.Identity();

    // Textura procedural de bola de futebol (manchas pretas sobre branco)
    const size = 256;
    const tex = new DynamicTexture("ballTex", { width: size, height: size }, scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#151515";
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
            const x = (i + 0.5 + (j % 2) * 0.5) * (size / 4);
            const y = (j + 0.5) * (size / 3);
            ctx.beginPath();
            ctx.arc(x % size, y, size * 0.075, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    tex.update();
    const mat = new StandardMaterial("ballMat", scene);
    mat.diffuseTexture = tex;
    mat.specularColor = new Color3(0.5, 0.5, 0.5);
    mesh.material = mat;

    const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.SPHERE, {
        mass,
        radius,
        friction: 0.3,
        restitution: 0.8, // alta elasticidade conforme o design
    }, scene);
    aggregate.body.setLinearDamping(0.05);
    aggregate.body.setAngularDamping(0.85);
    aggregate.body.disablePreStep = false;

    return { mesh, aggregate, radius, mass, home: home.clone() };
}
