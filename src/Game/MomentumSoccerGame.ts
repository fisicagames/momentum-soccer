import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { RegisterJoinedPhysicsEngineComponent } from "@babylonjs/core/Physics/joinedPhysicsEngineComponent";
import { PhysicsEventType, IPhysicsCollisionEvent, IBasePhysicsCollisionEvent } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import HavokPhysics from "@babylonjs/havok";
import { Observer } from "@babylonjs/core/Misc/observable";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { CreateSoundAsync, AbstractSound } from "@babylonjs/core/AudioV2";

import { Arena } from "./Arena";
import { Piece, Ball, createPiece, createBall, POSITIONS, PositionId, Team } from "./PieceFactory";
import { SlingshotController, AimState } from "./SlingshotController";
import { GameHUD } from "./GameHUD";

type GameState = "PLAYER_AIM" | "CPU_TURN" | "ROLLING" | "GOAL_PAUSE" | "HALF_TIME" | "GAMEOVER";

/**
 * Joule Cup 2026 — futebol de botão por turnos para ensinar momento linear
 * e conservação de energia.
 */
export class MomentumSoccerGame {
    public static readonly MAX_IMPULSE = 18;
    public static readonly KICKOFF_MAX_IMPULSE = 1.6; // Força do kickoff calibrada em 1.6
    private static readonly MAX_DRAG = 2.2;
    private static readonly HALF_SECONDS = 180;
    private static readonly SETTLE_SPEED = 0.18;
    private static readonly ROLLING_TIMEOUT = 8;
    public static readonly TEAM_TOUCHES = 12;
    public static readonly ENERGY_EXHAUSTED = 1.0;
    public static readonly ENERGY_LOW = 25;
    public static readonly ENERGY_BAR_MAX = 200;

    // Impede disparos repetidos de reposição enquanto a bola voa no intervalo de tempo
    private isEndlineSequenceActive = false;

    private scene: Scene;
    private plugin!: HavokPlugin;

    // Estado da partida (Utilizando o tipo unificado Team)
    private gameState: GameState = "PLAYER_AIM";
    private possession: Team = "player";
    private stateTime = 0;
    private playerScore = 0;
    private cpuScore = 0;
    private hasShotOnce = false;

    // Cronômetro: 2 tempos de 3 minutos
    private half: 1 | 2 = 1;
    private timeLeft = MomentumSoccerGame.HALF_SECONDS;
    private lastTimerSecond = -1;

    // ── Regra de 12 toques ───────────────────────────────────────────────
    private lastTouchTeam: Team | null = null;
    private teamTouchesLeft = MomentumSoccerGame.TEAM_TOUCHES;
    private currentShot: {
        piece: Piece;
        team: Team;
        ballTouched: boolean;
        foul: boolean;
        oppContactAfterBall: boolean;
    } | null = null;

    // ── Conservação de energia ───────────────────────────────────────────
    private pieceEnergy = new Map<Piece, number>();

    // ── Saída de bola (KICKOFF) ──────────────────────────────────────────
    private kickoffActive = false;

    // Entidades (os goleiros são peças comuns, no índice 10 dos arrays)
    private playerPieces: Piece[] = [];
    private cpuPieces: Piece[] = [];
    private ball!: Ball;

    // Gol detectado pelo trigger físico
    private pendingGoal: Team | null = null;
    private triggerObserver: Observer<IBasePhysicsCollisionEvent> | null = null;

    // Sistemas
    private camera!: ArcRotateCamera;
    private slingshot!: SlingshotController;
    private sparkSystem!: ParticleSystem;
    private confettiSystem!: ParticleSystem;
    private impactSound: AbstractSound | null = null;

    // Feedback de colisão
    private lastHitTimes = new Map<string, number>();
    private shockRings: { mesh: Mesh; life: number; maxScale: number }[] = [];

    // O Módulo HUD unificado
    private hud!: GameHUD;

    // Callbacks para o Controller
    private onGameOverCallback: (() => void) | null = null;
    private onGameResumeCallback: (() => void) | null = null;

    private gameLoopObserver: Observer<Scene> | null = null;

    // Idioma atual (0 = PT, 1 = EN)
    private currentLang = 0;

    // Vetores de trabalho
    private readonly _tmp = Vector3.Zero();
    private readonly _tmp2 = Vector3.Zero();

    constructor(scene: Scene) {
        this.scene = scene;
    }

    public async start(): Promise<void> {
        RegisterJoinedPhysicsEngineComponent();
        const wasmUrl = new URL("assets/wasm/HavokPhysics.wasm", document.baseURI).href;
        const havok = await HavokPhysics({ locateFile: () => wasmUrl });
        this.plugin = new HavokPlugin(true, havok);
        if (!this.scene.enablePhysics(new Vector3(0, -9.81, 0), this.plugin)) {
            throw new Error("MomentumSoccerGame: enablePhysics falhou — physics engine não registrada.");
        }

        this.setupCamera();
        this.setupLights();
        const goalTriggers = Arena.build(this.scene);
        this.buildTeams();
        this.setupGoalTriggers(goalTriggers);
        this.buildParticles();
        this.setupCollisionFeedback();
        this.setupSlingshot();
        
        // Instancia o novo módulo HUD delegando as responsabilidades de GUI
        this.hud = new GameHUD(this.scene, () => this.restartMatch());
        this.hud.setLanguage(this.currentLang);
        this.hud.updateScore(this.playerScore, this.cpuScore, this.possession);
        this.hud.updateTimer(this.timeLeft, this.half);
        this.hud.updateTurnText(this.teamTouchesLeft, MomentumSoccerGame.TEAM_TOUCHES, this.gameState);
        this.hud.showHint(this.hasShotOnce);

        this.setupGameLoop();

        // A partida abre com saída de bola automática do jogador
        this.beginKickoff("player");

        CreateSoundAsync("impact", "./assets/sounds/universfield-ground-impact-352053.mp3", { loop: false })
            .then(s => { this.impactSound = s; });

        if (import.meta.env.DEV) {
            (window as unknown as Record<string, unknown>).__msGame = this;
        }
    }

    // ── CÂMERA ────────────────────────────────────────────────────────────────

    private setupCamera(): void {
        const canvas = this.scene.getEngine().getRenderingCanvas()!;
        this.camera = new ArcRotateCamera(
            "soccerCam", -Math.PI / 2, 1.02, 14,
            new Vector3(0, 0, -2.5), this.scene
        );
        this.camera.lowerRadiusLimit = 8;
        this.camera.upperRadiusLimit = 24;
        this.camera.lowerBetaLimit = 0.25;
        this.camera.upperBetaLimit = 1.30;
        this.camera.panningSensibility = 0;
        this.camera.attachControl(canvas, true);
        this.scene.activeCamera = this.camera;
    }

    private updateCamera(): void {
        const ballPos = this.ball.mesh.position;
        const target = this.camera.target;

        if (this.gameState === "PLAYER_AIM") {
            let nearest = this.playerPieces[0].mesh.position;
            let best = Number.MAX_VALUE;
            for (const p of this.playerPieces) {
                const d = Vector3.DistanceSquared(p.mesh.position, ballPos);
                if (d < best) { best = d; nearest = p.mesh.position; }
            }
            this._tmp.copyFrom(ballPos).addInPlace(nearest).scaleInPlace(0.5);
            target.x += (this._tmp.x - target.x) * 0.06;
            target.z += (this._tmp.z - target.z) * 0.06;
        } else {
            target.x += (ballPos.x - target.x) * 0.06;
            target.z += (ballPos.z - target.z) * 0.06;
            this.camera.alpha += (-Math.PI / 2 - this.camera.alpha) * 0.04;
            this.camera.beta += (0.78 - this.camera.beta) * 0.04;
            this.camera.radius += (17.5 - this.camera.radius) * 0.04;
        }
    }

    private setCameraControl(enabled: boolean): void {
        const canvas = this.scene.getEngine().getRenderingCanvas()!;
        if (enabled) this.camera.attachControl(canvas, true);
        else this.camera.detachControl();
    }

    // ── ILUMINAÇÃO ────────────────────────────────────────────────────────────

    private setupLights(): void {
        const hemi = new HemisphericLight("soccerHemi", new Vector3(0, 1, 0), this.scene);
        hemi.intensity = 0.75;
        hemi.diffuse = new Color3(0.85, 0.9, 1.0);
        hemi.groundColor = new Color3(0.25, 0.45, 0.2);

        const dir = new DirectionalLight("soccerDir", new Vector3(-1.5, -3, -1), this.scene);
        dir.intensity = 1.0;
        dir.diffuse = new Color3(1.0, 0.96, 0.85);
        dir.specular = new Color3(0.6, 0.5, 0.4);
        dir.position.set(8, 14, -5);
    }

    // ── TIMES ─────────────────────────────────────────────────────────────────

    private buildTeams(): void {
        const formation: { position: PositionId; x: number; z: number }[] = [
            { position: "left_back", x: -2.4, z: 5.8 },
            { position: "center_back", x: 0, z: 6.0 },
            { position: "right_back", x: 2.4, z: 5.8 },
            { position: "left_midfielder", x: -3.0, z: 3.8 },
            { position: "volante", x: -1.0, z: 3.4 },
            { position: "meia_armador", x: 1.0, z: 3.4 },
            { position: "right_midfielder", x: 3.0, z: 3.8 },
            { position: "left_winger", x: -2.2, z: 1.4 },
            { position: "center_forward", x: 0, z: 1.0 },
            { position: "right_winger", x: 2.2, z: 1.4 },
            { position: "goalkeeper", x: 0, z: Arena.GOAL_LINE_Z - 0.45 },
        ];

        for (const f of formation) {
            const y = POSITIONS[f.position].height / 2 + 0.001;
            this.playerPieces.push(createPiece(this.scene, f.position, "player", new Vector3(f.x, y, -f.z)));
            this.cpuPieces.push(createPiece(this.scene, f.position, "cpu", new Vector3(-f.x, y, f.z)));
        }

        this.ball = createBall(this.scene, new Vector3(0, 0.19, 0));
        this.refillEnergy();
    }

    // ── CONSERVAÇÃO DE ENERGIA ───────────────────────────────────────────────

    private static energyCapacity(mass: number): number {
        return 211.11 - 11.11 * mass;
    }

    private energyOf(piece: Piece): number {
        return this.pieceEnergy.get(piece) ?? MomentumSoccerGame.energyCapacity(piece.spec.mass);
    }

    private refillEnergy(): void {
        for (const p of [...this.playerPieces, ...this.cpuPieces]) {
            this.pieceEnergy.set(p, MomentumSoccerGame.energyCapacity(p.spec.mass));
        }
    }

    private energyImpulseCap(piece: Piece): number {
        const energy = Math.max(this.energyOf(piece), 0);
        return Math.sqrt(2 * piece.spec.mass * energy);
    }

    private isExhausted(piece: Piece): boolean {
        return this.energyOf(piece) <= MomentumSoccerGame.ENERGY_EXHAUSTED;
    }

    private allBodies(): { mesh: Mesh; piece?: Piece }[] {
        return [
            ...this.playerPieces.map(p => ({ mesh: p.mesh, piece: p })),
            ...this.cpuPieces.map(p => ({ mesh: p.mesh, piece: p })),
            { mesh: this.ball.mesh },
        ];
    }

    private resetFormation(): void {
        this.hud.hideGoal();
        this.isEndlineSequenceActive = false;
        for (const p of [...this.playerPieces, ...this.cpuPieces]) {
            this.teleport(p.mesh, p.home, p.aggregate);
        }
        
        // Garante a restauração do amortecimento padrão da bola (0.05) para o reinício do jogo
        this.ball.aggregate.body.setLinearDamping(0.05);

        this.teleport(this.ball.mesh, this.ball.home, this.ball.aggregate);
        this.pendingGoal = null;
        this.currentShot = null;
    }

    private enterTurnState(): void {
        this.enterState(this.possession === "player" ? "PLAYER_AIM" : "CPU_TURN");
    }

    private beginKickoff(team: Team): void {
        this.hud.hideGoal();
        this.isEndlineSequenceActive = false;
        const ownPieces = team === "player" ? this.playerPieces : this.cpuPieces;
        const oppPieces = team === "player" ? this.cpuPieces : this.playerPieces;
        const piece = ownPieces.find(p => p.spec.id === "center_forward")!;
        const gap = this.ball.radius + piece.spec.radius + piece.spec.radius;
        const sign = team === "player" ? 1 : -1;
        this.teleport(piece.mesh, this._tmp.set(0, piece.home.y, sign * gap), piece.aggregate);

        const defender = oppPieces.find(p => p.spec.id === "center_forward")!;
        this.teleport(defender.mesh, this._tmp.set(0, defender.home.y, sign * 2.2), defender.aggregate);

        this.kickoffActive = true;
        this.possession = team;
        this.teamTouchesLeft = MomentumSoccerGame.TEAM_TOUCHES;
        this.refillEnergy();
        
        this.executeAutomaticKickoff(team);
    }

    private executeAutomaticKickoff(team: Team): void {
        const ownPieces = team === "player" ? this.playerPieces : this.cpuPieces;
        const piece = ownPieces.find(p => p.spec.id === "center_forward")!;
        
        const dir = this.ball.mesh.position.subtract(piece.mesh.position);
        dir.y = 0;
        dir.normalize();

        const angle = (Math.random() - 0.5) * 0.6;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const dx = dir.x * cos - dir.z * sin;
        const dz = dir.x * sin + dir.z * cos;

        // Usa a variação randômica sobre a constante (entre 70% e 100% de 1.6 de momento)
        const impulse = MomentumSoccerGame.KICKOFF_MAX_IMPULSE * (0.7 + 0.3 * Math.random());
        this._tmp.set(dx * impulse, 0, dz * impulse);
        piece.aggregate.body.applyImpulse(this._tmp, piece.mesh.getAbsolutePosition());

        this.trackShot(piece, team, impulse);
        this.enterState("ROLLING");
    }

    private changePossessionTo(team: Team): void {
        this.possession = team;
        this.teamTouchesLeft = MomentumSoccerGame.TEAM_TOUCHES;
        this.refillEnergy();
        if (!this.kickoffActive && this.ballNeedsGoalKick(team)) {
            this.goalKickReposition(team);
        }
        this.enterTurnState();
    }

    private ballNeedsGoalKick(team: Team): boolean {
        const side = team === "player" ? -1 : 1;
        const pos = this.ball.mesh.position;
        const depth = pos.z * side;
        const inSmallArea = depth >= Arena.GOAL_LINE_Z - Arena.AREA_D
            && Math.abs(pos.x) <= Arena.AREA_W / 2;
        const nearBackLine = depth >= Arena.GOAL_LINE_Z - 0.45;
        return inSmallArea || nearBackLine;
    }

    private goalKickReposition(team: Team): void {
        const side = team === "player" ? -1 : 1;
        const areaLineZ = side * (Arena.GOAL_LINE_Z - Arena.AREA_D);

        const goalkeeper = (team === "player" ? this.playerPieces : this.cpuPieces).find(p => p.spec.id === "goalkeeper")!;
        const gkZ = areaLineZ + side * (this.ball.radius + goalkeeper.spec.radius + 0.12);

        // ── EVITAR SOBREPOSIÇÃO FÍSICA (AFASTAMENTO LATERAL) ─────────────────
        const allPieces = [...this.playerPieces, ...this.cpuPieces];
        for (const p of allPieces) {
            if (p === goalkeeper) continue;

            const distToBall = Vector3.Distance(p.mesh.position, this._tmp.set(0, p.mesh.position.y, areaLineZ));
            const distToGk = Vector3.Distance(p.mesh.position, this._tmp.set(0, p.mesh.position.y, gkZ));

            if (distToBall < 1.0 || distToGk < 1.0) {
                const pushX = p.mesh.position.x >= 0 ? 1.5 : -1.5;
                this.teleport(p.mesh, new Vector3(pushX, p.mesh.position.y, p.mesh.position.z), p.aggregate);
            }
        }

        this.teleport(this.ball.mesh, this._tmp.set(0, 0.19, areaLineZ), this.ball.aggregate);
        this.teleport(goalkeeper.mesh, this._tmp.set(0, goalkeeper.home.y, gkZ), goalkeeper.aggregate);

        this.hud.showAlert(this.t("⚽ Tiro de Meta — Reposição do Goleiro!", "⚽ Goal kick — Goalkeeper restart!"), "#CCCCCC");
    }

    private resolveShot(): void {
        const shot = this.currentShot;
        this.currentShot = null;
        if (!shot) {
            this.enterTurnState();
            return;
        }
        const opponent: Team = shot.team === "player" ? "cpu" : "player";

        if (shot.foul) {
            this.hud.showAlert(this.t("🚫 Colisão ilegal (falta)! Posse perdida.", "🚫 Illegal contact (foul)! Possession lost."), "#FF6655");
            this.changePossessionTo(opponent);
            return;
        }

        if (this.kickoffActive) {
            this.kickoffActive = false;
        } else {
            this.teamTouchesLeft--;
        }

        let alert: [string, string] | null = null;

        if (shot.oppContactAfterBall) {
            this.teamTouchesLeft = Math.min(this.teamTouchesLeft, 3);
            alert = ["⚠️ Colisão com adversário! Turno reduzido para mais 3 toques!", "⚠️ Contact with opponent! Turn reduced to 3 more touches!"];
        }

        if (this.teamTouchesLeft <= 0) {
            this.hud.showAlert(this.t("⏱ Turno esgotado! Posse perdida.", "⏱ Touches exhausted! Possession lost."), "#FF6655");
            this.changePossessionTo(opponent);
            return;
        }

        if (alert) this.hud.showAlert(this.t(alert[0], alert[1]), "#FFC34D");
        this.enterTurnState();
    }

    private trackShot(piece: Piece, team: Team, impulse: number): void {
        const kinetic = (impulse * impulse) / (2 * piece.spec.mass);
        this.pieceEnergy.set(piece, this.energyOf(piece) - kinetic);
        this.lastTouchTeam = team;
        this.currentShot = {
            piece, team,
            ballTouched: false,
            foul: false,
            oppContactAfterBall: false,
        };
    }

    private teleport(mesh: Mesh, to: Vector3, aggregate: { body: { setLinearVelocity(v: Vector3): void; setAngularVelocity(v: Vector3): void } }): void {
        aggregate.body.setLinearVelocity(Vector3.ZeroReadOnly);
        aggregate.body.setAngularVelocity(Vector3.ZeroReadOnly);
        mesh.position.copyFrom(to);
        mesh.rotationQuaternion?.set(0, 0, 0, 1);
    }

    // ── SLINGSHOT (INPUT DO JOGADOR) ─────────────────────────────────────────

    private setupSlingshot(): void {
        this.slingshot = new SlingshotController(this.scene, {
            camera: this.camera,
            maxImpulse: MomentumSoccerGame.MAX_IMPULSE,
            maxDrag: MomentumSoccerGame.MAX_DRAG,
            impulseCap: (piece) => Math.min(MomentumSoccerGame.MAX_IMPULSE, this.energyImpulseCap(piece)),
            playerPieces: () => this.playerPieces,
            canAim: () => this.gameState === "PLAYER_AIM",
            canSelectPiece: (piece) => !this.isExhausted(piece),
            onBlockedTap: (_piece) => {
                this.hud.showAlert(this.t(
                    "🚫 Peça sem energia!\nEscolha outro jogador!",
                    "🚫 Piece out of energy!\nPick another player!"
                ), "#FF6655");
            },
            onAimUpdate: (aim) => {
                this.hud.showHint(true);
                this.hud.updateAimPanel(
                    aim.piece.spec.namePt, aim.piece.spec.nameEn,
                    aim.piece.spec.mass, aim.velocity, aim.impulse,
                    this.energyOf(aim.piece), MomentumSoccerGame.ENERGY_BAR_MAX, MomentumSoccerGame.ENERGY_LOW
                );
            },
            onAimEnd: () => {
                this.hud.hideAimPanel();
                this.hud.showHint(this.hasShotOnce);
            },
            onShoot: (aim) => this.shoot(aim),
        });
    }

    private shoot(aim: AimState): void {
        this.hud.hideAimPanel();
        if (this.gameState !== "PLAYER_AIM") return;
        this._tmp.copyFrom(aim.direction).scaleInPlace(aim.impulse);
        aim.piece.aggregate.body.applyImpulse(this._tmp, aim.piece.mesh.getAbsolutePosition());
        this.hasShotOnce = true;
        this.hud.showHint(true);
        this.kickoffActive = false;
        this.trackShot(aim.piece, "player", aim.impulse);
        this.enterState("ROLLING");
    }

    // ── IA DO ADVERSÁRIO ─────────────────────────────────────────────────────

    private isCorridorBlocked(from: Vector3, to: Vector3, movingRadius: number, exclude: Mesh[]): boolean {
        const segX = to.x - from.x, segZ = to.z - from.z;
        const segLen2 = segX * segX + segZ * segZ;
        if (segLen2 < 1e-6) return false;

        const blockers: { x: number; z: number; radius: number }[] = [];
        for (const p of [...this.playerPieces, ...this.cpuPieces]) {
            if (exclude.includes(p.mesh)) continue;
            blockers.push({ x: p.mesh.position.x, z: p.mesh.position.z, radius: p.spec.radius });
        }

        for (const blk of blockers) {
            const t = Math.max(0, Math.min(1, ((blk.x - from.x) * segX + (blk.z - from.z) * segZ) / segLen2));
            const dx = blk.x - (from.x + segX * t);
            const dz = blk.z - (from.z + segZ * t);
            const clearance = movingRadius + blk.radius + 0.04;
            if (dx * dx + dz * dz < clearance * clearance) return true;
        }
        return false;
    }

    private isPathBlocked(shooter: Piece, from: Vector3, to: Vector3): boolean {
        return this.isCorridorBlocked(from, to, shooter.spec.radius, [shooter.mesh, this.ball.mesh]);
    }

    private cpuShoot(): void {
        const ballPos = this.ball.mesh.position;
        const playerGoal = this._tmp2.set(0, ballPos.y, -Arena.GOAL_LINE_Z - 0.3);

        const candidates = this.cpuPieces.filter(p => !this.isExhausted(p));
        if (candidates.length === 0) return;

        const goalPathClear = !this.isCorridorBlocked(ballPos, playerGoal, this.ball.radius, [this.ball.mesh]);
        
        const distToGoal = Vector3.Distance(ballPos, playerGoal);
        const randomShotRisk = distToGoal < 7.5 && Math.random() < 0.5;
        let shootAtGoal = goalPathClear || this.teamTouchesLeft <= 4 || randomShotRisk;

        let target = playerGoal.clone();
        if (!shootAtGoal) {
            let bestMate: Piece | null = null;
            let bestMateScore = -Infinity;
            for (const mate of this.cpuPieces) {
                const matePos = mate.mesh.position;
                const dist = Vector3.Distance(matePos, ballPos);
                if (dist < 0.9) continue;
                const blocked = this.isCorridorBlocked(ballPos, matePos, this.ball.radius, [this.ball.mesh, mate.mesh]);
                const advance = ballPos.z - matePos.z;
                
                const score = (blocked ? 0 : 2.0) + advance * 0.15 - dist * 0.08;
                if (score > bestMateScore) {
                    bestMateScore = score;
                    bestMate = mate;
                }
            }
            if (bestMate) target = bestMate.mesh.position.clone();
            else shootAtGoal = true;
        }

        const desired = target.subtract(ballPos);
        desired.y = 0;
        desired.normalize();

        const W_PROXIMITY = 0.75;
        const W_ALIGNMENT = 0.25;
        const BLOCKED_PENALTY = 0.20;

        let best: { piece: Piece; dir: Vector3; dist: number; align: number; score: number } | null = null;

        for (const piece of candidates) {
            const contact = ballPos.subtract(desired.scale(this.ball.radius + piece.spec.radius));
            const dir = contact.subtract(piece.mesh.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist < 0.05) continue;
            dir.normalize();

            const proximity = Math.exp(-dist / 1.8);
            const align = Vector3.Dot(dir, desired);
            const alignment = (align + 1) / 2;

            let score = W_PROXIMITY * proximity + W_ALIGNMENT * alignment;
            if (this.isPathBlocked(piece, piece.mesh.position, contact)) {
                score *= BLOCKED_PENALTY;
            }
            if (!best || score > best.score) {
                best = { piece, dir, dist, align, score };
            }
        }
        if (!best) return;

        let impulse: number;
        if (shootAtGoal) {
            impulse = MomentumSoccerGame.MAX_IMPULSE;
        } else {
            const travel = Vector3.Distance(ballPos, target);
            const vBall = Math.min(2.2 + travel * 0.65, 4.5);
            const m = best.piece.spec.mass;
            const vPiece = vBall * (m + this.ball.mass) / (2 * m) + best.dist * 0.25;
            impulse = Math.min(m * Math.max(vPiece, 1.4), MomentumSoccerGame.MAX_IMPULSE);
        }
        
        impulse = Math.min(impulse, this.energyImpulseCap(best.piece));

        const noise = (Math.random() - 0.5) * 0.12 * (1.2 - Math.max(best.align, 0));
        const cos = Math.cos(noise), sin = Math.sin(noise);
        const dx = best.dir.x * cos - best.dir.z * sin;
        const dz = best.dir.x * sin + best.dir.z * cos;

        this._tmp.set(dx * impulse, 0, dz * impulse);
        best.piece.aggregate.body.applyImpulse(this._tmp, best.piece.mesh.getAbsolutePosition());

        this.trackShot(best.piece, "cpu", impulse);
        this.enterState("ROLLING");
    }

    // ── PARTÍCULAS ───────────────────────────────────────────────────────────

    private buildParticles(): void {
        const flare = new Texture("https://assets.babylonjs.com/textures/flare.png", this.scene);

        this.sparkSystem = new ParticleSystem("sparks", 400, this.scene);
        this.sparkSystem.particleTexture = flare;
        this.sparkSystem.emitRate = 0;
        this.sparkSystem.minLifeTime = 0.15; this.sparkSystem.maxLifeTime = 0.5;
        this.sparkSystem.minEmitPower = 1.5; this.sparkSystem.maxEmitPower = 5;
        this.sparkSystem.updateSpeed = 0.02;
        this.sparkSystem.direction1 = new Vector3(-1, 0.5, -1);
        this.sparkSystem.direction2 = new Vector3(1, 1.5, 1);
        this.sparkSystem.gravity = new Vector3(0, -6, 0);
        this.sparkSystem.color1 = new Color4(1, 0.9, 0.4, 1);
        this.sparkSystem.color2 = new Color4(1, 0.5, 0.1, 1);
        this.sparkSystem.colorDead = new Color4(0.6, 0.2, 0, 0);
        this.sparkSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
        this.sparkSystem.start();

        this.confettiSystem = new ParticleSystem("confetti", 400, this.scene);
        this.confettiSystem.particleTexture = flare;
        this.confettiSystem.emitRate = 0;
        this.confettiSystem.minSize = 0.12; this.confettiSystem.maxSize = 0.4;
        this.confettiSystem.minLifeTime = 1.0; this.confettiSystem.maxLifeTime = 2.4;
        this.confettiSystem.minEmitPower = 5; this.confettiSystem.maxEmitPower = 11;
        this.confettiSystem.updateSpeed = 0.02;
        this.confettiSystem.direction1 = new Vector3(-3, 8, -2);
        this.confettiSystem.direction2 = new Vector3(3, 13, 2);
        this.confettiSystem.gravity = new Vector3(0, -7, 0);
        this.confettiSystem.color1 = new Color4(0.2, 0.7, 1, 1);
        this.confettiSystem.color2 = new Color4(1, 0.8, 0.1, 1);
        this.confettiSystem.colorDead = new Color4(1, 1, 1, 0);
        this.confettiSystem.start();

        const ringMat = new StandardMaterial("ringMat", this.scene);
        ringMat.emissiveColor = new Color3(1, 0.85, 0.3);
        ringMat.diffuseColor = Color3.Black();
        ringMat.alpha = 0.8;
        for (let i = 0; i < 3; i++) {
            const ring = MeshBuilder.CreateTorus(`shockRing_${i}`, {
                diameter: 1, thickness: 0.05, tessellation: 32,
            }, this.scene);
            ring.material = ringMat.clone(`ringMat_${i}`);
            ring.isPickable = false;
            ring.setEnabled(false);
            this.shockRings.push({ mesh: ring, life: 0, maxScale: 1 });
        }
    }

    // ── FEEDBACK DE COLISÃO POR Δp REAL ──────────────────────────────────────

    private setupCollisionFeedback(): void {
        const dynamicMeshes = new Set<string>([
            ...this.playerPieces.map(p => p.mesh.name),
            ...this.cpuPieces.map(p => p.mesh.name),
            this.ball.mesh.name,
        ]);

        const handler = (ev: IPhysicsCollisionEvent) => {
            if (ev.type !== PhysicsEventType.COLLISION_STARTED) return;

            if (this.currentShot && this.gameState === "ROLLING") {
                this.trackShotCollision(ev);
            }

            const a = ev.collider.transformNode?.name ?? "";
            const b = ev.collidedAgainst.transformNode?.name ?? "";
            if (!dynamicMeshes.has(a) || !dynamicMeshes.has(b)) return;

            const impulse = ev.impulse ?? 0;
            if (impulse < 0.35 || !ev.point) return;

            const key = a < b ? `${a}|${b}` : `${b}|${a}`;
            const now = performance.now();
            if (now - (this.lastHitTimes.get(key) ?? 0) < 80) return;
            this.lastHitTimes.set(key, now);

            this.emitCollisionFeedback(ev.point, impulse);
        };

        for (const p of [...this.playerPieces, ...this.cpuPieces]) {
            p.aggregate.body.setCollisionCallbackEnabled(true);
            p.aggregate.body.getCollisionObservable().add(handler);
        }
        this.ball.aggregate.body.setCollisionCallbackEnabled(true);
        this.ball.aggregate.body.getCollisionObservable().add(handler);
    }

    private trackShotCollision(ev: IPhysicsCollisionEvent): void {
        const shot = this.currentShot!;
        const shooterMesh = shot.piece.mesh;
        const nodeA = ev.collider.transformNode;
        const nodeB = ev.collidedAgainst.transformNode;
        const other = nodeA === shooterMesh ? nodeB : nodeB === shooterMesh ? nodeA : null;
        if (!other) return;

        if (other === this.ball.mesh) {
            shot.ballTouched = true;
            this.lastTouchTeam = shot.team;
            return;
        }

        const otherPiece = (other as Mesh).metadata?.piece as Piece | undefined;
        const oppTeam: Team = shot.team === "player" ? "cpu" : "player";
        if (otherPiece && otherPiece.team === oppTeam) {
            if (shot.ballTouched) {
                shot.oppContactAfterBall = true;
                this.lastTouchTeam = oppTeam;
            } else {
                shot.foul = true;
            }
        }
    }

    private emitCollisionFeedback(point: Vector3, impulse: number): void {
        const norm = Math.min(impulse / MomentumSoccerGame.MAX_IMPULSE, 1);

        this.sparkSystem.emitter = point.clone();
        this.sparkSystem.minSize = 0.06 + norm * 0.1;
        this.sparkSystem.maxSize = 0.15 + norm * 0.35;
        this.sparkSystem.manualEmitCount = Math.round(8 + norm * 120);

        const slot = this.shockRings.find(r => r.life <= 0);
        if (slot) {
            slot.life = 1;
            slot.maxScale = 1.2 + norm * 3.2;
            slot.mesh.position.set(point.x, 0.08, point.z);
            slot.mesh.scaling.setAll(0.2);
            slot.mesh.setEnabled(true);
        }

        if (impulse > 1.2) {
            this.hud.triggerFloatText(point, impulse, norm);
        }

        if (this.impactSound && impulse > 0.8) {
            this.impactSound.volume = Math.min(0.15 + norm, 1);
            this.impactSound.play();
        }
    }

    private updateFeedbackAnimations(dt: number): void {
        for (const r of this.shockRings) {
            if (r.life <= 0) continue;
            r.life -= dt * 2.2;
            if (r.life <= 0) { r.mesh.setEnabled(false); continue; }
            const t = 1 - r.life;
            r.mesh.scaling.setAll(0.2 + t * r.maxScale);
            (r.mesh.material as StandardMaterial).alpha = r.life * 0.8;
        }
        this.hud.updateFeedbackAnimations(dt);
    }

    // ── LOOP PRINCIPAL / MÁQUINA DE ESTADOS ──────────────────────────────────

    private enterState(state: GameState): void {
        this.gameState = state;
        this.stateTime = 0;
        if (state === "PLAYER_AIM") this.setCameraControl(true);
        else if (!this.slingshot?.isAiming) this.setCameraControl(false);
        this.updateTurnText();
    }

    private setupGameLoop(): void {
        this.gameLoopObserver = this.scene.onBeforeRenderObservable.add(() => {
            const dt = this.scene.getEngine().getDeltaTime() / 1000;
            this.stateTime += dt;

            this.updateCamera();
            this.updateMatchClock(dt);
            this.updateFeedbackAnimations(dt);
            this.safetyFilter();

            if (this.gameState !== "PLAYER_AIM" && this.hud) {
                this.hud.hideAimPanel();
            }

            switch (this.gameState) {
                case "ROLLING": {
                    const goal = this.detectGoal();
                    if (goal) { this.onGoal(goal); break; }
                    
                    if (this.checkGoalKick()) {
                        break;
                    }

                    if (this.stateTime > 0.7 && (this.maxBodySpeed() < MomentumSoccerGame.SETTLE_SPEED || this.stateTime > MomentumSoccerGame.ROLLING_TIMEOUT)) {
                        this.resolveShot();
                    }
                    break;
                }
                case "CPU_TURN": {
                    if (this.stateTime > 1.3) this.cpuShoot();
                    break;
                }
                case "PLAYER_AIM": {
                    const goal = this.detectGoal();
                    if (goal) this.onGoal(goal);
                    break;
                }
            }
        });
    }

    private maxBodySpeed(): number {
        let max = 0;
        for (const b of this.allBodies()) {
            const agg = b.piece ? b.piece.aggregate : this.ball.aggregate;
            const v = agg.body.getLinearVelocity().length();
            if (v > max) max = v;
        }
        return max;
    }

    private safetyFilter(): void {
        for (const p of [...this.playerPieces, ...this.cpuPieces]) {
            if (p.mesh.position.y < -0.5) this.teleport(p.mesh, p.home, p.aggregate);
        }
        if (this.ball.mesh.position.y < -0.5) {
            this.teleport(this.ball.mesh, this.ball.home, this.ball.aggregate);
        }
    }

    // ── GOLS E PLACAR ────────────────────────────────────────────────────────

    private setupGoalTriggers(triggers: Mesh[]): void {
        const triggerSides = new Map<string, number>(
            triggers.map(tm => [tm.name, (tm.metadata as { side: number }).side])
        );
        const ballName = this.ball.mesh.name;

        this.triggerObserver = this.plugin.onTriggerCollisionObservable.add((ev) => {
            if (ev.type !== PhysicsEventType.TRIGGER_ENTERED) return;
            if (this.gameState === "GOAL_PAUSE" || this.gameState === "HALF_TIME" || this.gameState === "GAMEOVER") return;
            const a = ev.collider.transformNode?.name ?? "";
            const b = ev.collidedAgainst.transformNode?.name ?? "";
            const side = triggerSides.get(a) ?? triggerSides.get(b);
            if (side === undefined || (a !== ballName && b !== ballName)) return;
            this.pendingGoal = side > 0 ? "player" : "cpu";
        });
    }

    private detectGoal(): Team | null {
        const goal = this.pendingGoal;
        this.pendingGoal = null;
        return goal;
    }

    /**
     * Resolve a bola saindo pela linha de fundo com atraso dramático (cinematográfico):
     *  - Se o último toque foi do ATACANTE: Tiro de Meta para o defensor após 1.5s.
     *  - Se o último toque foi do DEFENSOR: Escanteio para o atacante após 1.5s.
     */
    private checkGoalKick(): boolean {
        if (this.isEndlineSequenceActive) return true; // já está rodando a cena de vôo livre

        const pos = this.ball.mesh.position;

        // REGRA DE SEGURANÇA: Se a bola estiver indo em direção à boca do gol (abaixo do travessão 
        // e horizontalmente entre as traves), ignore a saída de campo e deixe-a rolar para marcar o gol.
        const isPotentialGoal = Math.abs(pos.x) < (Arena.GOAL_W / 2 - 0.05) && pos.y < Arena.POST_H;
        if (isPotentialGoal) return false;

        // Gatilho de saída: 7.2 no Z (apenas para bolas que vão para fora/chutes errados)
        if (Math.abs(pos.z) <= Arena.GOAL_LINE_Z - 0.3) return false;

        this.isEndlineSequenceActive = true;
        this.currentShot = null;

        const side = Math.sign(pos.z); // +1 = linha de fundo da CPU, -1 = do jogador
        const defendingTeam: Team = side > 0 ? "cpu" : "player";
        const attackingTeam: Team = side > 0 ? "player" : "cpu";

        const lastTouch = this.lastTouchTeam ?? attackingTeam;

        this.enterState("GOAL_PAUSE");
        const ballOutX = pos.x;

        if (lastTouch === attackingTeam) {
            this.hud.showAlert(this.t("⚽ Tiro de Meta!", "⚽ Goal Kick!"), "#CCCCCC");

            setTimeout(() => {
                this.isEndlineSequenceActive = false;
                if (this.gameState !== "GOAL_PAUSE") return;
                this.changePossessionTo(defendingTeam);
            }, 1500);
        } else {
            this.hud.showAlert(this.t("🚩 Escanteio!", "🚩 Corner Kick!"), "#FFD24A");

            setTimeout(() => {
                this.isEndlineSequenceActive = false;
                if (this.gameState !== "GOAL_PAUSE") return;

                const ownPieces = attackingTeam === "player" ? this.playerPieces : this.cpuPieces;
                let nearestPiece = ownPieces[0];
                let minDist = Infinity;
                for (const p of ownPieces) {
                    if (p.spec.id === "goalkeeper") continue;
                    const d = Vector3.DistanceSquared(p.mesh.position, pos);
                    if (d < minDist) { minDist = d; nearestPiece = p; }
                }

                const cornerX = (Math.sign(ballOutX) || 1) * (Arena.FIELD_W / 2 - 0.55);
                const cornerZ = side * (Arena.GOAL_LINE_Z - 0.55);
                const cornerPos = new Vector3(cornerX, 0.19, cornerZ);

                this.teleport(this.ball.mesh, cornerPos, this.ball.aggregate);

                const marginX = Arena.FIELD_W / 2 - nearestPiece.spec.radius - 0.12;
                const marginZ = Arena.GOAL_LINE_Z - nearestPiece.spec.radius - 0.12;
                const pieceX = Math.max(-marginX, Math.min(marginX, cornerX - Math.sign(cornerX) * 0.4));
                const pieceZ = Math.max(-marginZ, Math.min(marginZ, cornerZ - side * 0.4));
                const piecePos = new Vector3(pieceX, nearestPiece.home.y, pieceZ);

                this.teleport(nearestPiece.mesh, piecePos, nearestPiece.aggregate);

                this.possession = attackingTeam;
                this.teamTouchesLeft = MomentumSoccerGame.TEAM_TOUCHES;
                this.refillEnergy();
                this.enterTurnState();
            }, 1500);
        }

        return true;
    }

    private onGoal(scorer: Team): void {
        if (scorer === "player") this.playerScore++;
        else this.cpuScore++;
        this.updateScoreText();

        // Festa proporcional à conquista
        this.confettiSystem.emitter = this.ball.mesh.position.clone();
        this.confettiSystem.manualEmitCount = scorer === "player" ? 300 : 80;
        if (this.impactSound) { this.impactSound.volume = 1; this.impactSound.play(); }

        const goalText = scorer === "player" ? this.t("⚽ GOOOL!", "⚽ GOAL!") : this.t("😣 Gol do adversário!", "😣 Opponent scored!");
        const goalColor = scorer === "player" ? "#FFD700" : "#FF7766";
        this.hud.showGoal(goalText, goalColor);

        // ── EFEITO AMORTECEDOR DE REDE (Havok) ──────────────────────────────────
        // Zera as forças e eleva o damping para 5.0 (age como um freio fluido)
        // fazendo a bola perder toda a energia cinética e repousar mansamente na rede.
        this.ball.aggregate.body.setLinearVelocity(Vector3.ZeroReadOnly);
        this.ball.aggregate.body.setAngularVelocity(Vector3.ZeroReadOnly);
        this.ball.aggregate.body.setLinearDamping(5.0);

        this.currentShot = null;
        this.enterState("GOAL_PAUSE");

        setTimeout(() => {
            this.hud.hideGoal();
            if (this.gameState !== "GOAL_PAUSE") return;
            this.resetFormation();
            this.beginKickoff(scorer === "player" ? "cpu" : "player");
        }, 2400);
    }

    // ── CRONÔMETRO DA PARTIDA ────────────────────────────────────────────────

    private isClockRunning(): boolean {
        return this.gameState === "PLAYER_AIM" || this.gameState === "CPU_TURN"
            || this.gameState === "ROLLING" || this.gameState === "GOAL_PAUSE";
    }

    private updateMatchClock(dt: number): void {
        if (!this.isClockRunning()) return;
        this.timeLeft = Math.max(this.timeLeft - dt, 0);

        const second = Math.ceil(this.timeLeft);
        if (second !== this.lastTimerSecond) {
            this.lastTimerSecond = second;
            this.updateTimerText();
        }

        if (this.timeLeft <= 0 && (this.gameState === "PLAYER_AIM" || this.gameState === "CPU_TURN")) {
            this.endHalf();
        }
    }

    private endHalf(): void {
        if (this.half === 1) {
            const halfText = this.t("⏸ Fim do 1º Tempo\n— Intervalo —", "⏸ End of 1st Half\n— Break —");
            this.hud.showGoal(halfText, "#9FD4FF");
            this.enterState("HALF_TIME");

            setTimeout(() => {
                this.hud.hideGoal();
                if (this.gameState !== "HALF_TIME") return;
                this.half = 2;
                this.timeLeft = MomentumSoccerGame.HALF_SECONDS;
                this.resetFormation();
                this.beginKickoff("cpu");
            }, 3200);
        } else {
            this.endMatch();
        }
    }

    private endMatch(): void {
        const outcome = this.playerScore > this.cpuScore ? "win"
            : this.playerScore < this.cpuScore ? "loss" : "draw";
        this.saveRecord(outcome);
        this.enterState("GAMEOVER");

        const gameOverTitle = outcome === "win"
            ? this.t("🏆 Você venceu!", "🏆 You won!")
            : outcome === "loss"
                ? this.t("😞 O adversário venceu…", "😞 The opponent won…")
                : this.t("🤝 Empate!", "🤝 It's a draw!");
        const gameOverPhrase = this.t(
            "💡 Quanto maior a massa, menor a velocidade\npara o mesmo impulso: v = p/m.",
            "💡 The larger the mass, the lower the velocity\nfor the same impulse: v = p/m."
        );
        this.hud.showGameOver(gameOverTitle, gameOverPhrase);
        this.onGameOverCallback?.();
    }

    private restartMatch(): void {
        this.playerScore = 0;
        this.cpuScore = 0;
        this.half = 1;
        this.timeLeft = MomentumSoccerGame.HALF_SECONDS;
        this.lastTimerSecond = -1;
        this.updateScoreText();
        this.updateTimerText();
        this.hud.hideGameOver();
        this.resetFormation();
        this.onGameResumeCallback?.();
        this.beginKickoff("player");
    }

    private saveRecord(outcome: "win" | "loss" | "draw"): void {
        try {
            const raw = localStorage.getItem("momentum_soccer_record");
            const rec = raw ? JSON.parse(raw) : { wins: 0, losses: 0, draws: 0 };
            if (outcome === "win") rec.wins = (rec.wins ?? 0) + 1;
            else if (outcome === "loss") rec.losses = (rec.losses ?? 0) + 1;
            else rec.draws = (rec.draws ?? 0) + 1;
            localStorage.setItem("momentum_soccer_record", JSON.stringify(rec));
        } catch { /* erro silencioso */ }
    }

    // ── INTERFACE INTEGRAÇÃO ─────────────────────────────────────────────────

    private updateScoreText(): void {
        if (this.hud) {
            this.hud.updateScore(this.playerScore, this.cpuScore, this.possession);
        }
    }

    private updateTimerText(): void {
        if (this.hud) {
            this.hud.updateTimer(this.timeLeft, this.half);
        }
    }

    private updateTurnText(): void {
        if (this.hud) {
            this.hud.updateTurnText(this.teamTouchesLeft, MomentumSoccerGame.TEAM_TOUCHES, this.gameState);
        }
    }

    private applyTexts(): void {
        this.updateScoreText();
        this.updateTimerText();
        this.updateTurnText();
        if (this.hud) {
            this.hud.showHint(this.hasShotOnce);
        }
    }

    public setOnGameOver(cb: () => void): void { this.onGameOverCallback = cb; }
    public setOnGameResume(cb: () => void): void { this.onGameResumeCallback = cb; }

    public setLanguage(lang: number): void {
        this.currentLang = lang;
        if (this.hud) {
            this.hud.setLanguage(lang);
        }
        this.applyTexts();
    }

    private t(pt: string, en: string): string {
        return this.currentLang === 0 ? pt : en;
    }

    private fmt(n: number, dec: number): string {
        const s = n.toFixed(dec);
        return this.currentLang === 0 ? s.replace(".", ",") : s;
    }

    public dispose(): void {
        this.scene.onBeforeRenderObservable.remove(this.gameLoopObserver);
        this.plugin.onTriggerCollisionObservable.remove(this.triggerObserver);
        this.slingshot.dispose();

        this.sparkSystem.dispose();
        this.confettiSystem.dispose();
        this.impactSound?.dispose();

        this.hud.dispose();

        this.scene.meshes.slice().forEach(m => m.dispose());
        this.scene.lights.slice().forEach(l => l.dispose());

        this.camera.detachControl();
        this.camera.dispose();

        this.scene.disablePhysicsEngine();
    }
}