// Phaser input Adapter: maps keyboard/pointer events to Runner World intents.
export class RunnerInput {
  constructor(scene, actions) {
    this.scene = scene;
    this.actions = actions;
    this.keys = null;
  }

  bind() {
    this.keys = this.scene.input.keyboard.addKeys('SPACE,UP,DOWN,SHIFT,W,S,R');
    for (const key of ['SPACE', 'UP', 'W']) {
      this.scene.input.keyboard.on(`keydown-${key}`, () => this.actions.startJump());
      this.scene.input.keyboard.on(`keyup-${key}`, () => this.actions.stopJump());
    }
    for (const key of ['DOWN', 'SHIFT', 'S']) {
      this.scene.input.keyboard.on(`keydown-${key}`, () => this.actions.startSlide());
    }
    this.scene.input.on('pointerdown', () => this.actions.startJump());
    this.scene.input.on('pointerup', () => this.actions.stopJump());
    this.scene.input.on('pointerupoutside', () => this.actions.stopJump());
  }

  restartPressed(PhaserInputKeyboard) {
    return PhaserInputKeyboard.JustDown(this.keys.R);
  }
}
