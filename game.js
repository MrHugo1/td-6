// Game elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const goldElement = document.getElementById('gold');
const waveElement = document.getElementById('wave');
const enemiesElement = document.getElementById('enemies');

// Tower buttons
const tower1Button = document.getElementById('tower1');
const tower2Button = document.getElementById('tower2');
const tower3Button = document.getElementById('tower3');
const tower4Button = document.getElementById('tower4');

// Game configuration
const config = {
    initialGold: 1000,
    barracksUnitInterval: 6000, // ms, lính tích lũy mỗi 6s
    towerTypes: [
        { id: 1, name: "Archer", cost: 50, damage: 20, range: 120, color: "#3498db", cooldown: 3000 },
        { id: 2, name: "Cannon", cost: 100, damage: 40, range: 100, color: "#e74c3c", cooldown: 4000 },
        { id: 3, name: "Ice", cost: 75, damage: 10, range: 90, color: "#1abc9c", cooldown: 5000 },
        { id: 4, name: "Barracks", cost: 150, range: 80, color: "#f39c12", isBarracks: true }
    ],
    enemyTypes: [
        { name: "Normal", health: 50, speed: 1, reward: 10, color: "#8e44ad", attackRange: 30, attackDamage: 10, attackCooldown: 1200 },
        { name: "Fast", health: 50, speed: 1.5, reward: 15, color: "#3498db", attackRange: 30, attackDamage: 8, attackCooldown: 900 },
        { name: "Tank", health: 50, speed: 0.7, reward: 20, color: "#e74c3c", attackRange: 35, attackDamage: 20, attackCooldown: 1800 }
    ],
    paths: [
        [ {x: 90, y: 0}, {x: 90, y: 640} ],
        [ {x: 180, y: 0}, {x: 180, y: 640} ],
        [ {x: 270, y: 0}, {x: 270, y: 640} ]
    ]
};

const FIREBALL_COOLDOWN = 45; // giây
const FIREBALL_RADIUS = 100; // px

// Game state
const gameState = {
    isPlaying: false,
    gold: config.initialGold,
    selectedTower: null,
    towers: [],
    enemies: [],
    units: [],
    projectiles: [],
    enemiesKilled: 0,
    mouseX: 0,
    mouseY: 0,
    currentWave: 1,
    enemiesInWave: 100,
    enemiesSpawned: 0,
    waveInProgress: false,
    gameOver: false,
    fireball: {
        cooldown: 0,
        selecting: false,
        ready: true,
        showRange: false,
        target: null
    }
};

// Thêm biến theo dõi thời gian tăng máu quái
let lastEnemyHealthBuff = 0;

// Thêm biến theo dõi số lần tăng máu quái
let enemyHealthBuffCount = 0;
let lastEnemyHealthBuffTime = 0;

// Helper functions
function distance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function getPathLength(pathIdx = 1) {
    const path = config.paths[pathIdx];
    let len = 0;
    for (let i = 0; i < path.length - 1; i++) {
        len += distance(path[i].x, path[i].y, path[i+1].x, path[i+1].y);
    }
    return len;
}

function getPathPosition(progress, pathIdx = 1) {
    const path = config.paths[pathIdx];
    const pathLength = path.length - 1;
    const segment = Math.min(Math.floor(progress * pathLength), pathLength - 1);
    const segmentProgress = (progress * pathLength) - segment;
    const startX = path[segment].x;
    const startY = path[segment].y;
    const endX = path[segment + 1].x;
    const endY = path[segment + 1].y;
    return {
        x: startX + (endX - startX) * segmentProgress,
        y: startY + (endY - startY) * segmentProgress
    };
}

// Tower placement
let validTowerPositions = [];

function canPlaceTower(x, y) {
    for (let pos of validTowerPositions) {
        if (distance(x, y, pos.x, pos.y) < 20) {
            for (let tower of gameState.towers) {
                if (distance(pos.x, pos.y, tower.x, tower.y) < 20) return false;
            }
            if (gameState.towers.length >= 4) return false;
            return true;
        }
    }
    return false;
}

function placeTower(x, y, towerId) {
    if (gameState.towers.length >= 4) return;
    let found = false;
    let posX = 0, posY = 0;
    for (let pos of validTowerPositions) {
        if (distance(x, y, pos.x, pos.y) < 20) {
            posX = pos.x;
            posY = pos.y;
            found = true;
            break;
        }
    }
    if (!found) return;
    const towerType = config.towerTypes.find(t => t.id === towerId);
    if (!towerType) return;
    if (gameState.gold < towerType.cost) return;
    for (let tower of gameState.towers) {
        if (distance(posX, posY, tower.x, tower.y) < 20) return;
    }
    const tower = {
        x: posX,
        y: posY,
        id: towerId,
        type: towerType.name,
        damage: towerType.damage || 0,
        range: towerType.range,
        cooldown: towerType.cooldown || 1000,
        cooldownRemaining: 0,
        color: towerType.color,
        isBarracks: towerType.isBarracks || false,
        cost: towerType.cost,
        accumulatedUnits: towerType.isBarracks ? 0 : undefined,
        barracksTimer: towerType.isBarracks ? 0 : undefined
    };
    gameState.towers.push(tower);
    gameState.gold -= towerType.cost;
    goldElement.textContent = gameState.gold;
}

// Spawn enemy
function spawnEnemy() {
    if (gameState.enemiesSpawned >= 100 || gameState.gameOver) return;
    const pathIdx = Math.floor(Math.random() * config.paths.length);
    const pathLen = getPathLength(pathIdx);
    let baseSpeed = (pathLen / (30 * 10)) * 0.2 * 1.3;
    let speedMultiplier = 1 + Math.floor((gameState.enemiesSpawned * 2.5) / 6) * 0.01;
    let enemySpeed = baseSpeed * speedMultiplier;
    const enemyTypeIndex = Math.floor(Math.random() * config.enemyTypes.length);
    const enemyType = config.enemyTypes[enemyTypeIndex];
    // Máu cơ bản tăng 5% mỗi 10s kể từ đầu ván
    let healthBuff = Math.pow(1.05, enemyHealthBuffCount);
    let baseHealth = Math.round(enemyType.health * healthBuff);
    // Phần thưởng giết mỗi loại quái tăng lên 30 40 50 vàng tương ứng
    let reward = 30;
    if (enemyType.name === "Fast") reward = 40;
    if (enemyType.name === "Tank") reward = 50;
    const enemy = {
        x: config.paths[pathIdx][0].x,
        y: config.paths[pathIdx][0].y,
        health: baseHealth,
        maxHealth: baseHealth,
        speed: enemySpeed,
        reward: reward,
        color: enemyType.color,
        progress: 0,
        type: enemyType.name,
        attackRange: enemyType.attackRange,
        attackDamage: enemyType.attackDamage,
        attackCooldown: enemyType.attackCooldown,
        attackCooldownRemaining: 0,
        isInCombat: false,
        pathIdx: pathIdx
    };
    gameState.enemies.push(enemy);
    gameState.enemiesSpawned++;
    enemiesElement.textContent = gameState.enemies.length + "/100";
    if (gameState.enemiesSpawned < 100) {
        setTimeout(spawnEnemy, 500 + Math.random() * 1500);
    }
}

// Start a new wave
function startWave() {
    if (gameState.waveInProgress || gameState.gameOver) return;
    gameState.waveInProgress = true;
    gameState.enemiesSpawned = 0;
    gameState.enemiesInWave = 100;
    waveElement.textContent = gameState.currentWave;
    enemiesElement.textContent = "0/100";
    spawnEnemy();
}

// Spawn unit (from barracks)
function spawnUnit(x, y) {
    let minDist = Infinity;
    let chosenPathIdx = 0;
    let progress = 0;
    for (let p = 0; p < config.paths.length; p++) {
        const path = config.paths[p];
        const px = path[0].x;
        const dist = Math.abs(x - px);
        if (dist < minDist) {
            minDist = dist;
            chosenPathIdx = p;
            progress = y / 640;
        }
    }
    progress = Math.max(0, Math.min(1, progress));
    const pos = getPathPosition(progress, chosenPathIdx);
    const baseTower = config.towerTypes.find(t => t.id === 1);
    const range = baseTower ? baseTower.range / 2 : 60;
    const pathLen = getPathLength(chosenPathIdx);
    let baseSpeed = (pathLen / (30 * 10)) * 0.2 * 1.3;
    let speedMultiplier = 1 + Math.floor((gameState.units.length * 2.5) / 6) * 0.01;
    const unit = {
        x: pos.x,
        y: pos.y,
        health: 50,
        maxHealth: 50,
        damage: 15,
        range: range,
        speed: baseSpeed * speedMultiplier,
        attackCooldown: 800,
        attackCooldownRemaining: 0,
        color: "#f1c40f",
        target: null,
        isInCombat: false,
        pathIdx: chosenPathIdx,
        progress: progress
    };
    gameState.units.push(unit);
}

// Game end
function endGame(isVictory) {
    gameState.gameOver = true;
    if (isVictory) {
        alert("Chiến thắng! Bạn đã tiêu diệt hết quái!");
    } else {
        alert("Thất bại! Có quái lọt qua!");
    }
    startButton.style.display = 'block';
}

// Game loop variables
let lastTimestamp = 0;
let lastBarracksSpawn = 0;

function triggerFireball(x, y) {
    // Gây damage cho quái trong phạm vi FIREBALL_RADIUS
    let hit = false;
    for (let enemy of gameState.enemies) {
        const dist = distance(x, y, enemy.x, enemy.y);
        if (dist <= FIREBALL_RADIUS) {
            enemy.health -= 9999; // Sát thương lớn, đảm bảo tiêu diệt
            hit = true;
        }
    }
    // Hiệu ứng nổ có thể thêm vào đây nếu muốn
}

let fireballCooldownTimer = 0;

// Main game loop
function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    // Fireball cooldown logic
    if (gameState.isPlaying && !gameState.gameOver) {
        if (!gameState.fireball.ready) {
            gameState.fireball.cooldown -= delta;
            if (gameState.fireball.cooldown <= 0) {
                gameState.fireball.cooldown = 0;
                gameState.fireball.ready = true;
            }
        }
    }

    if (gameState.isPlaying && !gameState.gameOver) {
        for (let tower of gameState.towers) {
            if (tower.isBarracks) {
                if (typeof tower.barracksTimer !== "number") tower.barracksTimer = 0;
                tower.barracksTimer += delta * 1000;
                while (tower.barracksTimer >= config.barracksUnitInterval) {
                    tower.barracksTimer -= config.barracksUnitInterval;
                    tower.accumulatedUnits = (tower.accumulatedUnits || 0) + 1;
                }
            } else {
                if (tower.cooldownRemaining > 0) {
                    tower.cooldownRemaining -= delta * 1000;
                }
            }
        }

        for (let tower of gameState.towers) {
            if (!tower.isBarracks) {
                if (tower.cooldownRemaining > 0) {
                    tower.cooldownRemaining -= delta * 1000;
                } else {
                    let closestEnemy = null;
                    let minDistance = tower.range;
                    for (let enemy of gameState.enemies) {
                        const dist = distance(tower.x, tower.y, enemy.x, enemy.y);
                        if (dist < minDistance) {
                            minDistance = dist;
                            closestEnemy = enemy;
                        }
                    }
                    if (closestEnemy) {
                        closestEnemy.health -= tower.damage;
                        tower.cooldownRemaining = tower.cooldown;
                        gameState.projectiles.push({
                            x: tower.x,
                            y: tower.y,
                            targetX: closestEnemy.x,
                            targetY: closestEnemy.y,
                            color: tower.color,
                            timeLeft: 0.2
                        });
                        if (closestEnemy.health <= 0) {
                            const index = gameState.enemies.indexOf(closestEnemy);
                            if (index > -1) {
                                gameState.enemies.splice(index, 1);
                                gameState.gold += Math.floor(closestEnemy.reward * 0.5);
                                goldElement.textContent = gameState.gold;
                                gameState.enemiesKilled++;
                                enemiesElement.textContent = gameState.enemies.length + "/" + gameState.enemiesInWave;
                            }
                        }
                    }
                }
            }
        }

        for (let p = 0; p < config.paths.length; p++) {
            const unitsOnPath = gameState.units.filter(u => u.pathIdx === p).sort((a, b) => a.progress - b.progress);
            const enemiesOnPath = gameState.enemies.filter(e => e.pathIdx === p).sort((a, b) => b.progress - a.progress);

            // Lưu trạng thái "dừng lại" cho từng unit trên path
            if (!gameState.unitStopStates) gameState.unitStopStates = {};
            if (!gameState.unitStopStates[p]) gameState.unitStopStates[p] = {};

            for (let i = 0; i < unitsOnPath.length; i++) {
                const unit = unitsOnPath[i];
                if (unit.health <= 0) continue;

                // Nếu không còn enemy nào trên path, unit sẽ dừng lại tại vị trí hiện tại
                if (enemiesOnPath.length === 0) {
                    // Nếu chưa lưu trạng thái dừng, lưu lại vị trí hiện tại
                    if (!gameState.unitStopStates[p][unit]) {
                        gameState.unitStopStates[p][unit] = {
                            progress: unit.progress,
                            x: unit.x,
                            y: unit.y
                        };
                    }
                    // Giữ nguyên vị trí
                    unit.progress = gameState.unitStopStates[p][unit].progress;
                    unit.x = gameState.unitStopStates[p][unit].x;
                    unit.y = gameState.unitStopStates[p][unit].y;
                    unit.isInCombat = false;
                    // Không xử lý di chuyển/đánh nữa
                    if (unit.lastDamageTimer > 0) {
                        unit.lastDamageTimer -= delta;
                        if (unit.lastDamageTimer <= 0) {
                            unit.lastDamageTimer = 0;
                            unit.lastDamage = 0;
                        }
                    }
                    continue;
                } else {
                    // Nếu có enemy mới xuất hiện, xóa trạng thái dừng
                    if (gameState.unitStopStates[p][unit]) {
                        delete gameState.unitStopStates[p][unit];
                    }
                }

                let block = false;
                for (let j = 0; j < enemiesOnPath.length; j++) {
                    const enemy = enemiesOnPath[j];
                    if (enemy.progress > unit.progress && enemy.progress - unit.progress < 0.03) {
                        block = true;
                        unit.isInCombat = true;
                        enemy.isInCombat = true;
                        if (unit.attackCooldownRemaining <= 0) {
                            enemy.health -= unit.damage;
                            unit.attackCooldownRemaining = unit.attackCooldown;
                        }
                        if (unit.attackCooldownRemaining > 0) {
                            unit.attackCooldownRemaining -= delta * 1000;
                        }
                        break;
                    }
                }
                if (!block) {
                    unit.isInCombat = false;
                    let blockedByUnit = false;
                    for (let k = 0; k < unitsOnPath.length; k++) {
                        const other = unitsOnPath[k];
                        if (other !== unit && other.progress < unit.progress && unit.progress - other.progress < 0.03) {
                            blockedByUnit = true;
                            break;
                        }
                    }
                    const maxProgress = 0.10;
                    if (!blockedByUnit && unit.progress > maxProgress) {
                        unit.progress -= (unit.speed * delta) / 10;
                        unit.progress = Math.max(maxProgress, unit.progress);
                        const pos = getPathPosition(unit.progress, unit.pathIdx);
                        unit.x = pos.x;
                        unit.y = pos.y;
                    }
                }
                if (unit.lastDamageTimer > 0) {
                    unit.lastDamageTimer -= delta;
                    if (unit.lastDamageTimer <= 0) {
                        unit.lastDamageTimer = 0;
                        unit.lastDamage = 0;
                    }
                }
            }
        }

        for (let p = 0; p < config.paths.length; p++) {
            const enemiesOnPath = gameState.enemies.filter(e => e.pathIdx === p).sort((a, b) => b.progress - a.progress);
            const unitsOnPath = gameState.units.filter(u => u.pathIdx === p).sort((a, b) => a.progress - b.progress);
            for (let i = 0; i < enemiesOnPath.length; i++) {
                const enemy = enemiesOnPath[i];
                if (enemy.health <= 0) continue;
                let block = false;
                for (let j = 0; j < unitsOnPath.length; j++) {
                    const unit = unitsOnPath[j];
                    if (unit.progress < enemy.progress && enemy.progress - unit.progress < 0.03) {
                        block = true;
                        enemy.isInCombat = true;
                        unit.isInCombat = true;
                        if (enemy.attackCooldownRemaining <= 0) {
                            unit.lastDamage = enemy.attackDamage;
                            unit.lastDamageTimer = 0.7;
                            unit.health -= enemy.attackDamage;
                            enemy.attackCooldownRemaining = enemy.attackCooldown;
                        }
                        if (enemy.attackCooldownRemaining > 0) {
                            enemy.attackCooldownRemaining -= delta * 1000;
                        }
                        break;
                    }
                }
                if (!block) {
                    enemy.isInCombat = false;
                    let blockedByEnemy = false;
                    for (let k = 0; k < enemiesOnPath.length; k++) {
                        const other = enemiesOnPath[k];
                        if (other !== enemy && other.progress > enemy.progress && other.progress - enemy.progress < 0.03) {
                            blockedByEnemy = true;
                            break;
                        }
                    }
                    if (!blockedByEnemy) {
                        enemy.progress += (enemy.speed * delta) / 10;
                        enemy.progress = Math.min(1, enemy.progress);
                        const pos = getPathPosition(enemy.progress, enemy.pathIdx);
                        enemy.x = pos.x;
                        enemy.y = pos.y;
                    }
                }
            }
        }

        for (let i = gameState.units.length - 1; i >= 0; i--) {
            const unit = gameState.units[i];
            if (unit.health <= 0) {
                gameState.units.splice(i, 1);
                continue;
            }
        }

        for (let i = gameState.enemies.length - 1; i >= 0; i--) {
            const enemy = gameState.enemies[i];
            if (enemy.progress >= 1) {
                endGame(false);
                return;
            }
            if (enemy.health <= 0) {
                gameState.enemies.splice(i, 1);
                gameState.gold += Math.floor(enemy.reward * 0.5);
                goldElement.textContent = gameState.gold;
                gameState.enemiesKilled++;
                enemiesElement.textContent = gameState.enemies.length + "/" + gameState.enemiesInWave;
                if (gameState.enemiesKilled >= 100 && gameState.enemies.length === 0) {
                    endGame(true);
                    return;
                }
            }
        }

        for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
            const projectile = gameState.projectiles[i];
            projectile.timeLeft -= delta;
            if (projectile.timeLeft <= 0) {
                gameState.projectiles.splice(i, 1);
            }
        }

        // Mỗi 10s từ lúc bắt đầu ván, máu cơ bản của quái tăng 5%
        if (gameState.isPlaying && !gameState.gameOver) {
            lastEnemyHealthBuffTime += delta;
            if (lastEnemyHealthBuffTime >= 10) {
                lastEnemyHealthBuffTime -= 10;
                enemyHealthBuffCount++;
            }
        }
    }

    draw();
    requestAnimationFrame(gameLoop);
}

function drawFireballButton() {
    const btnSize = 54;
    // Dời nút fireball cao lên 50px nữa và sang phải 30px
    const marginY = 88; // 38 + 50
    const marginX = 0; // chuyển từ -30 thành 0 để sang phải 30px so với trước
    const x = canvas.width - btnSize + marginX + 30;
    const y = canvas.height - btnSize - marginY;

    // Nút nền
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x + btnSize/2, y + btnSize/2, btnSize/2, 0, Math.PI*2);
    ctx.fillStyle = gameState.fireball.ready ? "#ff9800" : "#888";
    ctx.shadowColor = "#ff9800";
    ctx.shadowBlur = gameState.fireball.ready ? 16 : 0;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Vẽ hình ngọn lửa đơn giản
    ctx.save();
    ctx.translate(x + btnSize/2, y + btnSize/2 + 4);
    ctx.scale(1.1, 1.1);
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.bezierCurveTo(-10, 10, -8, -8, 0, -18);
    ctx.bezierCurveTo(8, -8, 10, 10, 0, 18);
    ctx.closePath();
    ctx.fillStyle = "#ffeb3b";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.bezierCurveTo(-5, 5, -4, -4, 0, -10);
    ctx.bezierCurveTo(4, -4, 5, 5, 0, 10);
    ctx.closePath();
    ctx.fillStyle = "#ff5722";
    ctx.fill();
    ctx.restore();

    // Cooldown overlay
    if (!gameState.fireball.ready) {
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(x + btnSize/2, y + btnSize/2, btnSize/2, -Math.PI/2, -Math.PI/2 + 2*Math.PI*(1 - gameState.fireball.cooldown/FIREBALL_COOLDOWN));
        ctx.lineTo(x + btnSize/2, y + btnSize/2);
        ctx.closePath();
        ctx.fillStyle = "#222";
        ctx.fill();
        ctx.globalAlpha = 1;
        // Hiển thị số giây còn lại
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px Arial";
        ctx.textAlign = "center";
        ctx.fillText(Math.ceil(gameState.fireball.cooldown), x + btnSize/2, y + btnSize/2 + 7);
    } else {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px Arial";
        ctx.textAlign = "center";
        ctx.fillText("🔥", x + btnSize/2, y + btnSize/2 + 8);
    }
    ctx.restore();
    // Lưu lại vị trí nút để kiểm tra click
    gameState.fireball.btnRect = {x, y, size: btnSize};
}

function drawFireballRange() {
    if (gameState.fireball.selecting && gameState.mouseX && gameState.mouseY) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(gameState.mouseX, gameState.mouseY, FIREBALL_RADIUS, 0, Math.PI*2);
        ctx.fillStyle = "#ff9800";
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = "#ff9800";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(gameState.mouseX, gameState.mouseY, FIREBALL_RADIUS, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
    }
}

// Draw game state
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let p = 0; p < config.paths.length; p++) {
        const path = config.paths[p];
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 40;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
        ctx.strokeStyle = '#6e4223';
        ctx.lineWidth = 42;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 320);
    ctx.lineTo(360, 320);
    ctx.stroke();

    ctx.save();
    // Vùng thả lính 1/5 dưới màn hình
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#00b894'; // xanh ngọc nhạt
    ctx.fillRect(0, canvas.height * 4 / 5, canvas.width, canvas.height / 5);
    ctx.globalAlpha = 1;
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = '#00b894';
    ctx.textAlign = 'center';
    ctx.fillText('Chỉ được thả lính trong vùng này', canvas.width / 2, canvas.height * 4 / 5 + 22);
    ctx.restore();

    ctx.save();
    const squareSize = 40;
    const towerY = 320;
    const laneXs = [
        (90 + 180) / 2,
        (180 + 270) / 2
    ];
    laneXs.unshift(90 - (180 - 90) / 2);
    laneXs.push(270 + (270 - 180) / 2);
    validTowerPositions = [];
    for (let i = 0; i < laneXs.length; i++) {
        const x = laneXs[i];
        const y = towerY;
        let onPath = false;
        for (let p = 0; p < config.paths.length; p++) {
            const path = config.paths[p];
            for (let j = 0; j < path.length - 1; j++) {
                const start = path[j];
                const end = path[j + 1];
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const len = Math.sqrt(dx*dx + dy*dy);
                const dot = ((x - start.x) * dx + (y - start.y) * dy) / (len * len);
                const closestX = start.x + dot * dx;
                const closestY = start.y + dot * dy;
                const dist = distance(x, y, closestX, closestY);
                if (dist < 40) onPath = true;
            }
        }
        if (!onPath) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#00cec9';
            ctx.fillRect(x - squareSize/2, y - squareSize/2, squareSize, squareSize);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#0984e3';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x - squareSize/2, y - squareSize/2, squareSize, squareSize);
            validTowerPositions.push({x, y});
        }
    }
    ctx.restore();

    for (let tower of gameState.towers) {
        ctx.save();
        ctx.translate(tower.x, tower.y);
        if (tower.id === 1) ctx.fillStyle = '#4a90e2';
        else if (tower.id === 2) ctx.fillStyle = '#b8860b';
        else if (tower.id === 3) ctx.fillStyle = '#444';
        else if (tower.id === 4) ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.stroke();
        if (tower.id === 1) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(0, 6);
            ctx.stroke();
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-2.5, 4);
            ctx.lineTo(2.5, 4);
            ctx.stroke();
        } else if (tower.id === 2) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(0, 0, 6.5, Math.PI/4, Math.PI*7/4);
            ctx.stroke();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(5, -5);
            ctx.lineTo(-5, 5);
            ctx.stroke();
        } else if (tower.id === 3) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(0, 0, 4.5, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, -4.5);
            ctx.lineTo(0, -8);
            ctx.stroke();
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(0, -8, 1.3, 0, Math.PI*2);
            ctx.fill();
        } else if (tower.id === 4) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(0, 1.5, 5.2, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = '#bbb';
            ctx.fillRect(-5.2, 1.5, 10.4, 2.2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 1.5, 5.2, Math.PI, 0);
            ctx.stroke();
        }
        ctx.restore();
    }

    for (let unit of gameState.units) {
        ctx.fillStyle = unit.color;
        ctx.beginPath();
        ctx.arc(unit.x, unit.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillRect(unit.x - 1, unit.y - 5, 2, 10);
        ctx.fillRect(unit.x - 3, unit.y - 1, 6, 2);
        const healthPercent = unit.health / unit.maxHealth;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(unit.x - 10, unit.y - 15, 20, 3);
        ctx.fillStyle = healthPercent > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(unit.x - 10, unit.y - 15, 20 * healthPercent, 3);
        if (unit.lastDamage && unit.lastDamageTimer > 0) {
            ctx.fillStyle = 'red';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('-' + unit.lastDamage, unit.x, unit.y - 25);
        }
    }

    for (let projectile of gameState.projectiles) {
        ctx.strokeStyle = projectile.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(projectile.x, projectile.y);
        ctx.lineTo(projectile.targetX, projectile.targetY);
        ctx.stroke();
    }

    for (let enemy of gameState.enemies) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        if (enemy.type === 'Normal') ctx.fillStyle = '#8e44ad';
        else if (enemy.type === 'Fast') ctx.fillStyle = '#3498db';
        else if (enemy.type === 'Tank') ctx.fillStyle = '#27ae60';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI*2);
        ctx.stroke();
        if (enemy.type === 'Normal') {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(-4.5, 2.2);
            ctx.quadraticCurveTo(-1.5, -3.5, 3, 1.5);
            ctx.quadraticCurveTo(5, 4, 4.5, -2.2);
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(4.5, -2.2, 1.2, 0, Math.PI*2);
            ctx.fill();
        } else if (enemy.type === 'Fast') {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.ellipse(0, 1.2, 4.2, 2.7, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(-1.3, -1.2);
            ctx.lineTo(-1.3, -5.2);
            ctx.moveTo(1.3, -1.2);
            ctx.lineTo(1.3, -5.2);
            ctx.stroke();
        } else if (enemy.type === 'Tank') {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(0, 1.2, 5.2, Math.PI, 0);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, -2.8, 1.2, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
        const healthPercent = enemy.health / enemy.maxHealth;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(enemy.x - 15, enemy.y - 20, 30, 5);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(enemy.x - 15, enemy.y - 20, 30 * healthPercent, 5);
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(Math.floor(enemy.health), enemy.x, enemy.y - 25);
    }

    if (gameState.selectedTower && gameState.mouseX && gameState.mouseY) {
        const towerType = config.towerTypes.find(t => t.id === gameState.selectedTower);
        if (towerType && canPlaceTower(gameState.mouseX, gameState.mouseY)) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#2ecc71';
            ctx.beginPath();
            ctx.arc(gameState.mouseX, gameState.mouseY, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#7f8c8d';
            ctx.beginPath();
            ctx.arc(gameState.mouseX, gameState.mouseY, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = towerType.color;
            ctx.beginPath();
            ctx.arc(gameState.mouseX, gameState.mouseY, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(gameState.mouseX, gameState.mouseY, towerType.range, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Tiêu diệt: ' + gameState.enemiesKilled, 10, 80);

    // Vẽ nút fireball
    drawFireballButton();
    // Vẽ vùng ảnh hưởng nếu đang chọn vị trí
    drawFireballRange();
}

function startGame() {
    gameState.isPlaying = true;
    gameState.gold = config.initialGold;
    gameState.towers = [];
    gameState.enemies = [];
    gameState.units = [];
    gameState.projectiles = [];
    gameState.enemiesKilled = 0;
    gameState.currentWave = 1;
    gameState.waveInProgress = false;
    gameState.gameOver = false;
    // Reset fireball
    gameState.fireball.cooldown = 0;
    gameState.fireball.ready = true;
    gameState.fireball.selecting = false;
    gameState.fireball.target = null;
    startButton.style.display = 'none';
    goldElement.textContent = gameState.gold;
    waveElement.textContent = gameState.currentWave;
    enemiesElement.textContent = "0/100";
    setTimeout(startWave, 2000);
}

// Event Listeners
startButton.addEventListener('click', startGame);

tower1Button.addEventListener('click', function() {
    if (!gameState.isPlaying || gameState.gameOver) return;
    gameState.selectedTower = 1;
});

tower2Button.addEventListener('click', function() {
    if (!gameState.isPlaying || gameState.gameOver) return;
    gameState.selectedTower = 2;
});

tower3Button.addEventListener('click', function() {
    if (!gameState.isPlaying || gameState.gameOver) return;
    gameState.selectedTower = 3;
});

tower4Button.addEventListener('click', function() {
    if (!gameState.isPlaying || gameState.gameOver) return;
    gameState.selectedTower = 4;
});

// Canvas mouse events
canvas.addEventListener('mousemove', function(event) {
    const rect = canvas.getBoundingClientRect();
    gameState.mouseX = event.clientX - rect.left;
    gameState.mouseY = event.clientY - rect.top;
});

canvas.addEventListener('click', function(event) {
    if (!gameState.isPlaying || gameState.gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Ưu tiên xử lý fireball
    if (gameState.fireball.selecting) {
        // Thả fireball tại vị trí chọn
        triggerFireball(x, y);
        gameState.fireball.selecting = false;
        gameState.fireball.ready = false;
        gameState.fireball.cooldown = FIREBALL_COOLDOWN;
        return;
    }

    // Kiểm tra click vào nút fireball
    if (gameState.fireball.btnRect) {
        const btn = gameState.fireball.btnRect;
        if (
            x >= btn.x && x <= btn.x + btn.size &&
            y >= btn.y && y <= btn.y + btn.size
        ) {
            if (gameState.fireball.ready) {
                gameState.fireball.selecting = true;
            }
            return;
        }
    }

    if (gameState.selectedTower) {
        const towerType = config.towerTypes.find(t => t.id === gameState.selectedTower);
        if (towerType && towerType.isBarracks) {
            // Chỉ cho phép thả lính ở 1/5 dưới màn hình
            if (y < canvas.height * 4 / 5) return;
            const now = Date.now();
            if (now - lastBarracksSpawn >= 1000 && gameState.gold >= towerType.cost) {
                spawnUnit(x, y);
                gameState.gold -= towerType.cost;
                goldElement.textContent = gameState.gold;
                lastBarracksSpawn = now;
            }
            return;
        }
        placeTower(x, y, gameState.selectedTower);
        gameState.selectedTower = null;
    }
});

// Start game loop
requestAnimationFrame(gameLoop);
