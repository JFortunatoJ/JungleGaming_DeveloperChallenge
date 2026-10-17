import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { playSound, setLoopingSound } from './audio';
import {
  defaultControls,
  type Controls,
  type EnemyKind,
  type EndReason,
  type GameConfig,
  type GameSnapshot,
  type MovementVector,
  type PlayerWeapon,
} from './types';

type Ship = {
  id: string;
  kind: 'player' | EnemyKind;
  x: number;
  y: number;
  angle: number;
  navigationWaypoint: { x: number; y: number } | null;
  navigationRefresh: number;
  health: number;
  sprite: Container;
  healthBar: Container;
  hull: Sprite;
  healthFill: Sprite;
  shotAt: Record<'front' | 'port' | 'starboard', number>;
  alive: boolean;
  fires: Sprite[];
};

type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fromPlayer: boolean;
  life: number;
  view: Sprite;
  trail: Graphics;
  trailPoints: { x: number; y: number }[];
};

type CrewMember = {
  sprite: Sprite;
  x: number;
  y: number;
  height: number;
  vx: number;
  vy: number;
  verticalSpeed: number;
  rotationSpeed: number;
  age: number;
};

type AnimatedEffect = {
  sprite: Sprite;
  frames: Texture[];
  age: number;
  frameDuration: number;
  duration: number;
};

type SplashEffect = {
  graphic: Graphics;
  age: number;
};

type ImpactParticle = {
  graphic: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  duration: number;
};

export type GameTextures = {
  ships: Record<Ship['kind'], Texture>;
  defeated: Record<EnemyKind, Texture>;
  healthBars: {
    player: { frame: Texture; green: Texture; amber: Texture; red: Texture };
    enemy: { frame: Texture; green: Texture; amber: Texture; red: Texture };
  };
  cannonBall: Texture;
  water: Texture;
  islandTiles: Record<number, Texture>;
  islandRock: Texture;
  islandFoliage: Texture;
  crew: Texture[];
  fire: Texture[];
  explosions: Texture[];
};

const W = 960;
const H = 540;
const islands = [
  { x: 480, y: 270, r: 72 },
  { x: 280, y: 120, r: 44 },
  { x: 710, y: 390, r: 50 },
];
const shipScale = 0.42;
const shipCollisionRadius = 28;

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Distance from a point to a line segment; used to keep routes clear of island shores. */
const distanceToSegment = (
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared
    ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
    : 0;

  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
};

/** Finds the first waypoint on the shortest visible route around all island collision circles. */
const findPathWaypoint = (start: { x: number; y: number }, target: { x: number; y: number }) => {
  const clearance = shipCollisionRadius + 2;
  const nodes = [start, target];
  const ringEdges = new Set<string>();
  const pointsPerIsland = 24;

  islands.forEach((obstacle) => {
    const ring: number[] = [];
    const routeRadius = obstacle.r + clearance + 12;

    for (let index = 0; index < pointsPerIsland; index += 1) {
      const angle = (index / pointsPerIsland) * Math.PI * 2;
      ring.push(nodes.length);
      nodes.push({
        x: clamp(obstacle.x + Math.cos(angle) * routeRadius, 8, W - 8),
        y: clamp(obstacle.y + Math.sin(angle) * routeRadius, 8, H - 8),
      });
    }

    ring.forEach((nodeIndex, position) => {
      const next = ring[(position + 1) % ring.length];
      ringEdges.add(`${Math.min(nodeIndex, next)}:${Math.max(nodeIndex, next)}`);
    });
  });

  const isClear = (from: number, to: number) =>
    islands.every(
      (obstacle) =>
        distanceToSegment(obstacle, nodes[from], nodes[to]) >= obstacle.r + clearance,
    );
  const distances = nodes.map((_, index) => (index === 0 ? 0 : Number.POSITIVE_INFINITY));
  const previous = nodes.map(() => -1);
  const visited = new Set<number>();

  // Visibility edges allow a ship to sail directly between clear points. Neighboring
  // points on each ring are also connected, forming safe arcs around blocked shores.
  while (visited.size < nodes.length) {
    let current = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      if (!visited.has(index) && (current < 0 || distances[index] < distances[current])) current = index;
    }
    if (current < 0 || !Number.isFinite(distances[current])) break;
    if (current === 1) break;
    visited.add(current);

    for (let next = 0; next < nodes.length; next += 1) {
      if (next === current || visited.has(next)) continue;
      const edgeKey = `${Math.min(current, next)}:${Math.max(current, next)}`;
      const isRingNeighbor = ringEdges.has(edgeKey);
      if (!isRingNeighbor && !isClear(current, next)) continue;

      const candidateDistance = distances[current] + distance(nodes[current], nodes[next]);
      if (candidateDistance < distances[next]) {
        distances[next] = candidateDistance;
        previous[next] = current;
      }
    }
  }

  if (previous[1] < 0) return target;
  let waypointIndex = 1;
  while (previous[waypointIndex] !== 0 && previous[waypointIndex] >= 0) {
    waypointIndex = previous[waypointIndex];
  }
  return nodes[waypointIndex];
};

/** The engine owns the continuous state. React only receives a small HUD snapshot a few times per second. */
export class GameEngine {
  readonly stage = new Container();
  private water!: TilingSprite;
  private controls: Controls = defaultControls();
  private joystickDirection: MovementVector = { x: 0, y: 0 };
  private player!: Ship;
  private enemies: Ship[] = [];
  private sinkingShips: { ship: Ship; age: number }[] = [];
  private bullets: Projectile[] = [];
  private crewMembers: CrewMember[] = [];
  private animatedEffects: AnimatedEffect[] = [];
  private splashEffects: SplashEffect[] = [];
  private impactParticles: ImpactParticle[] = [];
  private elapsed = 0;
  private spawnClock = 0;
  private running = true;
  private paused = false;
  private previous = 0;
  private hudPublishClock = 0;
  private score = 0;
  private shotCounts: Record<'front' | 'port' | 'starboard' | 'enemy', number> = {
    front: 0,
    port: 0,
    starboard: 0,
    enemy: 0,
  };
  private finishCountdown = 0;
  private enemySpawnCount = 0;
  private timeWarningPlayed = false;

  constructor(
    private readonly config: GameConfig,
    private readonly onHud: (s: GameSnapshot) => void,
    private readonly onEnd: (reason: EndReason, score: number, duration: number) => void,
    private readonly textures: GameTextures,
    private readonly random: () => number = Math.random,
  ) {
    this.drawArena();
    this.createPlayer();
  }

  setControl(name: keyof Controls, value: boolean) {
    this.controls[name] = value;
  }

  setJoystickDirection(direction: MovementVector) {
    const magnitude = Math.hypot(direction.x, direction.y);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    this.joystickDirection = { x: direction.x * scale, y: direction.y * scale };
  }

  firePlayerWeapon(weapon: PlayerWeapon) {
    if (!this.running || this.paused || !this.player.alive) return;

    const offset = weapon === 'port' ? -Math.PI / 2 : weapon === 'starboard' ? Math.PI / 2 : 0;
    this.fire(this.player, offset, weapon);
  }

  setPaused(value: boolean, now = performance.now()) {
    this.paused = value;
    this.previous = now;
    this.publish(true);
  }

  togglePause() {
    this.setPaused(!this.paused);
  }

  step(now: number) {
    const dt = Math.min(0.05, (now - this.previous) / 1000);
    this.previous = now;
    if (!this.running || this.paused) return;
    this.update(dt);
  }

  start(now: number) {
    this.previous = now;
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(width / W, height / H);
    this.stage.scale.set(scale);
    const offsetX = (width - W * scale) / 2;
    const offsetY = (height - H * scale) / 2;
    this.stage.position.set(offsetX, offsetY);

    // Keep the arena at its original 16:9 scale, but extend the water beneath the
    // letterboxed edges so wide landscape screens never show empty side bands.
    this.water.position.set(-offsetX / scale, -offsetY / scale);
    this.water.width = width / scale;
    this.water.height = height / scale;
  }

  destroy() {
    this.stage.destroy({ children: true });
  }

  /** Read-only state inspection used by development E2E and profiling tools. */
  getDebugSnapshot() {
    return {
      elapsed: this.elapsed,
      score: this.score,
      paused: this.paused,
      running: this.running,
      player: {
        x: this.player.x,
        y: this.player.y,
        angle: this.player.angle,
        health: this.player.health,
        alive: this.player.alive,
      },
      enemies: this.enemies.map(({ id, kind, x, y, angle, health, alive }) => ({
        id,
        kind,
        x,
        y,
        angle,
        health,
        alive,
      })),
      projectiles: this.bullets.map(({ x, y, vx, vy, fromPlayer }) => ({
        x,
        y,
        vx,
        vy,
        fromPlayer,
      })),
      entityCounts: {
        activeShips: Number(this.player.alive) + this.enemies.filter((ship) => ship.alive).length,
        sinkingShips: this.sinkingShips.length,
        projectiles: this.bullets.length,
        crew: this.crewMembers.length,
        animatedEffects: this.animatedEffects.length,
        splashes: this.splashEffects.length,
        impactParticles: this.impactParticles.length,
      },
      backgroundBounds: {
        x: this.stage.position.x + this.water.position.x * this.stage.scale.x,
        y: this.stage.position.y + this.water.position.y * this.stage.scale.y,
        width: this.water.width * this.stage.scale.x,
        height: this.water.height * this.stage.scale.y,
      },
      shotCounts: { ...this.shotCounts },
      arena: { width: W, height: H, islands: islands.map(({ x, y, r }) => ({ x, y, r })) },
    };
  }

  /** Arrange a deterministic test scene while preserving the normal enemy update and combat rules. */
  spawnEnemyForTest(kind: EnemyKind, x: number, y: number) {
    const enemy = this.spawnShip(kind, x, y);
    this.enemies.push(enemy);
    return enemy.id;
  }

  private drawArena() {
    // TilingSprite repeats the 64px water tile across the whole playfield without
    // creating dozens of individual sprites, keeping the background inexpensive.
    this.water = new TilingSprite({
      texture: this.textures.water,
      width: W,
      height: H,
    });
    this.stage.addChild(this.water);
    islands.forEach((island, index) => this.drawIsland(island, index));
  }

  private drawIsland(island: (typeof islands)[number], index: number) {
    const scale = island.r / 72;
    // These four rows are the complete island arrangement from the source atlas.
    // The last row supplies the lower beach edge that closes the island silhouette.
    const islandLayout = [
      [6, 7, 8, 9],
      [22, 23, 24, 25],
      [38, 39, 40, 41],
      [54, 55, 56, 57],
    ];
    const tileScale = island.r / 128;
    const tileSize = 64 * tileScale;
    const left = island.x - 2 * tileSize;
    const top = island.y - 2 * tileSize;
    const terrain = new Container();

    islandLayout.forEach((row, rowIndex) => {
      row.forEach((tileId, columnIndex) => {
        const tile = new Sprite(this.textures.islandTiles[tileId]);
        tile.scale.set(tileScale);
        tile.position.set(left + columnIndex * tileSize, top + rowIndex * tileSize);
        terrain.addChild(tile);
      });
    });

    const rock = new Sprite(this.textures.islandRock);
    rock.anchor.set(0.5);
    rock.scale.set(0.42 * scale);
    rock.position.set(island.x + 37 * scale, island.y - 13 * scale);

    const foliage = new Sprite(this.textures.islandFoliage);
    foliage.anchor.set(0.5);
    foliage.scale.set((index === 1 ? 0.45 : 0.62) * scale);
    foliage.position.set(island.x - 8 * scale, island.y - 14 * scale);

    this.stage.addChild(terrain, rock, foliage);
  }

  private createPlayer() {
    this.player = this.spawnShip('player', 150, 270);
  }

  private shipView(kind: Ship['kind']) {
    const wrap = new Container();
    // Textures are loaded by GameCanvas before the engine is constructed. Passing the ready
    // Texture avoids an implicit cache lookup and ensures a failed image cannot crash a match.
    const image = new Sprite(this.textures.ships[kind]);
    image.anchor.set(0.5);
    image.scale.set(shipScale);
    image.rotation = -Math.PI / 2;
    wrap.addChild(image);

    const healthTextures =
      kind === 'player' ? this.textures.healthBars.player : this.textures.healthBars.enemy;
    const healthFrame = new Sprite(healthTextures.frame);
    const healthFill = new Sprite(healthTextures.green);
    const healthScale = kind === 'player' ? 0.21 : 0.3375;

    healthFrame.anchor.set(0.5);
    healthFrame.scale.set(healthScale);
    healthFill.anchor.set(0, 0.5);
    healthFill.scale.set(healthScale);
    healthFill.x = -(healthTextures.frame.width * healthScale) / 2;
    // The frame asset has an opaque dark center, so draw the fill above it to keep the
    // colored portion visible while the fill's transparent outer pixels preserve the rim.
    const healthBar = new Container();
    healthBar.addChild(healthFrame, healthFill);

    return { container: wrap, healthBar, hull: image, healthFill };
  }

  private spawnShip(kind: Ship['kind'], x: number, y: number): Ship {
    const { container: sprite, healthBar, hull, healthFill } = this.shipView(kind);
    sprite.position.set(x, y);
    this.stage.addChild(sprite, healthBar);

    const ship = {
      id: crypto.randomUUID(),
      kind,
      x,
      y,
      angle: kind === 'player' ? 0 : Math.PI,
      navigationWaypoint: null,
      navigationRefresh: 0,
      health: kind === 'player' ? this.config.playerHealth : this.config.enemyHealth,
      sprite,
      healthBar,
      hull,
      healthFill,
      shotAt: {
        front: Number.NEGATIVE_INFINITY,
        port: Number.NEGATIVE_INFINITY,
        starboard: Number.NEGATIVE_INFINITY,
      },
      alive: true,
      fires: [],
    };

    this.drawHealth(ship);
    this.positionHealthBar(ship);
    return ship;
  }

  private drawHealth(ship: Ship) {
    const max = ship.kind === 'player' ? this.config.playerHealth : this.config.enemyHealth;
    const ratio = clamp(ship.health / max, 0, 1);
    const textures =
      ship.kind === 'player' ? this.textures.healthBars.player : this.textures.healthBars.enemy;
    const tintTexture = ratio < 0.25 ? textures.red : ratio <= 0.5 ? textures.amber : textures.green;
    const scale = ship.kind === 'player' ? 0.21 : 0.3375;
    const width = textures.frame.width * scale;
    const height = textures.frame.height * scale;

    ship.healthFill.texture = tintTexture;
    ship.healthFill.scale.set(width / tintTexture.width, height / tintTexture.height);
    ship.healthFill.width = width * ratio;
  }

  private positionHealthBar(ship: Ship) {
    const bounds = ship.healthBar.getLocalBounds();

    // Clamp the whole frame (not just its center) so it stays visible at screen edges.
    const x = clamp(ship.x, -bounds.x, W - bounds.x - bounds.width);
    const y = clamp(ship.y - 49, -bounds.y, H - bounds.y - bounds.height);
    ship.healthBar.position.set(x, y);
  }

  private update(dt: number) {
    this.hudPublishClock += dt;

    // Keep the final hit effects visible briefly before changing to the result screen.
    if (!this.player.alive) {
      this.updateSinkingShips(dt);
      this.updateCrew(dt);
      this.updateAnimatedEffects(dt);
      this.updateSplashEffects(dt);
      this.updateImpactParticles(dt);
      this.finishCountdown -= dt;
      this.publish();

      if (this.finishCountdown <= 0) this.finish('destroyed');
      return;
    }

    this.elapsed += dt;
    this.spawnClock += dt;

    if (this.elapsed >= this.config.sessionSeconds) return this.finish('time');
    if (!this.timeWarningPlayed && this.config.sessionSeconds - this.elapsed <= 10) {
      this.timeWarningPlayed = true;
      playSound('time_warning');
    }

    this.movePlayer(dt);

    if (this.spawnClock >= this.config.spawnSeconds) {
      this.spawnClock = 0;
      this.spawnEnemy();
    }

    this.enemies.forEach((enemy) => this.updateEnemy(enemy, dt));
    this.updateBullets(dt);
    this.updateSinkingShips(dt);
    this.updateCrew(dt);
    this.updateAnimatedEffects(dt);
    this.updateSplashEffects(dt);
    this.updateImpactParticles(dt);
    this.publish();
  }

  private movePlayer(dt: number) {
    const p = this.player;
    const joystickMagnitude = Math.hypot(this.joystickDirection.x, this.joystickDirection.y);
    setLoopingSound(
      'ship_sailing_loop',
      joystickMagnitude > 0 || this.controls.forward || this.controls.backward,
    );

    if (joystickMagnitude > 0) {
      // The virtual stick controls screen-space movement directly, and the hull faces that way.
      p.angle = Math.atan2(this.joystickDirection.y, this.joystickDirection.x);
      this.tryMove(
        p,
        this.joystickDirection.x * this.config.playerSpeed * dt,
        this.joystickDirection.y * this.config.playerSpeed * dt,
      );
    } else {
      if (this.controls.left) p.angle -= this.config.turnSpeed * dt;
      if (this.controls.right) p.angle += this.config.turnSpeed * dt;

      const movementDirection =
        this.controls.forward === this.controls.backward ? 0 : this.controls.forward ? 1 : -0.65;

      if (movementDirection !== 0) {
        this.tryMove(
          p,
          Math.cos(p.angle) * this.config.playerSpeed * dt * movementDirection,
          Math.sin(p.angle) * this.config.playerSpeed * dt * movementDirection,
        );
      }
    }

    if (this.controls.front) this.fire(p, 0, 'front');
    if (this.controls.port) this.fire(p, -Math.PI / 2, 'port');
    if (this.controls.starboard) this.fire(p, Math.PI / 2, 'starboard');

    this.renderShip(p);
  }

  private spawnEnemy() {
    const point = this.config.spawnPoints.find(
      ({ x, y }) =>
        distance({ x, y }, this.player) >= this.config.spawnMinimumDistance &&
        this.enemies.every(
          (enemy) => distance({ x, y }, enemy) >= this.config.spawnMinimumEnemyDistance,
        ) &&
        islands.every(
          (obstacle) =>
            distance({ x, y }, obstacle) > obstacle.r + shipCollisionRadius,
        ),
    );
    if (!point || this.config.spawnPattern.length === 0) return;

    const kind = this.config.spawnPattern[this.enemySpawnCount % this.config.spawnPattern.length];
    this.enemySpawnCount += 1;
    this.enemies.push(this.spawnShip(kind, point.x, point.y));
  }

  private updateEnemy(enemy: Ship, dt: number) {
    if (!enemy.alive) return;

    enemy.navigationRefresh -= dt;
    if (
      !enemy.navigationWaypoint ||
      enemy.navigationRefresh <= 0 ||
      distance(enemy, enemy.navigationWaypoint) < 18
    ) {
      enemy.navigationWaypoint = findPathWaypoint(enemy, this.player);
      enemy.navigationRefresh = 0.3;
    }

    const waypoint = enemy.navigationWaypoint;
    const desired = Math.atan2(waypoint.y - enemy.y, waypoint.x - enemy.x);
    enemy.angle +=
      Math.atan2(Math.sin(desired - enemy.angle), Math.cos(desired - enemy.angle)) *
      Math.min(1, 2 * dt);

    const d = distance(enemy, this.player);

    if (d > (enemy.kind === 'shooter' ? this.config.shooterRange : this.config.chaserCollisionRange)) {
      this.tryMove(
        enemy,
        Math.cos(enemy.angle) * this.config.enemySpeed * dt,
        Math.sin(enemy.angle) * this.config.enemySpeed * dt,
      );
    }

    if (enemy.kind === 'shooter' && d <= this.config.shooterRange) this.fire(enemy, 0);
    if (enemy.kind === 'chaser' && d < this.config.chaserCollisionRange) {
      playSound('ship_collision');
      this.damage(this.player, this.config.chaserCollisionDamage);
      this.throwCrew(enemy, 2);
      this.kill(enemy, false);
      return;
    }

    this.renderShip(enemy);
  }

  private tryMove(ship: Ship, dx: number, dy: number) {
    const x = clamp(ship.x + dx, shipCollisionRadius, W - shipCollisionRadius);
    const y = clamp(ship.y + dy, shipCollisionRadius, H - shipCollisionRadius);

    const isSafe = (candidateX: number, candidateY: number) =>
      islands.every(
        (obstacle) =>
          distance({ x: candidateX, y: candidateY }, obstacle) > obstacle.r + shipCollisionRadius,
      );

    if (isSafe(x, y)) {
      ship.x = x;
      ship.y = y;
      return;
    }

    // If the direct step clips a shore, accept safe axis steps separately so ships
    // can slide along the coast instead of repeatedly stopping at the same point.
    if (isSafe(x, ship.y)) ship.x = x;
    if (isSafe(ship.x, y)) ship.y = y;
  }

  private fire(ship: Ship, offset: number, weapon: 'front' | 'port' | 'starboard' = 'front') {
    const cooldown =
      ship.kind !== 'player'
        ? this.config.enemyShotCooldown
        : weapon === 'front'
          ? this.config.frontCooldown
          : this.config.broadsideCooldown;
    if (this.elapsed - ship.shotAt[weapon] < cooldown) return;

    ship.shotAt[weapon] = this.elapsed;
    const countKey = ship.kind === 'player' ? weapon : 'enemy';
    this.shotCounts[countKey] += 1;

    if (offset) {
      playSound('cannon_broadside');
    } else {
      const soundIndex = 1 + Math.floor(this.random() * 3);
      playSound(
        `cannon_fire_${soundIndex}` as 'cannon_fire_1' | 'cannon_fire_2' | 'cannon_fire_3',
      );
    }

    const angle = ship.angle + offset;
    const projectileOffsets = offset ? [-1, 0, 1] : [0];

    projectileOffsets.forEach((spacing) => {
      // Side volleys share a heading and differ only in their perpendicular start position.
      const perpendicular = angle + Math.PI / 2;
      const lateralOffset = spacing * this.config.broadsideProjectileSpacing;
      const x =
        ship.x +
        Math.cos(angle) * (shipCollisionRadius + 2) +
        Math.cos(perpendicular) * lateralOffset;
      const y =
        ship.y +
        Math.sin(angle) * (shipCollisionRadius + 2) +
        Math.sin(perpendicular) * lateralOffset;
      const trail = new Graphics();
      const view = new Sprite(this.textures.cannonBall);
      view.anchor.set(0.5);
      view.scale.set(1.15);
      view.position.set(x, y);
      this.stage.addChild(trail, view);

      this.bullets.push({
        x,
        y,
        vx: Math.cos(angle) * this.config.projectileSpeed,
        vy: Math.sin(angle) * this.config.projectileSpeed,
        fromPlayer: ship.kind === 'player',
        life: this.config.projectileLife,
        view,
        trail,
        trailPoints: [{ x, y }],
      });
    });
  }

  private updateBullets(dt: number) {
    this.bullets = this.bullets.filter((bullet) => {
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.view.position.set(bullet.x, bullet.y);
      this.updateProjectileTrail(bullet);

      const targets = bullet.fromPlayer ? this.enemies : [this.player];
      const hit = targets.find((target) => target.alive && distance(bullet, target) < shipCollisionRadius);

      if (hit) {
        this.createImpactParticles(bullet.x, bullet.y);
        playSound(this.random() < 0.5 ? 'ship_wood_hit_1' : 'ship_wood_hit_2');
        this.damage(
          hit,
          bullet.fromPlayer ? this.config.projectileDamage : this.config.enemyProjectileDamage,
        );
      }

      const removed =
        bullet.life <= 0 ||
        bullet.x < 0 ||
        bullet.x > W ||
        bullet.y < 0 ||
        bullet.y > H ||
        islands.some((obstacle) => distance(bullet, obstacle) < obstacle.r) ||
        !!hit;

      if (removed) {
        if (!hit) {
          playSound(
            this.random() < 0.5 ? 'cannonball_water_hit_1' : 'cannonball_water_hit_2',
          );
        }
        bullet.view.destroy();
        bullet.trail.destroy();
        return false;
      }

      return true;
    });
  }

  private damage(ship: Ship, amount: number) {
    if (!ship.alive) return;

    const previousHealthRatio = ship.health / this.config.playerHealth;
    ship.health -= amount;
    this.drawHealth(ship);
    this.throwCrew(ship, ship.health <= 0 ? 3 : 1);
    this.updateFire(ship);

    if (
      ship.kind === 'player' &&
      previousHealthRatio >= 0.25 &&
      ship.health / this.config.playerHealth < 0.25
    ) {
      playSound('health_low');
    }

    if (ship.health <= 0) this.kill(ship, ship.kind !== 'player');
  }

  private kill(ship: Ship, scores: boolean) {
    if (!ship.alive) return;

    ship.alive = false;
    this.playExplosion(ship.x, ship.y);
    playSound(this.random() < 0.5 ? 'ship_explosion_1' : 'ship_explosion_2');
    if (ship.kind === 'player') {
      setLoopingSound('ship_sailing_loop', false);
      ship.sprite.destroy({ children: true });
      ship.healthBar.destroy({ children: true });
    } else {
      playSound('ship_sinking');
      // Swap to the wreck art and retain it briefly as a fading, non-interactive visual.
      ship.hull.texture = this.textures.defeated[ship.kind];
      ship.healthFill.visible = false;
      ship.healthBar.visible = false;
      ship.fires.forEach((fire) => fire.destroy());
      ship.fires = [];
      ship.sprite.alpha = 1;
      this.sinkingShips.push({ ship, age: 0 });
    }

    if (scores) {
      this.score++;
      playSound('score_point');
    }
    if (ship.kind === 'player') this.finishCountdown = 0.45;
  }

  private renderShip(ship: Ship) {
    ship.sprite.position.set(ship.x, ship.y);
    ship.sprite.rotation = ship.angle;
    // The bar is a sibling of the rotating hull, so its vertical offset stays on the
    // screen's Y axis instead of rotating with the ship's heading.
    this.positionHealthBar(ship);
    this.animateFire(ship);
  }

  private updateSinkingShips(dt: number) {
    this.sinkingShips = this.sinkingShips.filter((wreck) => {
      wreck.age += dt;
      wreck.ship.sprite.alpha = Math.max(0, 1 - wreck.age / 3);

      if (wreck.age >= 3) {
        wreck.ship.sprite.destroy({ children: true });
        wreck.ship.healthBar.destroy({ children: true });
        this.enemies = this.enemies.filter((enemy) => enemy !== wreck.ship);
        return false;
      }

      return true;
    });
  }

  private updateProjectileTrail(bullet: Projectile) {
    // Keep a short history of positions so the cannonball leaves a tapered-looking streak.
    bullet.trailPoints.push({ x: bullet.x, y: bullet.y });
    if (bullet.trailPoints.length > 8) bullet.trailPoints.shift();

    if (bullet.trailPoints.length < 2) return;

    bullet.trail.clear();
    const color = bullet.fromPlayer ? '#ffe28b' : '#ff8b73';
    for (let index = 1; index < bullet.trailPoints.length; index += 1) {
      const progress = index / (bullet.trailPoints.length - 1);
      const from = bullet.trailPoints[index - 1];
      const to = bullet.trailPoints[index];
      bullet.trail
        .moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({
          color,
          width: 0.5 + progress * 3.5,
          alpha: 0.03 + progress * 0.62,
        });
    }
  }

  private throwCrew(ship: Ship, count: number) {
    for (let index = 0; index < count; index += 1) {
      const texture = this.textures.crew[Math.floor(this.random() * this.textures.crew.length)];
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(0.9);
      sprite.position.set(ship.x, ship.y - 8);
      this.stage.addChild(sprite);

      const angle = this.random() * Math.PI * 2;
      const speed = 55 + this.random() * 85;
      this.crewMembers.push({
        sprite,
        x: ship.x,
        y: ship.y,
        height: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        verticalSpeed: 95 + this.random() * 65,
        rotationSpeed: (this.random() - 0.5) * 12,
        age: 0,
      });
    }
  }

  private updateCrew(dt: number) {
    this.crewMembers = this.crewMembers.filter((crew) => {
      crew.age += dt;
      crew.x += crew.vx * dt;
      crew.y += crew.vy * dt;
      // `height` is a small top-down pseudo-height: it creates an arc while x/y carry the sailor
      // away from the ship. On landing we replace the sprite with a short water ripple.
      crew.verticalSpeed -= 250 * dt;
      crew.height = Math.max(0, crew.height + crew.verticalSpeed * dt);
      crew.sprite.position.set(crew.x, crew.y - crew.height);
      crew.sprite.rotation += crew.rotationSpeed * dt;
      crew.sprite.alpha = Math.max(0, 1 - crew.age / 1.4);

      if (crew.height === 0 && crew.age > 0.25) {
        this.createSplash(crew.x, crew.y);
        crew.sprite.destroy();
        return false;
      }

      return true;
    });
  }

  private createSplash(x: number, y: number) {
    const graphic = new Graphics()
      .circle(0, 0, 8)
      .stroke({ color: '#d6f5ff', width: 2, alpha: 0.9 });
    graphic.position.set(x, y);
    this.stage.addChild(graphic);
    this.splashEffects.push({ graphic, age: 0 });
  }

  private updateSplashEffects(dt: number) {
    this.splashEffects = this.splashEffects.filter((effect) => {
      effect.age += dt;
      const progress = effect.age / 0.4;
      effect.graphic.scale.set(0.5 + progress * 1.8);
      effect.graphic.alpha = Math.max(0, 1 - progress);

      if (progress >= 1) {
        effect.graphic.destroy();
        return false;
      }

      return true;
    });
  }

  private createImpactParticles(x: number, y: number) {
    const colors = ['#fff0b0', '#ffc45e', '#e77b37', '#f6dfc0'];

    // A small burst of bright flecks makes each cannon hit readable without obscuring the ship.
    for (let index = 0; index < 8; index += 1) {
      const angle = this.random() * Math.PI * 2;
      const speed = 45 + this.random() * 105;
      const graphic = new Graphics()
        .circle(0, 0, 1.5 + this.random() * 1.5)
        .fill(colors[Math.floor(this.random() * colors.length)]);
      graphic.position.set(x, y);
      this.stage.addChild(graphic);
      this.impactParticles.push({
        graphic,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 18,
        age: 0,
        duration: 0.28 + this.random() * 0.18,
      });
    }
  }

  private updateImpactParticles(dt: number) {
    this.impactParticles = this.impactParticles.filter((particle) => {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 95 * dt;

      const progress = particle.age / particle.duration;
      particle.graphic.position.set(particle.x, particle.y);
      particle.graphic.scale.set(Math.max(0.15, 1 - progress * 0.65));
      particle.graphic.alpha = Math.max(0, 1 - progress);

      if (progress >= 1) {
        particle.graphic.destroy();
        return false;
      }

      return true;
    });
  }

  private updateFire(ship: Ship) {
    const maxHealth = ship.kind === 'player' ? this.config.playerHealth : this.config.enemyHealth;
    const healthRatio = Math.max(0, ship.health / maxHealth);
    // Add another flame as health crosses 75%, 50%, and 25% to make damage easy to read.
    const fireCount = healthRatio <= 0.25 ? 3 : healthRatio <= 0.5 ? 2 : healthRatio <= 0.75 ? 1 : 0;
    const firePositions = [
      { x: -16, y: -8 },
      { x: 15, y: 7 },
      { x: 0, y: 18 },
    ];

    while (ship.fires.length < fireCount) {
      const index = ship.fires.length;
      const fire = new Sprite(this.textures.fire[0]);
      fire.anchor.set(0.5, 0.85);
      fire.position.set(firePositions[index].x, firePositions[index].y);
      ship.sprite.addChild(fire);
      ship.fires.push(fire);
    }
  }

  private animateFire(ship: Ship) {
    ship.fires.forEach((fire, index) => {
      const frameIndex = Math.floor(this.elapsed * 8 + index * 1.7) % this.textures.fire.length;
      const texture = this.textures.fire[frameIndex];
      fire.texture = texture;
      fire.scale.set(12.5 / texture.width);
    });
  }

  private playExplosion(x: number, y: number) {
    const sprite = new Sprite(this.textures.explosions[0]);
    sprite.anchor.set(0.5);
    sprite.scale.set(1.2);
    sprite.position.set(x, y);
    this.stage.addChild(sprite);
    this.animatedEffects.push({
      sprite,
      frames: this.textures.explosions,
      age: 0,
      frameDuration: 0.09,
      duration: this.textures.explosions.length * 0.09,
    });
  }

  private updateAnimatedEffects(dt: number) {
    this.animatedEffects = this.animatedEffects.filter((effect) => {
      effect.age += dt;
      const frameIndex = Math.min(
        effect.frames.length - 1,
        Math.floor(effect.age / effect.frameDuration),
      );
      effect.sprite.texture = effect.frames[frameIndex];
      effect.sprite.alpha = Math.max(0, 1 - effect.age / effect.duration);

      if (effect.age >= effect.duration) {
        effect.sprite.destroy();
        return false;
      }

      return true;
    });
  }

  private publish(force = false) {
    if (!force && this.hudPublishClock < 0.1) return;
    this.hudPublishClock = 0;
    this.onHud({
      health: Math.max(0, this.player.health),
      score: this.score,
      remaining: Math.max(0, Math.ceil(this.config.sessionSeconds - this.elapsed)),
      enemies: this.enemies.filter((ship) => ship.alive).length,
      paused: this.paused,
    });
  }

  private finish(reason: EndReason) {
    if (!this.running) return;
    this.running = false;
    this.publish(true);
    this.onEnd(reason, this.score, Math.round(this.elapsed));
  }
}
