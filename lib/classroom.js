import { addNeuron, getWeight, makeNetwork, setWeight, trainBatch, weightIds } from './network.js';

export class Classroom {
  constructor(training, observation, random = Math.random) {
    this.training = training.map(s => ({ digit: s.digit, pixels: s.pixels.map(v => v / 255) }));
    this.observation = observation;
    this.pixelActivity = Array(36).fill(0);
    observation.forEach(sample => sample.pixels.forEach((value, index) => { this.pixelActivity[index] += Number(value > 0); }));
    this.random = random;
    this.reset([3]);
  }

  reset(hidden) {
    this.network = makeNetwork(hidden, this.random);
    this.students = new Map();
    this.owners = new Map();
    this.finalized = false;
    this.forceAutomatic = false;
    this.trainingOn = false;
    this.fixedSampleId = null;
    this.learningRate = 0.3;
    this.weightVersion = (this.weightVersion || 0) + 1;
    this.controlVersion = (this.controlVersion || 0) + 1;
    this.epoch = 0;
    this.lastLoss = null;
    this.cursor = 0;
    this.lastGrowthLayer = -1;
  }

  join(studentId) {
    if (this.students.has(studentId)) return this.students.get(studentId);
    let available = this.availableWeight();
    if (!available && !this.finalized) {
      const candidates = this.network.sizes.slice(1, -1).map((size, index) => ({ size, index })).filter(x => x.size < 5);
      if (candidates.length) {
        const choice = candidates.find(x => x.index > this.lastGrowthLayer) || candidates[0];
        addNeuron(this.network, choice.index, this.random);
        this.lastGrowthLayer = choice.index;
        this.weightVersion++;
        this.controlVersion++;
        available = this.availableWeight();
      }
    }
    const student = { id: studentId, weightId: available || null, mode: 'manual', joinedAt: Date.now() };
    this.students.set(studentId, student);
    if (available) this.owners.set(available, studentId);
    this.controlVersion++;
    return student;
  }

  availableWeight() {
    const candidates = weightIds(this.network).filter(id => !this.owners.has(id)).map(id => {
      const [layer, , input] = id.split(':').map(Number);
      return { id, activity: layer > 0 ? this.observation.length : this.pixelActivity[input] };
    }).filter(candidate => candidate.activity > 0);
    candidates.sort((a, b) => b.activity - a.activity);
    return candidates[0]?.id || null;
  }

  student(studentId) {
    const student = this.students.get(studentId);
    if (!student) throw new UserError(401, '参加情報がありません。画面を再読み込みしてください');
    return student;
  }

  setMode(studentId, mode) {
    const student = this.student(studentId);
    if (this.forceAutomatic) throw new UserError(409, '教員が自動モードを固定しています');
    if (!student.weightId) throw new UserError(409, '担当重みがありません');
    if (!['manual', 'automatic'].includes(mode)) throw new UserError(400, 'モードが不正です');
    student.mode = mode;
    this.controlVersion++;
    return student;
  }

  changeWeight(studentId, value) {
    const student = this.student(studentId);
    if (this.forceAutomatic || student.mode !== 'manual') throw new UserError(409, '手動操作が許可されていません');
    if (!student.weightId) throw new UserError(409, '担当重みがありません');
    if (typeof value !== 'number' || !Number.isFinite(value) || value < -5 || value > 5) throw new UserError(400, '重みは-5から5です');
    setWeight(this.network, student.weightId, value);
    this.weightVersion++;
    return { value: getWeight(this.network, student.weightId), weightVersion: this.weightVersion };
  }

  configure({ hidden }) {
    if (this.students.size) throw new UserError(409, '参加者がいる間は構成を変更できません。授業をリセットしてください');
    try { this.reset(hidden); } catch (error) { throw new UserError(400, error.message); }
    return this.teacherState();
  }

  restart(hidden) {
    try { this.reset(hidden); } catch (error) { throw new UserError(400, error.message); }
    return this.teacherState();
  }

  teacherAction(action, payload = {}) {
    switch (action) {
      case 'finalize': this.finalized = true; break;
      case 'force-on':
        this.forceAutomatic = true;
        for (const student of this.students.values()) student.mode = 'automatic';
        break;
      case 'force-off': this.forceAutomatic = false; break;
      case 'training-on': this.trainingOn = true; break;
      case 'training-off': this.trainingOn = false; break;
      case 'fix-sample':
        if (!this.observation.some(s => s.id === payload.id)) throw new UserError(400, 'データIDが存在しません');
        this.fixedSampleId = payload.id;
        break;
      case 'unfix-sample': this.fixedSampleId = null; break;
      default: throw new UserError(400, '操作が不正です');
    }
    this.controlVersion++;
    return this.teacherState();
  }

  tick() {
    if (!this.trainingOn || !this.training.length) return;
    const batch = [];
    for (let i = 0; i < 32; i++) {
      batch.push(this.training[this.cursor]);
      this.cursor = (this.cursor + 1) % this.training.length;
    }
    const canUpdate = id => {
      const ownerId = this.owners.get(id);
      return !ownerId || this.students.get(ownerId)?.mode === 'automatic';
    };
    this.lastLoss = trainBatch(this.network, batch, this.learningRate, canUpdate);
    this.epoch++;
    this.weightVersion++;
  }

  controls(studentId) {
    const student = this.student(studentId);
    return {
      student: { weightId: student.weightId, mode: student.mode },
      forceAutomatic: this.forceAutomatic,
      trainingOn: this.trainingOn,
      fixedSampleId: this.fixedSampleId,
      finalized: this.finalized,
      controlVersion: this.controlVersion,
      weightVersion: this.weightVersion,
      sizes: this.network.sizes
    };
  }

  weights() {
    return { network: this.network, weightVersion: this.weightVersion };
  }

  teacherState() {
    return {
      ...this.weights(),
      forceAutomatic: this.forceAutomatic,
      trainingOn: this.trainingOn,
      finalized: this.finalized,
      fixedSampleId: this.fixedSampleId,
      learningRate: this.learningRate,
      controlVersion: this.controlVersion,
      epoch: this.epoch,
      lastLoss: this.lastLoss,
      trainingCount: this.training.length,
      observationCount: this.observation.length,
      students: [...this.students.values()].map(s => ({ ...s })),
      assignedCount: this.owners.size
    };
  }
}

export class UserError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
