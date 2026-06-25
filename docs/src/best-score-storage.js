export class BestScoreStorage {
  constructor(storage, key = 'robotBatteryRunnerBest') {
    this.storage = storage;
    this.key = key;
  }

  load() {
    return Number(this.storage.getItem(this.key) || 0);
  }

  save(score) {
    this.storage.setItem(this.key, String(score));
  }
}
