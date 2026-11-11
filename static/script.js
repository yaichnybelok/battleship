const cellSize = 60
const boardSize = 10

let isPressed = false
let lastRow = -1
let lastCol = -1
let startCol = -1
let startRow = -1
let direction = ""
let token = localStorage.getItem("bs_token")
let gamestate = 0
let pollTimer = null
let polling = false


const correctShipAmount = [ 4, 3, 2, 1 ]
let shipAmountconst = [ 0, 0, 0, 0 ]
//====================================отрисовка поля==================================================

function drawLine(x1, y1, x2, y2, canvas) {
  canvas.getContext('2d').beginPath()
  canvas.getContext('2d').moveTo(x1, y1)
  canvas.getContext('2d').lineTo(x2, y2)
  canvas.getContext('2d').stroke()
}

function drawField(grid, canvas) {
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) {
      if (grid[row][col] == 1) {
        canvas.getContext('2d').fillStyle = '#24442f'
        canvas.getContext('2d').fillRect(col * cellSize, row * cellSize, cellSize, cellSize)

      } else if (grid[row][col] == 2) {
        canvas.getContext('2d').fillStyle = '#b42d2d'
        canvas.getContext('2d').fillRect(col * cellSize, row * cellSize, cellSize, cellSize)

      } else if (grid[row][col] == 3) {
        canvas.getContext('2d').fillStyle = '#4f1313'
        canvas.getContext('2d').fillRect(col * cellSize, row * cellSize, cellSize, cellSize)

      } else if (grid[row][col] == 4) {
        canvas.getContext('2d').beginPath()
        canvas.getContext('2d').arc(col * cellSize + cellSize / 2, row * cellSize + cellSize / 2, cellSize / 8, 0, Math.PI * 2)
        canvas.getContext('2d').fillStyle = '#404642'
        canvas.getContext('2d').fill()
      } 
    }
  }
  for (let i = 0; i <= boardSize; i++) {
  drawLine(i * cellSize, 0, i * cellSize, boardSize * cellSize, canvas)
  drawLine(0, i * cellSize, boardSize * cellSize, i * cellSize, canvas)
}
}

//====================================логин==================================================

async function join(grid) {
  try {
    const r = await fetch("/api/join", { 
      method: "POST", headers: {
      'Content-Type': 'application/json'
      },
      body: JSON.stringify(grid)})

    const d = await r.json()

    if (d.error == "game_full") {
      alert("Игра уже идет. Попробуйте позже")
      return false
    } else if (d.error == "invalid_ships"){
      alert("Неверная расстановка кораблей!")
      return false
    }
    console.log(d)
    token = d.token
    localStorage.setItem("bs_token", token)
    return true
  } catch (error) {
    alert("Игра уже идет. Попробуйте позже")
    return false
  }
}
//=====================================polling===============================================

function stopPoll() {
  clearTimeout(pollTimer)
  pollTimer = null
  polling = false
}

function schedulePoll(delay) {
  clearTimeout(pollTimer)
  pollTimer = setTimeout(poll, delay)
}

async function poll() {
  if (!polling) return

  try {
    const r = await fetch("/api/state", { headers: { "X-Player-Token": token } })
    if (r.status === 401) {
      stopPoll()
      localStorage.removeItem("bs_token")
      token = ""
      return
    }
    if (!r.ok) throw new Error("HTTP " + r.status)

    const d = await r.json()
    applyState(d)

    if (d.status === "over") {
      stopPoll()
    } else {
      schedulePoll(1000)
    }
  } catch (error) {
    console.error("Опрос не удался:", error)
    yourShips.textContent = "Нет связи с сервером..."
    schedulePoll(3000)
  }
}

function startPoll() {
  if (polling) return
  polling = true
  schedulePoll(0)
}

let yourTurn = false

function applyState(d) {
  if (Array.isArray(d.own)) myGrid = d.own
  if (Array.isArray(d.enemy)) enemyGrid = d.enemy
  yourTurn = d.your_turn

  drawField(myGrid, myCanvas)
  drawField(enemyGrid, enemyCanvas)

  if (d.status === "waiting") {
    yourShips.textContent = "Ожидание соперника..."
    return
  }
  if (d.status === "over") {
    yourShips.textContent = (d.winner == d.slot) ? "Вы победили!" : "Вы проиграли"
    return
  }

  let text = d.your_turn ? "Ваш ход" : "Ход соперника"

  if (d.last_shot) {
    const who = (d.last_shot.by == "you") ? "вы" : "соперник"
    const what = { miss: "промах", hit: "попадание", kill: "корабль потоплен" }[d.last_shot.result]
    text += ` — ${who}: ${what}`
  }

  yourShips.textContent = text
}

//==============================проверка сохранённого токена================================

async function checkSavedToken() {
  const saved = localStorage.getItem("bs_token")
  if (!saved) return
  gamestate = 1
  play.disabled = true

  try {
    const r = await fetch("/api/state", { headers: { "X-Player-Token": saved } })

    if (r.status === 401) {
      localStorage.removeItem("bs_token")
      token = ""
      gamestate = 0
      play.disabled = false
      console.log("Сохранённый токен неактуален")
      return
    }
    if (!r.ok) throw new Error("HTTP " + r.status)

    const d = await r.json()
    token = saved
    gamestate = 1
    play.style.display = "none"
    katera.style.display = "none"
    esmintsi.style.display = "none"
    kreysera.style.display = "none"
    linkori.style.display = "none"
    applyState(d)
    startPoll()
    console.log("Токен активен: слот", d.slot, "игроков", d.players)
  } catch (error) {
    console.error("Не удалось проверить токен:", error)
    gamestate = 0
    play.disabled = false
  }
}

//======================================проверка клетки================================================

function cellChecker(row, col, startRow, startCol) {
  for (let rows = -1; rows <= 1; rows++) {
    for (let cols = -1; cols <= 1; cols++) {
      const r = row + rows
      const c = col + cols
      if (r >= 0 && r < boardSize && c >= 0 && c < boardSize) {
        if (myGrid[r][c] === 1) {
          
          const isCurrentHorizontal = (r == startRow && Math.abs(c - startCol) <= 3 && ((direction == "left" && c <= startCol) || (direction == "right" && c >= startCol) || direction == ""))
          const isCurrentVertical = (c == startCol && Math.abs(r - startRow) <= 3 && ((direction == "up" && r <= startRow) || (direction == "down" && r >= startRow) || direction == ""))
          
          if (isCurrentHorizontal || isCurrentVertical) {
            continue
          }

          return false
        }
      }
    }
  }
  return true
}

//======================================проверка кол-ва кораблей================================================

function shipChecker(grid) {
    let checkedGrid = grid.map(row => new Array(row.length).fill(0))
    let shipAmount = [0, 0, 0, 0]
    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            if (grid[row][col] == 1 && checkedGrid[row][col] != 1) {
                checkedGrid[row][col] = 1

                let length = 1

                let c = col + 1
                while (c < boardSize && grid[row][c] == 1) {
                    length += 1
                    checkedGrid[row][c] = 1
                    c += 1
                }

                let r = row + 1
                while (r < boardSize && grid[r][col] == 1) {
                    length += 1
                    checkedGrid[r][col] = 1
                    r += 1
                }
                shipAmount[length - 1] += 1
            }
        }
    }
    shipAmountconst = shipAmount
    katera.textContent = `Катера: ${shipAmountconst[0]} (макс. 4)`
    esmintsi.textContent = `Эсминцы: ${shipAmountconst[1]} (макс. 3)`
    kreysera.textContent = `Крейсеры: ${shipAmountconst[2]} (макс. 2)`
    linkori.textContent = `Линкоры: ${shipAmountconst[3]} (макс. 1)`

    if (shipAmountconst[0] > 4) {
      katera.style.color = "red"
    } else if (shipAmountconst[0] == 4) {
      katera.style.color = "green"
    } else {
      katera.style.color = "black"
    }

    if (shipAmountconst[1] > 3) {
      esmintsi.style.color = "red"
    }else if (shipAmountconst[1] == 3) {
      esmintsi.style.color = "green"
    } else {
      esmintsi.style.color = "black"
    }

    if (shipAmountconst[2] > 2) {
      kreysera.style.color = "red"
    }else if (shipAmountconst[2] == 2) {
      kreysera.style.color = "green"
    } else {
      kreysera.style.color = "black"
    }

    if (shipAmountconst[3] > 1) {
      linkori.style.color = "red"
    }else if (shipAmountconst[3] == 1) {
      linkori.style.color = "green"
    } else {
      linkori.style.color = "black"
    }

    if (
      shipAmount.length === correctShipAmount.length &&
      shipAmount.every((amount, index) => amount === correctShipAmount[index])
    ) {
    return true
    }
    return false
    
}

//=======================================рисование клеток по зажатию===============================================

function handleMouseAction(event){
  const rect = myCanvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const col = Math.floor(x / cellSize)
  const row = Math.floor(y / cellSize)

  if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) return

  if (row != lastRow || col != lastCol) {

    if (direction == "") {
      if (row < startRow && col == startCol) direction = "up"
      else if (row > startRow && col == startCol) direction = "down"
      else if (col < startCol && row == startRow) direction = "left"
      else if (col > startCol && row == startRow) direction = "right"
    }

    const isValidMove = 
      (direction == "up" && col == startCol && row <= startRow) ||
      (direction == "down" && col == startCol && row >= startRow) ||
      (direction == "left" && row == startRow && col <= startCol) ||
      (direction == "right" && row == startRow && col >= startCol)

    if (!isValidMove) return

    if (!cellChecker(row, col, startRow, startCol)) return

    const diffRow = Math.abs(startRow - row)
    const diffCol = Math.abs(startCol - col)
    let length = Math.max(diffRow, diffCol) + 1

    if (direction == "up" && lastCol != -1 && row > lastRow) {
      myGrid[lastRow][lastCol] = 0
    } else if (direction == "down" && lastCol != -1 && row < lastRow) {
      myGrid[lastRow][lastCol] = 0 
    } else if (direction == "left" && lastCol != -1 && col > lastCol) {
      myGrid[lastRow][lastCol] = 0
    } else if (direction == "right" && lastCol != -1 && col < lastCol) {
      myGrid[lastRow][lastCol] = 0
    } 

    else if (length <= 4) {
      myGrid[row][col] = 1
    }

    lastRow = row
    lastCol = col
    shipChecker(myGrid)
    drawField(myGrid, myCanvas)
  }
}

//==================================main====================================================
const myCanvas = document.getElementById('myCanvas')
const enemyCanvas = document.getElementById('enemyCanvas')
const play = document.getElementById("play")
const yourShips = document.getElementById("yourShips")
const katera = document.getElementById("katera")
const esmintsi = document.getElementById("esmintsi")
const kreysera = document.getElementById("kreysera")
const linkori = document.getElementById("linkori")

myCanvas.getContext('2d').strokeStyle = '#000'
myCanvas.getContext('2d').lineWidth = 0.5

enemyCanvas.getContext('2d').strokeStyle = '#000'
enemyCanvas.getContext('2d').lineWidth = 0.5

let myGrid = Array.from({ length: 10 }, () => Array(10).fill(0))
let enemyGrid = Array.from({ length: 10 }, () => Array(10).fill(0))

drawField(myGrid, myCanvas)
drawField(enemyGrid, enemyCanvas)
checkSavedToken()

myCanvas.addEventListener("mousedown", function(event) {
  if (event.button == 0 & gamestate == 0) {
    isPressed = true
    
    const rect = myCanvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const clickedCol = Math.floor(x / cellSize)
    const clickedRow = Math.floor(y / cellSize)

    if (myGrid[clickedRow][clickedCol] == 1) {
      myGrid[clickedRow][clickedCol] = 0
      shipChecker(myGrid)
      drawField(myGrid, myCanvas)
      return
    }

    direction = ""

    if (cellChecker(clickedRow, clickedCol, startRow, startCol)) {
      isPressed = true
      startCol = clickedCol
      startRow = clickedRow
      
      myGrid[startRow][startCol] = 1
      lastRow = startRow
      lastCol = startCol
      shipChecker(myGrid)
      drawField(myGrid, myCanvas)
    }
  }
})

myCanvas.addEventListener('mousemove', function(event) {
  if (isPressed & gamestate == 0) {
    handleMouseAction(event)
  }
});

enemyCanvas.addEventListener("mousedown", async function(event) {
  if (event.button != 0) return
  if (gamestate != 1 || !yourTurn) return

  const rect = enemyCanvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const col = Math.floor(x / cellSize)
  const row = Math.floor(y / cellSize)

  if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) return
  if (enemyGrid[row][col] != 0) return

  yourTurn = false

  try {
    const r = await fetch("/api/shoot", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Player-Token": token },
      body: JSON.stringify({ row: row, col: col })
    })

    if (r.status === 401) { stopPoll(); return }
    if (!r.ok) throw new Error("HTTP " + r.status)

    applyState(await r.json())
  } catch (error) {
    console.error("Выстрел не удался:", error)
    yourTurn = true
  }

    

})


window.addEventListener('mouseup', function(event) {
  if (event.button === 0 & gamestate == 0) {
      isPressed = false
      lastRow = -1
      lastCol = -1
      startCol = -1
      startRow = -1
  }
})
window.addEventListener('mouseleave', function() {
})



play.addEventListener("click", async function() {
  play.disabled = true
  const ok = await join(myGrid)
  if (!ok) {
    play.disabled = false
    return
  }
  gamestate = 1

  play.style.display = "none"
  katera.style.display = "none"
  esmintsi.style.display = "none"
  kreysera.style.display = "none"
  linkori.style.display = "none"
  yourShips.textContent = "Ожидание соперника..."

  startPoll()
})
