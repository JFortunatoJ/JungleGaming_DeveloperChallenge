export type EndReason = 'time' | 'destroyed';
export type EnemyKind = 'chaser' | 'shooter';
export type Controls = { forward: boolean; left: boolean; right: boolean; front: boolean; port: boolean; starboard: boolean };
export type GameOptions = { sessionSeconds: number; spawnSeconds: number };
export type GameConfig = GameOptions & {
  playerHealth: number; playerSpeed: number; turnSpeed: number; enemyHealth: number; enemySpeed: number;
  projectileSpeed: number; projectileLife: number; projectileDamage: number; frontCooldown: number; broadsideCooldown: number; shooterRange: number;
};
export type GameSnapshot = { health: number; score: number; remaining: number; enemies: number; paused: boolean };
export type MatchResult = { id: string; playerId: string; completedAt: string; score: number; duration: number; reason: EndReason; configuration: GameOptions };
export const defaultConfig: GameConfig = { sessionSeconds: 90, spawnSeconds: 3, playerHealth: 100, playerSpeed: 210, turnSpeed: 2.8, enemyHealth: 30, enemySpeed: 82, projectileSpeed: 420, projectileLife: 1.8, projectileDamage: 10, frontCooldown: .32, broadsideCooldown: .8, shooterRange: 290 };
export const defaultControls = (): Controls => ({ forward: false, left: false, right: false, front: false, port: false, starboard: false });
