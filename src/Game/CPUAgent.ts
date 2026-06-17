import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Piece, Ball } from "./PieceFactory";
import { Arena } from "./Arena";
import { MomentumSoccerGame } from "./MomentumSoccerGame";

/**
 * Agente de Inteligência Artificial para a CPU (Joule Cup 2026).
 * 
 * Versão adaptativa com DDA (Dynamic Difficulty Adjustment).
 * Escala sua precisão, mira e agressividade com base no saldo de gols da partida.
 */
export class CPUAgent {
    private static readonly BLOCKED_PENALTY = 0.15;
    private static readonly W_PROXIMITY = 0.70;
    private static readonly W_ALIGNMENT = 0.30;

    /** Executa a decisão tática da CPU no turno ativo e dispara o botão correspondente */
    public static executeTurn(game: MomentumSoccerGame): void {
        const ball = game.getBall();
        const ballPos = ball.mesh.position;
        const playerGoal = new Vector3(0, ballPos.y, -Arena.GOAL_LINE_Z - 0.3);

        // ── MOTOR DDA: CÁLCULO DE INTENSIDADE DA IA ──
        const playerScore = game.getPlayerScore();
        const cpuScore = game.getCpuScore();
        const goalDiff = playerScore - cpuScore; // Saldo positivo = CPU perdendo; Saldo negativo = CPU vencendo

        // Parâmetros de dificuldade dinâmica que serão ajustados pelo saldo
        let noiseFactor = 0.06; // Dispersão física do chute (0 = precisão robótica perfeita)
        let smartAim = true;    // Se chuta fugindo do goleiro ou mira no centro
        let minPassImpulse = 3.2; // Firmeza do passe
        
        if (goalDiff >= 2) {
            // CPU PERDENDO POR 2 OU MAIS: Fúria total, precisão matemática absoluta
            noiseFactor = 0.00;
            smartAim = true;
            minPassImpulse = 3.4;
        } else if (goalDiff === 1) {
            // CPU PERDENDO POR 1: Jogo sério de elite
            noiseFactor = 0.02;
            smartAim = true;
            minPassImpulse = 3.2;
        } else if (goalDiff === 0 || goalDiff === -1) {
            // EMPATE OU VENCENDO POR 1: Dificuldade balanceada (padrão original)
            noiseFactor = 0.07;
            smartAim = true;
            minPassImpulse = 2.8;
        } else {
            // CPU VENCENDO POR 2 OU MAIS (GOLEADA): CPU "relaxa", comete erros e mira no meio
            noiseFactor = 0.12;
            smartAim = false;
            minPassImpulse = 2.4;
        }

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

        // ── DETERMINAÇÃO DO ALVO (MIRA ADAPTATIVA CALIBRADA) ──
        let shootTarget = playerGoal.clone();
        if (smartAim) {
            const opponentGk = game.getPlayerPieces().find(p => p.spec.id === "goalkeeper");
            if (opponentGk) {
                const gkX = opponentGk.mesh.position.x;
                // Calibração de segurança: Ajustado de 1.22 para 0.95 para garantir que a bola
                // entre de forma limpa, criando um colchão físico de segurança contra a trave (que fica em 1.50).
                shootTarget.x = gkX >= 0 ? -0.95 : 0.95; 
            } else {
                shootTarget.x = Math.random() < 0.5 ? -0.95 : 0.95;
            }
        }

        const goalPathClear = !CPUAgent.isCorridorBlocked(game, ballPos, shootTarget, ball.radius, [ball.mesh]);
        const distToGoal = Vector3.Distance(ballPos, shootTarget);
        
        // IA ajusta apetite ao risco de chute conforme a intensidade do jogo
        const shootThreshold = goalDiff >= 1 ? 8.5 : 7.0; 
        const randomShotRisk = distToGoal < shootThreshold && Math.random() < (goalDiff >= 1 ? 0.75 : 0.45);
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
                
                let advanceScore = advance * (goalDiff >= 1 ? 0.22 : 0.15); // Avança mais agressivamente se estiver perdendo
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

            // Travas físicas de campo
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
            impulse = MomentumSoccerGame.MAX_IMPULSE;
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

        // ── APLICAÇÃO DO RUÍDO DE DISPERSÃO ADAPTATIVO (DDA) ──
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