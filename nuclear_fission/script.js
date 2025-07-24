const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let particles = [];
let explosionWaves = [];
let falloutParticles = [];
let isRunning = false;
let isPaused = false;
let generationCount = 0;
let lastReactionTime = 0;
let reactionRate = 0;
let frameCount = 0;
let lastUpdate = 0;
let maxVisualParticles = 2000;
let mergeThreshold = 1000;
let currentPreset = "custom";
let heatLevel = 0;
let explosionIntensity = 0;
let falloutActive = false;
let effectDuration = 0.5; // 기본 5초
let heatEffectActive = false; // 열기 효과 중복 방지

let stats = {
  fissions: 0,
  activeNeutrons: 0,
  totalNeutrons: 0,
  energy: 0,
  startTime: 0,
  temperature: 0,
};

// DOM 요소 생성
function createEffectOverlays() {
  // 열기 효과 오버레이
  const heatOverlay = document.createElement("div");
  heatOverlay.className = "heat-overlay";
  heatOverlay.id = "heatOverlay";
  document.body.appendChild(heatOverlay);

  // 낙진 효과 오버레이
  const falloutOverlay = document.createElement("div");
  falloutOverlay.className = "fallout-overlay";
  falloutOverlay.id = "falloutOverlay";
  document.body.appendChild(falloutOverlay);
}

// 국가별 핵무기 데이터
const nuclearPresets = {
  custom: {
    name: "커스텀 설정",
    info: "사용자 정의 설정",
    uranium: 500,
    neutron: 5,
    critical: 2,
  },
  "north-korea": {
    name: "북한 핵무기",
    info: "추정 20-30kt, 플루토늄/우라늄 혼합형",
    uranium: 800,
    neutron: 8,
    critical: 3,
  },
  usa: {
    name: "미국 W88 탄두",
    info: "475kt, 2단계 열핵탄두",
    uranium: 2000,
    neutron: 25,
    critical: 8,
  },
  china: {
    name: "중국 DF-41 탄두",
    info: "200-300kt, MIRV 탄두",
    uranium: 1500,
    neutron: 20,
    critical: 6,
  },
  russia: {
    name: "러시아 사탄-2",
    info: "750kt, 최신형 ICBM 탄두",
    uranium: 2500,
    neutron: 30,
    critical: 10,
  },
  iran: {
    name: "이란 개발 시나리오",
    info: "추정 20kt, 우라늄 농축형 (*가상)",
    uranium: 700,
    neutron: 7,
    critical: 3,
  },
};

// 숫자 포맷팅 함수
function formatCount(num) {
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + "G";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

// 입자 기호 매핑
const particleSymbols = {
  uranium: "U",
  neutron: "n",
  fragment: "F",
  energy: "E",
};

// 폭발파 클래스
class ExplosionWave {
  constructor(x, y, intensity = 1) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = 200 * intensity;
    this.intensity = intensity;
    this.life = 1.0;
    this.speed = 8 * intensity;
    this.color = `rgba(255, ${Math.floor(150 - intensity * 50)}, 0, ${this.life * 0.6})`;
  }

  update() {
    this.radius += this.speed;
    this.life -= 0.02;
    this.speed *= 0.98;
    this.color = `rgba(255, ${Math.floor(150 - this.intensity * 50)}, 0, ${this.life * 0.6})`;

    return this.life > 0 && this.radius < this.maxRadius;
  }

  draw() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3 * this.intensity;
    ctx.stroke();

    // 내부 번개 효과
    if (this.life > 0.7) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 100, ${this.life * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// 낙진 입자 클래스
class FalloutParticle {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = -10;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = Math.random() * 2 + 1;
    this.size = Math.random() * 3 + 1;
    this.life = 1.0;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.1;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    this.life -= 0.002;
    this.vy += 0.01; // 중력

    if (this.x < 0 || this.x > canvas.width) {
      this.vx *= -0.8;
    }

    return this.life > 0 && this.y < canvas.height + 50;
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.life * 0.6;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.fillStyle = `rgba(${100 + Math.random() * 50}, ${80 + Math.random() * 40}, 60, 0.8)`;
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, type, vx = 0, vy = 0, count = 1, intensity = 1, maxLifeTime = null) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.vx = vx;
    this.vy = vy;
    this.count = count;
    this.intensity = intensity;
    this.size = this.getSize();
    this.color = this.getColor();
    this.life = 1.0;
    this.created = Date.now();
    this.maxLifeTime = maxLifeTime; // 최대 수명 (밀리초)
    this.hasCollided = false;
    this.glowPhase = Math.random() * Math.PI * 2;
    this.trailPoints = [];
  }

  getSize() {
    const baseSize =
      {
        uranium: 15, // 1.6배 증가
        neutron: 10, // 1.6배 증가
        fragment: 12, // 1.6배 증가
        energy: 10, // 1.6배 증가
      }[this.type] || 10;

    // 최소 크기 보장 - count가 적어도 기본 크기는 유지
    const minSize = baseSize; // 기본 크기의 80%를 최소값으로 설정
    const sizeMultiplier = Math.max(1, Math.min(3, 1 + Math.log10(this.count) * 0.3));
    const calculatedSize = baseSize * sizeMultiplier * this.intensity;

    return Math.max(minSize, calculatedSize);
  }

  getColor() {
    const colors = {
      uranium: "#ff4500", // 더 진한 주황/빨강
      neutron: "#00bfff", // 밝은 하늘색
      fragment: "#ffd700", // 금색
      energy: "#ff1493", // 진한 핑크
    };
    return colors[this.type] || "#ffffff";
  }

  update() {
    // 에너지 입자 수명 관리
    if (this.type === "energy" && this.maxLifeTime) {
      const elapsed = Date.now() - this.created;
      if (elapsed >= this.maxLifeTime) {
        this.life = 0; // 즉시 제거
        return;
      }
      // 수명이 다할수록 life 감소
      const lifeRatio = 1 - elapsed / this.maxLifeTime;
      this.life = Math.min(this.life, lifeRatio);
    }

    // 궤적 저장
    this.trailPoints.push({ x: this.x, y: this.y, life: 1.0 });
    if (this.trailPoints.length > 8) {
      this.trailPoints.shift();
    }

    // 궤적 생명 감소
    this.trailPoints.forEach((point) => (point.life -= 0.15));

    this.x += this.vx * this.intensity;
    this.y += this.vy * this.intensity;
    this.glowPhase += 0.1;

    if (this.type === "energy") {
      this.life -= 0.003; // 기본 감소량 줄임 (0.008 → 0.003)
      this.size *= 0.999;

      // 에너지 입자가 폭발할 때 화면 효과 (더욱 제한적으로)
      if (this.count > 100 && Math.random() < 0.005 && !heatEffectActive) {
        explosionWaves.push(new ExplosionWave(this.x, this.y, this.intensity));
        triggerExplosionEffect(this.count / 300); // 더욱 강도 줄임
      }
    }

    // 경계 충돌 처리 (더 격렬하게)
    if (this.x < this.size || this.x > canvas.width - this.size) {
      this.vx *= -0.9;
      this.x = Math.max(this.size, Math.min(canvas.width - this.size, this.x));

      // 벽 충돌 시 스파크 효과 (에너지 입자만)
      if (this.type === "energy" && Math.random() < 0.3) {
        for (let i = 0; i < 2; i++) {
          particles.push(
            new Particle(
              this.x,
              this.y,
              "energy",
              (Math.random() - 0.5) * 4,
              (Math.random() - 0.5) * 4,
              1,
              0.5,
              effectDuration * 500 // 수명 절반으로 설정
            )
          );
        }
      }
    }
    if (this.y < this.size || this.y > canvas.height - this.size) {
      this.vy *= -0.9;
      this.y = Math.max(this.size, Math.min(canvas.height - this.size, this.y));

      if (this.type === "energy" && Math.random() < 0.3) {
        for (let i = 0; i < 2; i++) {
          particles.push(
            new Particle(
              this.x,
              this.y,
              "energy",
              (Math.random() - 0.5) * 4,
              (Math.random() - 0.5) * 4,
              1,
              0.5,
              effectDuration * 500 // 수명 절반으로 설정
            )
          );
        }
      }
    }

    // 속도 감소를 줄여서 중성자가 더 오래 움직이도록 수정
    this.vx *= 0.998; // 0.995에서 0.998로 변경 (덜 감속)
    this.vy *= 0.998; // 0.995에서 0.998로 변경 (덜 감속)
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.life;

    // 궤적 그리기
    if (this.trailPoints.length > 1 && this.type !== "uranium") {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.size * 0.3;
      ctx.beginPath();

      for (let i = 0; i < this.trailPoints.length - 1; i++) {
        const point = this.trailPoints[i];
        if (point.life > 0) {
          ctx.globalAlpha = point.life * this.life;
          if (i === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        }
      }
      ctx.stroke();
      ctx.globalAlpha = this.life;
    }

    const glowIntensity = 0.4 + 0.4 * Math.sin(this.glowPhase); // 글로우 강도 증가
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.size * glowIntensity * this.intensity * 2; // 글로우 더 강화

    // 메인 입자
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    // 더 강한 테두리 효과
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 하이라이트
    ctx.beginPath();
    ctx.arc(this.x - this.size / 3, this.y - this.size / 3, this.size / 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)"; // 하이라이트 약간 줄임
    ctx.fill();

    // 링 효과 (에너지 입자용)
    if (this.type === "energy" && this.intensity > 1) {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // 기호 배경 (가독성 향상)
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // 반투명 검정 배경
    ctx.fill();

    // 기호 텍스트 (아웃라인 추가)
    ctx.font = `bold ${Math.max(10, this.size * 0.7)}px Arial`; // 폰트 크기 증가
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const symbol = particleSymbols[this.type] || "?";

    // 텍스트 아웃라인
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeText(symbol, this.x, this.y - 2);

    // 메인 텍스트
    ctx.fillStyle = "white";
    ctx.fillText(symbol, this.x, this.y - 2);

    // 카운트 표시 (개선된 가독성)
    if (this.count > 1) {
      ctx.font = `bold ${Math.max(8, this.size * 0.5)}px Arial`;
      const countText = formatCount(this.count);

      // 카운트 배경
      const textWidth = ctx.measureText(countText).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(this.x - textWidth / 2 - 2, this.y + this.size, textWidth + 4, this.size * 0.6);

      // 카운트 텍스트 아웃라인
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 1;
      ctx.strokeText(countText, this.x, this.y + this.size + this.size * 0.3);

      // 카운트 메인 텍스트
      ctx.fillStyle = "#ffff00";
      ctx.fillText(countText, this.x, this.y + this.size + this.size * 0.3);
    }

    ctx.restore();
  }

  distanceTo(other) {
    return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
  }

  canMergeWith(other) {
    return (
      this.type === other.type &&
      this.distanceTo(other) < (this.size + other.size) * 1.5 &&
      !this.hasCollided &&
      !other.hasCollided
    );
  }
}

// 폭발 효과 트리거
function triggerExplosionEffect(intensity = 1) {
  explosionIntensity = Math.max(explosionIntensity, intensity);
  heatLevel = Math.min(100, heatLevel + intensity * 20);

  const duration = effectDuration * 1000;

  // 화면 진동 (설정된 지속시간 적용)
  if (intensity > 0.5) {
    const shakeDuration = Math.min(duration, 800); // 최대 800ms로 제한
    document.documentElement.style.setProperty("--shake-duration", `${shakeDuration}ms`);
    document.body.classList.add("explosion-shake");
    setTimeout(() => {
      document.body.classList.remove("explosion-shake");
    }, shakeDuration);
  }

  // 캔버스 폭발 효과
  if (intensity > 0.3) {
    canvas.classList.add("explosion-glow");
    setTimeout(() => {
      canvas.classList.remove("explosion-glow");
    }, Math.min(duration / 2, 500)); // 지속시간의 절반 또는 최대 500ms
  }

  // 열기 오버레이 (설정된 지속시간 적용, 중복 방지)
  const heatOverlay = document.getElementById("heatOverlay");
  if (heatOverlay && intensity > 0.2 && !heatEffectActive) {
    heatEffectActive = true;
    heatOverlay.classList.add("active");
    setTimeout(() => {
      heatOverlay.classList.remove("active");
      heatEffectActive = false;
    }, duration);
  }

  // 낙진 시작 (설정된 지속시간 적용)
  if (intensity > 0.8 && !falloutActive) {
    startFallout(duration);
  }
}

// 낙진 시스템 (지속시간 매개변수 추가)
function startFallout(duration = 10000) {
  falloutActive = true;
  const falloutOverlay = document.getElementById("falloutOverlay");
  if (falloutOverlay) {
    falloutOverlay.classList.add("active");
  }

  // 낙진 입자 생성
  for (let i = 0; i < 50; i++) {
    falloutParticles.push(new FalloutParticle());
  }

  // 설정된 지속시간 후 낙진 종료
  setTimeout(() => {
    falloutActive = false;
    if (falloutOverlay) {
      falloutOverlay.classList.remove("active");
    }
  }, duration);
}

function mergeNearbyParticles() {
  if (particles.length < mergeThreshold) return;

  const merged = [];
  const toRemove = new Set();

  for (let i = 0; i < particles.length; i++) {
    if (toRemove.has(i)) continue;

    const particle = particles[i];
    const mergeGroup = [particle];

    for (let j = i + 1; j < particles.length; j++) {
      if (toRemove.has(j)) continue;

      const other = particles[j];
      if (particle.canMergeWith(other)) {
        mergeGroup.push(other);
        toRemove.add(j);

        if (mergeGroup.length >= 6) break;
      }
    }

    if (mergeGroup.length > 1) {
      const totalCount = mergeGroup.reduce((sum, p) => sum + p.count, 0);
      const avgX = mergeGroup.reduce((sum, p) => sum + p.x, 0) / mergeGroup.length;
      const avgY = mergeGroup.reduce((sum, p) => sum + p.y, 0) / mergeGroup.length;
      const avgVx = mergeGroup.reduce((sum, p) => sum + p.vx, 0) / mergeGroup.length;
      const avgVy = mergeGroup.reduce((sum, p) => sum + p.vy, 0) / mergeGroup.length;

      merged.push(new Particle(avgX, avgY, particle.type, avgVx, avgVy, totalCount));
    } else {
      merged.push(particle);
    }
  }

  particles = merged;
}

function calculateDamageZones(energy) {
  const totalDestroy = Math.sqrt(energy / 15) * 0.8;
  const severeDestroy = Math.sqrt(energy / 15) * 1.8;
  const moderateDestroy = Math.sqrt(energy / 15) * 3.2;
  const radiationZone = Math.sqrt(energy / 15) * 8;

  const centerTemp = Math.min(100000000, energy * 666667);
  const cloudHeight = Math.min(50000, energy * 200 + 3000);

  document.getElementById("totalDestroy").textContent = totalDestroy.toFixed(1) + "km";
  document.getElementById("severeDestroy").textContent = severeDestroy.toFixed(1) + "km";
  document.getElementById("moderateDestroy").textContent = moderateDestroy.toFixed(1) + "km";
  document.getElementById("radiationZone").textContent = radiationZone.toFixed(1) + "km";
  document.getElementById("centerTemp").textContent = formatCount(centerTemp) + "°C";
  document.getElementById("cloudHeight").textContent = formatCount(cloudHeight) + "m";

  // 온도 업데이트
  stats.temperature = centerTemp;
}

function applyPreset(presetKey) {
  const preset = nuclearPresets[presetKey];
  if (!preset) return;

  currentPreset = presetKey;

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.remove("active");
    if (btn.dataset.preset === presetKey) {
      btn.classList.add("active");
    }
  });

  document.getElementById("uraniumCount").value = preset.uranium;
  document.getElementById("neutronCount").value = preset.neutron;

  const criticalMassSelect = document.getElementById("criticalMass");
  criticalMassSelect.value = preset.critical.toString();

  document.getElementById("presetInfo").textContent = `${preset.name}: ${preset.info}`;

  resetSimulation();
}

function initializeSimulation() {
  particles = [];
  explosionWaves = [];
  falloutParticles = [];
  generationCount = 0;
  lastReactionTime = Date.now();
  reactionRate = 0;
  heatLevel = 0;
  explosionIntensity = 0;
  falloutActive = false;
  heatEffectActive = false; // 초기화
  stats = {
    fissions: 0,
    activeNeutrons: 0,
    totalNeutrons: 0,
    energy: 0,
    startTime: Date.now(),
    temperature: 0,
  };

  const uraniumCount = parseInt(document.getElementById("uraniumCount").value);

  for (let i = 0; i < Math.min(uraniumCount, maxVisualParticles / 2); i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * Math.min(canvas.width, canvas.height) * 0.35;
    const x = canvas.width / 2 + Math.cos(angle) * radius;
    const y = canvas.height / 2 + Math.sin(angle) * radius;

    const particleCount = Math.ceil(uraniumCount / Math.min(uraniumCount, maxVisualParticles / 2));

    particles.push(
      new Particle(
        Math.max(30, Math.min(canvas.width - 30, x)),
        Math.max(30, Math.min(canvas.height - 30, y)),
        "uranium",
        0,
        0,
        particleCount
      )
    );
  }

  updateStats();
  calculateDamageZones(0);
  updateSimulationStatus("대기 중", "stable");
}

function createFission(uranium) {
  const criticalMultiplier = parseFloat(document.getElementById("criticalMass").value);

  stats.fissions += uranium.count;

  if (particles.length > maxVisualParticles) {
    mergeNearbyParticles();
  }

  // 더 격렬한 폭발 효과
  const explosionIntensity = Math.min(3, (criticalMultiplier * uranium.count) / 500);
  explosionWaves.push(new ExplosionWave(uranium.x, uranium.y, explosionIntensity));

  const angle1 = Math.random() * Math.PI * 2;
  const angle2 = angle1 + Math.PI + (Math.random() - 0.5) * 0.5;
  const speed = (2 + Math.random() * 4) * Math.sqrt(criticalMultiplier);

  particles.push(
    new Particle(
      uranium.x,
      uranium.y,
      "fragment",
      Math.cos(angle1) * speed,
      Math.sin(angle1) * speed,
      uranium.count,
      explosionIntensity
    )
  );

  particles.push(
    new Particle(
      uranium.x,
      uranium.y,
      "fragment",
      Math.cos(angle2) * speed,
      Math.sin(angle2) * speed,
      uranium.count,
      explosionIntensity
    )
  );

  const baseFissionNeutrons = 2 + Math.floor(Math.random() * 2);
  const neutronCount = Math.floor(baseFissionNeutrons * criticalMultiplier * uranium.count);

  const visualNeutronCount = Math.min(12, Math.ceil(neutronCount / 50) || 1);
  const neutronsPerParticle = Math.ceil(neutronCount / visualNeutronCount);

  for (let i = 0; i < visualNeutronCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (3 + Math.random() * 5) * Math.sqrt(criticalMultiplier);
    particles.push(
      new Particle(
        uranium.x + (Math.random() - 0.5) * 30,
        uranium.y + (Math.random() - 0.5) * 30,
        "neutron",
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        Math.min(neutronsPerParticle, 10), // 최대 10개로 제한하여 크기 조절
        Math.min(explosionIntensity, 1.2) // intensity를 1.2로 제한
      )
    );
  }

  stats.totalNeutrons += neutronCount;

  // 더 많은 에너지 입자
  const visualEnergyCount = Math.min(10, Math.ceil(uranium.count / 20) || 1);
  for (let i = 0; i < visualEnergyCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (4 + Math.random() * 6) * criticalMultiplier;
    particles.push(
      new Particle(
        uranium.x,
        uranium.y,
        "energy",
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        uranium.count,
        explosionIntensity,
        effectDuration * 1000 // 수명 설정
      )
    );
  }

  stats.energy += 0.0025 * criticalMultiplier * uranium.count;

  // 폭발 효과 트리거
  triggerExplosionEffect(explosionIntensity);

  const now = Date.now();
  const timeDiff = (now - lastReactionTime) / 1000;
  if (timeDiff > 0) {
    reactionRate = uranium.count / timeDiff;
  }
  lastReactionTime = now;
}

function checkCollisions() {
  let totalActiveNeutrons = 0;

  const neutrons = particles.filter((p) => p.type === "neutron");
  const uraniums = particles.filter((p) => p.type === "uranium" && !p.hasCollided);

  totalActiveNeutrons = neutrons.reduce((sum, n) => sum + n.count, 0);

  for (let i = neutrons.length - 1; i >= 0; i--) {
    const neutron = neutrons[i];

    for (let j = uraniums.length - 1; j >= 0; j--) {
      const uranium = uraniums[j];

      const distance = neutron.distanceTo(uranium);

      if (distance < neutron.size + uranium.size) {
        const criticalMultiplier = parseFloat(document.getElementById("criticalMass").value);
        const fissionProbability = Math.min(0.98, 0.3 * criticalMultiplier);

        if (Math.random() < fissionProbability) {
          const reactionCount = Math.min(neutron.count, uranium.count);

          if (neutron.count > reactionCount) {
            neutron.count -= reactionCount;
          } else {
            const neutronIndex = particles.findIndex((p) => p === neutron);
            if (neutronIndex !== -1) particles.splice(neutronIndex, 1);
          }

          if (uranium.count > reactionCount) {
            uranium.count -= reactionCount;
          } else {
            uranium.hasCollided = true;
            const uraniumIndex = particles.findIndex((p) => p === uranium);
            if (uraniumIndex !== -1) particles.splice(uraniumIndex, 1);
          }

          const fissionUranium = new Particle(uranium.x, uranium.y, "uranium", 0, 0, reactionCount);
          createFission(fissionUranium);
          generationCount++;

          break;
        }
      }
    }
  }

  stats.activeNeutrons = totalActiveNeutrons;

  particles = particles.filter((p) => p.life > 0.05);

  if (particles.length > mergeThreshold) {
    mergeNearbyParticles();
  }

  const remainingUranium = particles.filter((p) => p.type === "uranium").reduce((sum, p) => sum + p.count, 0);
  const activeEnergyParticles = particles.filter((p) => p.type === "energy").length;

  if (isRunning) {
    if (totalActiveNeutrons > 500 || reactionRate > 200) {
      updateSimulationStatus("🚨 임계 연쇄반응", "critical");
    } else if (totalActiveNeutrons > 100 || reactionRate > 50) {
      updateSimulationStatus("🔥 연쇄반응 진행중", "active");
    } else if (totalActiveNeutrons > 0 || activeEnergyParticles > 0) {
      updateSimulationStatus("⚡ 반응 안정화중", "active");
    } else {
      updateSimulationStatus("✅ 반응 완료", "stable");
    }
  }
}

function updateSimulationStatus(text, type) {
  const statusElement = document.getElementById("simulationStatus");
  statusElement.innerHTML = `<span class="status-indicator status-${type}"></span>${text}`;
}

function animate() {
  if (!isRunning || isPaused) return;

  const now = Date.now();
  if (now - lastUpdate < 20) {
    requestAnimationFrame(animate);
    return;
  }
  lastUpdate = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 더 부드러운 페이드 효과
  if (frameCount % 2 === 0) {
    ctx.fillStyle = "rgba(0, 6, 24, 0.12)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 폭발파 업데이트 및 그리기
  for (let i = explosionWaves.length - 1; i >= 0; i--) {
    const wave = explosionWaves[i];
    if (!wave.update()) {
      explosionWaves.splice(i, 1);
    } else {
      wave.draw();
    }
  }

  // 낙진 입자 업데이트
  if (falloutActive) {
    for (let i = falloutParticles.length - 1; i >= 0; i--) {
      const particle = falloutParticles[i];
      if (!particle.update()) {
        falloutParticles.splice(i, 1);
      } else {
        particle.draw();
      }
    }

    // 새 낙진 입자 추가
    if (Math.random() < 0.3) {
      falloutParticles.push(new FalloutParticle());
    }
  }

  // 메인 입자들
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.update();
    particle.draw();
  }

  checkCollisions();

  // 열기 레벨 감소
  heatLevel *= 0.995;
  explosionIntensity *= 0.99;

  if (frameCount % 3 === 0) {
    updateStats();
    calculateDamageZones(stats.energy);
  }

  frameCount++;
  requestAnimationFrame(animate);
}

function updateStats() {
  document.getElementById("fissionCount").textContent = formatCount(stats.fissions);
  document.getElementById("activeNeutronCount").textContent = formatCount(stats.activeNeutrons);
  document.getElementById("totalNeutronCount").textContent = formatCount(stats.totalNeutrons);
  document.getElementById("energyCount").textContent = stats.energy.toFixed(2) + " kt TNT";
  document.getElementById("reactionRate").textContent = formatCount(Math.floor(reactionRate)) + " /초";

  const energyPercent = Math.min(100, (stats.energy / 100) * 100);
  document.getElementById("energyBar").style.width = energyPercent + "%";

  // 열기 게이지 업데이트
  const heatElement = document.getElementById("heatFill");
  if (heatElement) {
    const heatPercent = Math.min(100, heatLevel);
    heatElement.style.width = heatPercent + "%";
  }

  // 온도 표시 업데이트
  const tempElement = document.getElementById("currentTemp");
  if (tempElement) {
    tempElement.textContent = formatCount(stats.temperature) + "°C";
  }
}

async function startSimulation() {
  if (!isRunning) {
    isRunning = true;
    isPaused = false;
    stats.startTime = Date.now();
    frameCount = 0;
    lastUpdate = 0;

    const initialNeutrons = parseInt(document.getElementById("neutronCount").value);
    const criticalMultiplier = parseFloat(document.getElementById("criticalMass").value);

    const neutronCount = Math.min(initialNeutrons, 20);

    for (let i = 0; i < neutronCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (3 + Math.random() * 4) * Math.sqrt(criticalMultiplier);
      particles.push(
        new Particle(
          canvas.width / 2 + (Math.random() - 0.5) * 80,
          canvas.height / 2 + (Math.random() - 0.5) * 80,
          "neutron",
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          1, // count를 1로 고정하여 초기 중성자 크기를 적절히 유지
          0.8 // intensity를 0.8로 줄여서 너무 크지 않게 함
        )
      );
    }

    updateSimulationStatus("🚀 시뮬레이션 시작", "active");
    animate();
  }
}

function resetSimulation() {
  isRunning = false;
  isPaused = false;
  generationCount = 0;
  reactionRate = 0;
  frameCount = 0;
  lastUpdate = 0;
  heatLevel = 0;
  explosionIntensity = 0;
  falloutActive = false;
  heatEffectActive = false; // 초기화

  // 오버레이 리셋
  const heatOverlay = document.getElementById("heatOverlay");
  const falloutOverlay = document.getElementById("falloutOverlay");
  if (heatOverlay) heatOverlay.classList.remove("active");
  if (falloutOverlay) falloutOverlay.classList.remove("active");

  initializeSimulation();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles.forEach((particle) => particle.draw());

  document.getElementById("pauseBtn").textContent = "⏸️ 일시정지";
}

function pauseSimulation() {
  isPaused = !isPaused;
  document.getElementById("pauseBtn").textContent = isPaused ? "▶️ 재개" : "⏸️ 일시정지";

  if (!isPaused && isRunning) {
    updateSimulationStatus("▶️ 시뮬레이션 재개", "active");
    animate();
  } else if (isPaused) {
    updateSimulationStatus("⏸️ 일시정지", "stable");
  }
}

// 이벤트 리스너 설정
function setupEventListeners() {
  document.getElementById("startBtn").addEventListener("click", startSimulation);
  document.getElementById("resetBtn").addEventListener("click", resetSimulation);
  document.getElementById("pauseBtn").addEventListener("click", pauseSimulation);

  // 프리셋 버튼 이벤트
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyPreset(btn.dataset.preset);
    });
  });

  // 설정 변경 시 커스텀으로 전환
  ["uraniumCount", "neutronCount", "criticalMass"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      if (currentPreset !== "custom") {
        applyPreset("custom");
      }
      resetSimulation();
    });
  });
}

// 캔버스 크기 조정
function resizeCanvas() {
  const container = document.querySelector(".canvas-container");
  const maxWidth = Math.min(container.clientWidth - 10, 600);
  const aspectRatio = 500 / 350;

  canvas.style.width = maxWidth + "px";
  canvas.style.height = maxWidth / aspectRatio + "px";
}

// 초기화
function init() {
  createEffectOverlays();
  setupEventListeners();
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  applyPreset("custom");
  initializeSimulation();
  particles.forEach((particle) => particle.draw());
}

// DOM 로드 완료 후 초기화
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
