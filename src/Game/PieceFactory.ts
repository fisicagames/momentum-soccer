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
export type ArchetypeId = "sprinter" | "striker" | "tank";

export interface ArchetypeSpec {
    id: ArchetypeId;
    namePt: string;
    nameEn: string;
    mass: number;     // kg
    radius: number;   // m
    height: number;   // m
    specular: number; // brilho (Tank é metálico)
}

/** Arquétipos de botões: massas bem distintas para evidenciar v = p/m. */
export const ARCHETYPES: Record<ArchetypeId, ArchetypeSpec> = {
    sprinter: { id: "sprinter", namePt: "Velocista", nameEn: "Sprinter", mass: 1.0, radius: 0.25, height: 0.13, specular: 0.25 },
    striker:  { id: "striker",  namePt: "Atacante",  nameEn: "Striker",  mass: 3.0, radius: 0.31, height: 0.19, specular: 0.40 },
    tank:     { id: "tank",     namePt: "Tanque",    nameEn: "Tank",     mass: 8.0, radius: 0.40, height: 0.29, specular: 0.95 },
};

export interface Piece {
    mesh: Mesh;
    aggregate: PhysicsAggregate;
    spec: ArchetypeSpec;
    team: Team;
    /** Posição inicial (formação), usada em resets e no filtro de segurança. */
    home: Vector3;
    /** Materiais do corpo/botão (para o feedback de "recuperando"). */
    baseMat: StandardMaterial;
    knobMat: StandardMaterial;
    /** Cores originais, restauradas ao fim da recuperação. */
    baseColor: Color3;
    knobColor: Color3;
}

export interface Ball {
    mesh: Mesh;
    aggregate: PhysicsAggregate;
    radius: number;
    mass: number;
    home: Vector3;
}

const TEAM_COLORS: Record<Team, { base: Color3; knob: Color3 }> = {
    player: { base: new Color3(0.12, 0.35, 0.85), knob: new Color3(0.30, 0.55, 1.0) },
    cpu:    { base: new Color3(0.80, 0.15, 0.12), knob: new Color3(1.0, 0.38, 0.30) },
};

/** Plano com a massa estampada no topo do botão (reforço visual do conceito). */
function createMassLabel(scene: Scene, spec: ArchetypeSpec, team: Team): Mesh {
    const size = 256;
    const tex = new DynamicTexture(`massTex_${team}_${spec.id}`, { width: size, height: size }, scene, true);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "bold 110px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${spec.mass.toFixed(0)}`, size / 2, size / 2 - 18);
    ctx.font = "bold 52px Arial";
    ctx.fillText("kg", size / 2, size / 2 + 62);
    tex.update();

    const mat = new StandardMaterial(`massMat_${team}_${spec.id}`, scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;

    const plane = MeshBuilder.CreatePlane(`massLabel_${team}_${spec.id}`, { size: spec.radius * 1.25 }, scene);
    plane.rotation.x = Math.PI / 2;
    plane.material = mat;
    return plane;
}

export function createPiece(scene: Scene, archetype: ArchetypeId, team: Team, home: Vector3): Piece {
    const spec = ARCHETYPES[archetype];
    const colors = TEAM_COLORS[team];
    const name = `piece_${team}_${archetype}`;

    // Corpo principal: cilindro do botão
    const base = MeshBuilder.CreateCylinder(name, {
        diameter: spec.radius * 2,
        height: spec.height,
        tessellation: 32,
    }, scene);
    base.position.copyFrom(home);
    base.rotationQuaternion = Quaternion.Identity();

    const baseMat = new StandardMaterial(name + "_mat", scene);
    baseMat.diffuseColor = colors.base;
    baseMat.specularColor = new Color3(spec.specular, spec.specular, spec.specular);
    base.material = baseMat;

    // "Botão" central elevado (estética de futebol de botão)
    const knob = MeshBuilder.CreateCylinder(name + "_knob", {
        diameter: spec.radius * 1.15,
        height: spec.height * 0.45,
        tessellation: 32,
    }, scene);
    knob.parent = base;
    knob.position.y = spec.height / 2 + spec.height * 0.45 / 2 - 0.005;
    const knobMat = new StandardMaterial(name + "_knobMat", scene);
    knobMat.diffuseColor = colors.knob;
    knobMat.specularColor = new Color3(spec.specular, spec.specular, spec.specular);
    knob.material = knobMat;

    // Massa estampada no topo
    const label = createMassLabel(scene, spec, team);
    label.parent = base;
    label.position.y = spec.height / 2 + spec.height * 0.45 + 0.004;

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
    aggregate.body.setLinearDamping(0.06);
    aggregate.body.setAngularDamping(0.9);

    // Permite teleporte por manipulação direta do mesh (resets e filtro de segurança)
    aggregate.body.disablePreStep = false;

    const piece: Piece = {
        mesh: base, aggregate, spec, team, home: home.clone(),
        baseMat, knobMat,
        baseColor: colors.base.clone(), knobColor: colors.knob.clone(),
    };

    // Metadata para picking do slingshot (inclui filhos decorativos)
    base.metadata = { piece };
    knob.metadata = { piece };
    label.metadata = { piece };

    return piece;
}

/**
 * Feedback visual da regra de toque consecutivo: a peça "em recuperação"
 * fica acinzentada até que outra peça do time seja lançada.
 */
export function setPieceRecovering(piece: Piece, recovering: boolean): void {
    if (recovering) {
        const gray = new Color3(0.42, 0.42, 0.46);
        Color3.LerpToRef(piece.baseColor, gray, 0.75, piece.baseMat.diffuseColor);
        Color3.LerpToRef(piece.knobColor, gray, 0.75, piece.knobMat.diffuseColor);
    } else {
        piece.baseMat.diffuseColor.copyFrom(piece.baseColor);
        piece.knobMat.diffuseColor.copyFrom(piece.knobColor);
    }
}

export function createBall(scene: Scene, home: Vector3): Ball {
    const radius = 0.3;
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
    aggregate.body.setLinearDamping(0.08);
    aggregate.body.setAngularDamping(0.85);
    aggregate.body.disablePreStep = false;

    return { mesh, aggregate, radius, mass, home: home.clone() };
}
