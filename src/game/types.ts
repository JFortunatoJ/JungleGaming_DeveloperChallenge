export type EndReason = 'time' | 'destroyed';
export type EnemyKind = 'chaser' | 'shooter';

export type Controls = {
  forward: boolean;
  left: boolean;
  right: boolean;
  front: boolean;
  port: boolean;
  starboard: boolean;
};

export type PlayerWeapon = Extract<keyof Controls, 'front' | 'port' | 'starboard'>;

export type GameOptions = {
  sessionSeconds: number;
  spawnSeconds: number;
};

export type GameConfig = GameOptions & {
  spawnMinimumDistance: number;
  spawnMinimumEnemyDistance: number;
  spawnPattern: EnemyKind[];
  spawnPoints: { x: number; y: number }[];
  playerHealth: number;
  playerSpeed: number;
  turnSpeed: number;
  enemyHealth: number;
  enemySpeed: number;
  enemyShotCooldown: number;
  enemyProjectileDamage: number;
  chaserCollisionDamage: number;
  chaserCollisionRange: number;
  projectileSpeed: number;
  projectileLife: number;
  projectileDamage: number;
  broadsideProjectileSpacing: number;
  frontCooldown: number;
  broadsideCooldown: number;
  shooterRange: number;
};

export type GameSnapshot = {
  health: number;
  score: number;
  remaining: number;
  enemies: number;
  paused: boolean;
};

export type MatchResult = {
  id: string;
  playerId: string;
  completedAt: string;
  score: number;
  duration: number;
  reason: EndReason;
  configuration: GameOptions;
};

export const defaultConfig: GameConfig = {
  sessionSeconds: 90,
  spawnSeconds: 3,
  spawnMinimumDistance: 360,
  spawnMinimumEnemyDistance: 100,
  spawnPattern: ['chaser', 'shooter'],
  spawnPoints: [
    { x: 850, y: 90 },
    { x: 840, y: 450 },
    { x: 110, y: 90 },
    { x: 100, y: 450 },
  ],
  playerHealth: 100,
  playerSpeed: 210,
  turnSpeed: 2,
  enemyHealth: 30,
  enemySpeed: 82,
  enemyShotCooldown: 1.2,
  enemyProjectileDamage: 10,
  chaserCollisionDamage: 18,
  chaserCollisionRange: 38,
  projectileSpeed: 420,
  projectileLife: 1.8,
  projectileDamage: 10,
  broadsideProjectileSpacing: 12,
  frontCooldown: 0.32,
  broadsideCooldown: 0.8,
  shooterRange: 290,
};

export const defaultControls = (): Controls => ({
  forward: false,
  left: false,
  right: false,
  front: false,
  port: false,
  starboard: false,
});
