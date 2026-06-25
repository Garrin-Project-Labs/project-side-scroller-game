// Phaser Adapter for Runner World sprites. Runner World objects stay plain data;
// this Module owns the Phaser image lifecycle at the rendering seam.
export class RunnerSpriteAdapter {
  constructor(scene) {
    this.scene = scene;
    this.sprites = new Map();
  }

  addObstacle(obstacle) {
    if (!obstacle.texture) return;
    const sprite = this.scene.add.image(obstacle.x, obstacle.y, obstacle.texture)
      .setOrigin(0, 0)
      .setDisplaySize(obstacle.w, obstacle.h)
      .setDepth(obstacle.depth);
    this.sprites.set(obstacle.id, sprite);
  }

  addPickup(pickup) {
    const sprite = this.scene.add.image(pickup.x, pickup.y, 'battery')
      .setOrigin(0, 0)
      .setDisplaySize(pickup.w, pickup.h)
      .setDepth(5);
    this.sprites.set(pickup.id, sprite);
  }

  updateObstacle(obstacle) {
    this.sprites.get(obstacle.id)?.setPosition(obstacle.x, obstacle.y);
  }

  updatePickup(pickup) {
    this.sprites.get(pickup.id)?.setPosition(pickup.x, pickup.y + Math.sin(pickup.bob) * 8);
  }

  destroyObject(object) {
    const sprite = this.sprites.get(object.id);
    if (!sprite) return;
    sprite.destroy();
    this.sprites.delete(object.id);
  }

  destroyAll() {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
  }
}
