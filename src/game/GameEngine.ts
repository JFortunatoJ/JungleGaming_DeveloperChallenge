import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import {
  defaultControls,
  type Controls,
  type EnemyKind,
  type EndReason,
  type GameConfig,
  type GameSnapshot,
} from './types';

type Ship = {
  id: string;
  kind: 'player' | EnemyKind;
  x: number;
  y: number;
  angle: number;
  health: number;
  sprite: Container;
  shotAt: number;
  alive: boolean;
};

type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fromPlayer: boolean;
  life: number;
  view: Graphics;
};

export type ShipTextures = Record<Ship['kind'], Texture>;

const W = 960,
  H = 540,
  island = { x: 480, y: 270, r: 72 };

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** The engine owns the continuous state. React only receives a small HUD snapshot a few times per second. */
export class GameEngine {
  readonly stage = new Container();
  private controls: Controls = defaultControls();
  private player!: Ship;
  private enemies: Ship[] = [];
  private bullets: Projectile[] = [];
  private elapsed = 0;
  private spawnClock = 0;
  private running = true;
  private paused = false;
  private previous = 0;
  private score = 0;

  constructor(
    private readonly config: GameConfig,
    private readonly onHud: (s: GameSnapshot) => void,
    private readonly onEnd: (reason: EndReason, score: number, duration: number) => void,
    private readonly textures: ShipTextures,
  ) {
    this.drawArena();
    this.createPlayer();
  }

  setControl(name: keyof Controls, value: boolean) {
    this.controls[name] = value;
  }

  setPaused(value: boolean) {
    this.paused = value;
    this.previous = performance.now();
    this.publish();
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

  destroy() {
    this.stage.destroy({ children: true });
  }

  private drawArena() {
    const water = new Graphics().rect(0, 0, W, H).fill('#0b6690');
    const land = new Graphics()
      .circle(island.x, island.y, island.r)
      .fill('#cfad62')
      .stroke({ color: '#6e5532', width: 8 });

    this.stage.addChild(water, land);
  }

  private createPlayer() {
    this.player = this.spawnShip('player', 150, 270);
  }

  private shipView(kind: Ship['kind']) {
    const wrap = new Container();
    // Textures are loaded by GameCanvas before the engine is constructed. Passing the ready
    // Texture avoids an implicit cache lookup and ensures a failed image cannot crash a match.
    const image = new Sprite(this.textures[kind]);
    image.anchor.set(0.5);
    image.scale.set(0.25);
    wrap.addChild(image);

    const bar = new Graphics();
    bar.y = -42;
    wrap.addChild(bar);

    (wrap as Container & { bar?: Graphics }).bar = bar;
    return wrap;
  }

  private spawnShip(kind: Ship['kind'], x: number, y: number): Ship {
    const sprite = this.shipView(kind);
    sprite.position.set(x, y);
    this.stage.addChild(sprite);

    const ship = {
      id: crypto.randomUUID(),
      kind,
      x,
      y,
      angle: kind === 'player' ? 0 : Math.PI,
      health: kind === 'player' ? this.config.playerHealth : this.config.enemyHealth,
      sprite,
      shotAt: 0,
      alive: true,
    };

    this.drawHealth(ship);
    return ship;
  }

  private drawHealth(ship: Ship) {
    const bar = (ship.sprite as Container & { bar?: Graphics }).bar!;
    const max = ship.kind === 'player' ? this.config.playerHealth : this.config.enemyHealth;

    bar
      .clear()
      .rect(-22, 0, 44, 5)
      .fill('#311')
      .rect(-22, 0, 44 * (ship.health / max), 5)
      .fill(ship.health / max > 0.4 ? '#60dc63' : '#ef5555');
  }

  private update(dt: number) {
    this.elapsed += dt;
    this.spawnClock += dt;

    if (this.elapsed >= this.config.sessionSeconds) return this.finish('time');

    this.movePlayer(dt);

    if (this.spawnClock >= this.config.spawnSeconds) {
      this.spawnClock = 0;
      this.spawnEnemy();
    }

    this.enemies.forEach((enemy) => this.updateEnemy(enemy, dt));
    this.updateBullets(dt);
    this.publish();
  }

  private movePlayer(dt: number) {
    const p = this.player;

    if (this.controls.left) p.angle -= this.config.turnSpeed * dt;
    if (this.controls.right) p.angle += this.config.turnSpeed * dt;

    if (this.controls.forward) {
      this.tryMove(
        p,
        Math.cos(p.angle) * this.config.playerSpeed * dt,
        Math.sin(p.angle) * this.config.playerSpeed * dt,
      );
    }

    if (this.controls.front) this.fire(p, 0);
    if (this.controls.port) this.fire(p, -Math.PI / 2);
    if (this.controls.starboard) this.fire(p, Math.PI / 2);

    this.renderShip(p);
  }

  private spawnEnemy() {
    const candidates = [
      [850, 90],
      [840, 450],
      [110, 90],
      [100, 450],
    ];

    const point = candidates.find(([x, y]) => distance({ x, y }, this.player) > 360)!;
    this.enemies.push(
      this.spawnShip(this.enemies.length % 2 ? 'shooter' : 'chaser', point[0], point[1]),
    );
  }

  private updateEnemy(enemy: Ship, dt: number) {
    if (!enemy.alive) return;

    const desired = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    enemy.angle +=
      Math.atan2(Math.sin(desired - enemy.angle), Math.cos(desired - enemy.angle)) *
      Math.min(1, 2 * dt);

    const d = distance(enemy, this.player);

    if (d > (enemy.kind === 'shooter' ? this.config.shooterRange : 34)) {
      this.tryMove(
        enemy,
        Math.cos(enemy.angle) * this.config.enemySpeed * dt,
        Math.sin(enemy.angle) * this.config.enemySpeed * dt,
      );
    }

    if (enemy.kind === 'shooter' && d <= this.config.shooterRange) this.fire(enemy, 0);
    if (enemy.kind === 'chaser' && d < 32) {
      this.damage(this.player, 18);
      this.kill(enemy, false);
    }

    this.renderShip(enemy);
  }

  private tryMove(ship: Ship, dx: number, dy: number) {
    const x = clamp(ship.x + dx, 22, W - 22);
    const y = clamp(ship.y + dy, 22, H - 22);

    if (distance({ x, y }, island) > island.r + 24) {
      ship.x = x;
      ship.y = y;
    }
  }

  private fire(ship: Ship, offset: number) {
    const cooldown = offset ? this.config.broadsideCooldown : this.config.frontCooldown;
    if (this.elapsed - ship.shotAt < cooldown) return;

    ship.shotAt = this.elapsed;

    const angles = offset ? [-0.12, 0, 0.12].map((angle) => ship.angle + offset + angle) : [ship.angle];

    angles.forEach((angle) => {
      const view = new Graphics()
        .circle(0, 0, 5)
        .fill(ship.kind === 'player' ? '#ffe06c' : '#ff654f');

      const x = ship.x + Math.cos(angle) * 26;
      const y = ship.y + Math.sin(angle) * 26;
      view.position.set(x, y);
      this.stage.addChild(view);

      this.bullets.push({
        x,
        y,
        vx: Math.cos(angle) * this.config.projectileSpeed,
        vy: Math.sin(angle) * this.config.projectileSpeed,
        fromPlayer: ship.kind === 'player',
        life: this.config.projectileLife,
        view,
      });
    });
  }

  private updateBullets(dt: number) {
    this.bullets = this.bullets.filter((bullet) => {
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.view.position.set(bullet.x, bullet.y);

      const targets = bullet.fromPlayer ? this.enemies : [this.player];
      const hit = targets.find((target) => target.alive && distance(bullet, target) < 25);

      if (hit) this.damage(hit, this.config.projectileDamage);

      const removed =
        bullet.life <= 0 ||
        bullet.x < 0 ||
        bullet.x > W ||
        bullet.y < 0 ||
        bullet.y > H ||
        distance(bullet, island) < island.r ||
        !!hit;

      if (removed) {
        bullet.view.destroy();
        return false;
      }

      return true;
    });
  }

  private damage(ship: Ship, amount: number) {
    ship.health -= amount;
    this.drawHealth(ship);

    if (ship.health <= 0) this.kill(ship, ship.kind !== 'player');
  }

  private kill(ship: Ship, scores: boolean) {
    if (!ship.alive) return;

    ship.alive = false;
    const boom = new Graphics().circle(ship.x, ship.y, 30).fill('#ff9d36');
    this.stage.addChild(boom);
    setTimeout(() => boom.destroy(), 250);
    ship.sprite.destroy();

    if (scores) this.score++;
    if (ship.kind === 'player') this.finish('destroyed');
  }

  private renderShip(ship: Ship) {
    ship.sprite.position.set(ship.x, ship.y);
    ship.sprite.rotation = ship.angle;
    ship.sprite.alpha =
      ship.kind === 'player' ? 0.45 + 0.55 * (ship.health / this.config.playerHealth) : 1;
  }

  private publish() {
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
    this.onEnd(reason, this.score, Math.round(this.elapsed));
  }
}

