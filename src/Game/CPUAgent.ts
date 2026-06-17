import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Piece, Ball, TeamConfig } from "./PieceFactory";
import { Arena } from "./Arena";
import { MomentumSoccerGame } from "./MomentumSoccerGame";

/**
 * Perfil de Atributos Táticos inspirado em dados Opta reais
 */
interface AIProfile {
    passingPrecision: number;  // 0.0 a 1.0 (influencia o noiseFactor/dispersão)
    smartAim: boolean;         // se busca fugir do goleiro ou mira no centro
    shootAppetite: number;     // agressividade de finalização de média/longa distância
    minPassImpulse: number;    // firmeza e velocidade na troca de passes
}

/**
 * Agente de Inteligência Artificial para a CPU (Physics Cup 2026).
 * 
 * Versão tática baseada em atributos de seleções, eliminando o DDA artificial.
 */
export class CPUAgent {
    private static readonly BLOCKED_PENALTY = 0.15;
    private static readonly W_PROXIMITY = 0.70;
    private static readonly W_ALIGNMENT = 0.30;

    /** 
     * Resolve e gera a personalidade tática da seleção com base em dados de desempenho.
     */
    private static getAIProfile(teamId: string): AIProfile {
        const profile: AIProfile = {
            passingPrecision: 0.82,
            smartAim: true,
            shootAppetite: 0.60,
            minPassImpulse: 2.8
        };

        // Classificação das 48 seleções do teams.json em 3 arquétipos de performance
        const eliteTeams = [
            "brazil", "germany", "argentina", "france", 
            "england", "portugal", "netherlands", "belgium", "spain"
        ];
        
        const structuredTeams = [
            "australia", "austria", "colombia", "korea_republic", 
            "cote_d_ivoire", "croatia", "egypt", "ecuador", 
            "usa", "japan", "morocco", "mexico", "norway", 
            "senegal", "sweden", "switzerland", "turkiye", "uruguay"
        ];

        if (eliteTeams.includes(teamId)) {
            // Potências de Elite: Precisão matemática absoluta, passes na velocidade ideal e mira nas traves
            profile.passingPrecision = 1.0;   // Resulta matematicamente em noiseFactor = 0.00
            profile.smartAim = true;
            profile.shootAppetite = 0.85;
            profile.minPassImpulse = 3.4;     // Firmeza e velocidade calibradas em 3.4
        } else if (structuredTeams.includes(teamId)) {
            // Equipes Estruturadas: Consistência tática, boa colocação e apoio coletivo
            profile.passingPrecision = 0.88;
            profile.smartAim = true;
            profile.shootAppetite = 0.72;
            profile.minPassImpulse = 2.9;
        } else {
            // Equipes Desafiantes (Demais do JSON): Ritmo cadenciado, chutes seguros de curta distância
            profile.passingPrecision = 0.78;
            profile.smartAim = Math.random() < 0.75; // Perda ocasional de foco sob pressão
            profile.shootAppetite = 0.52;
            profile.minPassImpulse = 2.6;
        }

        return profile;
    }

    /** Executa a decisão tática da CPU no turno ativo e dispara o botão correspondente */
    public static executeTurn(game: MomentumSoccerGame): void {
        const ball = game.getBall();
        const ballPos = ball.mesh.position;
        const playerGoal = new Vector3(0, ballPos.y, -Arena.GOAL_LINE_Z - 0.3);

        // ── RESOLUÇÃO DE PERFIL TÁTICO POR SELEÇÃO ATIVA ──
        const cpuConfig = (game as any).getCpuTeamConfig ? game.getCpuTeamConfig() : null;
        const cpuTeamId = cpuConfig ? cpuConfig.id : "germany";
        const profile = CPUAgent.getAIProfile(cpuTeamId);

        // Mapeamento dinâmico de atributos baseados no país da CPU
        const noiseFactor = (1 - profile.passingPrecision) * 0.40; // Erro proporcional à precisão
        const smartAim = profile.smartAim;
        const minPassImpulse = profile.minPassImpulse;

        // ── REGRA TÁTICA DA PEQUENA ÁREA ──
        const isBallInSmallArea = ballPos.z >= Arena.GOAL_LINE_Z - Arena.AREA_D - 0.1 
            && Math.abs(ballPos.x) <= Arena.AREA_W / 2 + 0.1;

        let candidates = game.getCpuPieces().filter(p => {
            if (game.isPieceExhausted(p)) return false;
            if (p.spec.id === "goalkeeper") {
                return isBallInSmallArea;
            }
            return true;
        });
        
        if (candidates.length === 0) return;

        // ── DETERMINAÇÃO DO ALVO ──
        let shootTarget = playerGoal.clone();
        if (smartAim) {
            const opponentGk = game.getPlayerPieces().find(p => p.spec.id === "goalkeeper");
            if (opponentGk) {
                const gkX = opponentGk.mesh.position.x;
                shootTarget.x = gkX >= 0 ? -0.95 : 0.95; 
            } else {
                shootTarget.x = Math.random() < 0.5 ? -0.95 : 0.95;
            }
        }

        const goalPathClear = !CPUAgent.isCorridorBlocked(game, ballPos, shootTarget, ball.radius, [ball.mesh]);
        const distToGoal = Vector3.Distance(ballPos, shootTarget);
        
        // Limiar de agressividade de chute influenciado pelo apetite da seleção
        const shootThreshold = 5.5 + profile.shootAppetite * 3.5; 
        const randomShotRisk = distToGoal < shootThreshold && Math.random() < (profile.shootAppetite * 0.8);
        let shootAtGoal = goalPathClear || game.getTeamTouchesLeft() <= 3 || randomShotRisk;

        let target = shootTarget.clone();
        if (!shootAtGoal) {
            let bestMate: Piece | null = null;
            let bestMateScore = -Infinity;
            
            const isCrossingSituation = Math.abs(ballPos.z) > Arena.GOAL_LINE_Z - 1.2;

            for (const mate of game.getCpuPieces()) {
                const matePos = mate.mesh.position;
                const dist = Vector3.Distance(matePos, ballPos);
                if (dist < 0.9) continue;
                const blocked = CPUAgent.isCorridorBlocked(game, ballPos, matePos, ball.radius, [ball.mesh, mate.mesh]);
                const advance = ballPos.z - matePos.z;
                
                // Avança de forma mais assertiva se for uma equipe com alto apetite ofensivo
                let advanceScore = advance * (profile.shootAppetite * 0.22); 
                if (isCrossingSituation) {
                    const inBoxX = Math.abs(matePos.x) < 2.5;
                    const inBoxZ = matePos.z < -2.8 && matePos.z > -7.0;
                    if (inBoxX && inBoxZ) {
                        advanceScore = 1.2;
                    } else {
                        advanceScore = -0.6;
                    }
                }

                const score = (blocked ? 0 : 2.5) + advanceScore - dist * 0.07;
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

        let best: { piece: Piece; dir: Vector3; dist: number; align: number; score: number } | null = null;

        for (const piece of candidates) {
            const contact = ballPos.subtract(desired.scale(ball.radius + piece.spec.radius));

            const maxContactX = Arena.FIELD_W / 2 - piece.spec.radius - 0.05;
            contact.x = Math.max(-maxContactX, Math.min(maxContactX, contact.x));
            const maxContactZ = Arena.GOAL_LINE_Z - piece.spec.radius - 0.05;
            contact.z = Math.max(-maxContactZ, Math.min(maxContactZ, contact.z));

            const dir = contact.subtract(piece.mesh.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist < 0.05) continue;
            dir.normalize();

            const proximity = Math.exp(-dist / 1.6);
            const align = Vector3.Dot(dir, desired);
            const alignment = (align + 1) / 2;

            let score = CPUAgent.W_PROXIMITY * proximity + CPUAgent.W_ALIGNMENT * alignment;

            if (dist < 0.6 && align < 0.4) {
                score *= 0.10;
            }

            if (CPUAgent.isPathBlocked(game, piece, piece.mesh.position, contact)) {
                score *= CPUAgent.BLOCKED_PENALTY;
            }
            if (!best || score > best.score) {
                best = { piece, dir, dist, align, score };
            }
        }
        if (!best) return;

        let impulse: number;
        if (shootAtGoal) {
            impulse = distToGoal > 6.5 
                ? Math.min(13.0 + distToGoal * 0.3, 15.5) 
                : MomentumSoccerGame.MAX_IMPULSE;
        } else {
            const travel = Vector3.Distance(ballPos, target);
            const vBall = Math.min(2.5 + travel * 0.75, 5.0); 
            const m = best.piece.spec.mass;
            const vPiece = vBall * (m + ball.mass) / (2 * m) + best.dist * 0.50;
            
            impulse = Math.min(m * Math.max(vPiece, 1.6), MomentumSoccerGame.MAX_IMPULSE);
            impulse = Math.max(impulse, minPassImpulse); 
        }
        
        const isCornerKick = Math.abs(ballPos.z) > Arena.GOAL_LINE_Z - 1.0 && Math.abs(ballPos.x) > Arena.FIELD_W / 2 - 1.0;
        if (isCornerKick) {
            impulse = Math.max(impulse * (1 / 3), 2.2);
        }
        
        impulse = Math.min(impulse, game.getEnergyImpulseCap(best.piece));

        // Aplicação do erro de precisão (noiseFactor) derivado do perfil da seleção
        const noise = (Math.random() - 0.5) * noiseFactor * (1.2 - Math.max(best.align, 0));
        const cos = Math.cos(noise), sin = Math.sin(noise);
        const dx = best.dir.x * cos - best.dir.z * sin;
        const dz = best.dir.x * sin + best.dir.z * cos;

        const impulseVector = new Vector3(dx * impulse, 0, dz * impulse);
        game.applyCPUShot(best.piece, impulseVector, impulse);
    }

    private static isCorridorBlocked(game: MomentumSoccerGame, from: Vector3, to: Vector3, movingRadius: number, exclude: Mesh[]): boolean {
        const segX = to.x - from.x, segZ = to.z - from.z;
        const segLen2 = segX * segX + segZ * segZ;
        if (segLen2 < 1e-6) return false;

        const blockers: { x: number; z: number; radius: number }[] = [];
        
        for (const p of [...game.getPlayerPieces(), ...game.getCpuPieces()]) {
            if (exclude.includes(p.mesh)) continue;
            blockers.push({ x: p.mesh.position.x, z: p.mesh.position.z, radius: p.spec.radius });
        }

        const postRadius = 0.07;
        const goalZ = Arena.GOAL_LINE_Z;
        const goalHalfW = Arena.GOAL_W / 2;

        blockers.push({ x: -goalHalfW, z: -goalZ, radius: postRadius });
        blockers.push({ x: goalHalfW, z: -goalZ, radius: postRadius });
        blockers.push({ x: -goalHalfW, z: goalZ, radius: postRadius });
        blockers.push({ x: goalHalfW, z: goalZ, radius: postRadius });

        for (const blk of blockers) {
            const t = Math.max(0, Math.min(1, ((blk.x - from.x) * segX + (blk.z - from.z) * segZ) / segLen2));
            const dx = blk.x - (from.x + segX * t);
            const dz = blk.z - (from.z + segZ * t);
            const clearance = movingRadius + blk.radius + 0.04;
            if (dx * dx + dz * dz < clearance * clearance) return true;
        }
        return false;
    }

    private static isPathBlocked(game: MomentumSoccerGame, shooter: Piece, from: Vector3, to: Vector3): boolean {
        return CPUAgent.isCorridorBlocked(game, from, to, shooter.spec.radius, [shooter.mesh, game.getBall().mesh]);
    }
}