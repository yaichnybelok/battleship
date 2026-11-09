from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import secrets, threading, time
from functools import wraps


boardSize = 10
lock = threading.Lock()
players = {}
game = {"status": "waiting", "turn": None, "winner": None}


correctShipAmount = {
        1: 4,
        2: 3,
        3: 2,
        4: 1
    }

#=====================================================================================================

def require_player(f):
    @wraps(f)
    def wrapper(*a, **kw):
        token = request.headers.get("X-Player-Token")
        player = players.get(token)
        if not player:
            return jsonify({"error": "unauthorized"}), 401
        return f(token, player, *a, **kw)
    return wrapper

#======================================проверка клеток================================================

def cellChecker(grid):
    for row in range(len(grid)):
            for col in range(len(grid[row])):
                if grid[row][col] == 1:
                    if (row - 1) >= 0 and (row + 1) < boardSize and (col - 1) >= 0 and (col + 1) < boardSize:
                        if not(grid[row - 1 ][col - 1] == 0 and grid[row - 1][col + 1] == 0 and grid[row + 1 ][col - 1] == 0 and grid[row + 1 ][col + 1] == 0):
                            return False
    return True

def shipChecker(grid):
    checkedGrid = [[0 for j in range(len(grid[i]))] for i in range(len(grid))]
    shipAmount = {
        1: 0,
        2: 0,
        3: 0,
        4: 0
    }
    for row in range(len(grid)):
        for col in range(len(grid[row])):
            if grid[row][col] == 1 and checkedGrid[row][col] != 1:
                checkedGrid[row][col] = 1
                length = 1

                c = col + 1
                while c < boardSize and grid[row][c] == 1:
                    length += 1
                    checkedGrid[row][c] = 1
                    c += 1

                r = row + 1
                while r < boardSize and grid[r][col] == 1:
                    length += 1
                    checkedGrid[r][col] = 1
                    r += 1
                    
                if length in shipAmount:
                    shipAmount[length] += 1
                else: return False
    if shipAmount == correctShipAmount:
        return True
    return False

#======================================game===========================================================

def emptyBoard():
    return [[0 for _ in range(boardSize)] for _ in range(boardSize)]

def otherToken(token):
    for t in players:
        if t != token:
            return t
    return None

def startGame():
    game["status"] = "playing"
    game["winner"] = None
    game["turn"] = secrets.choice([0, 1])

def shipCells(fleet, row, col):
    cells = [(row, col)]

    c = col - 1
    while c >= 0 and fleet[row][c] == 1:
        cells.append((row, c)); c -= 1
    c = col + 1
    while c < boardSize and fleet[row][c] == 1:
        cells.append((row, c)); c += 1

    if len(cells) == 1:
        r = row - 1
        while r >= 0 and fleet[r][col] == 1:
            cells.append((r, col)); r -= 1
        r = row + 1
        while r < boardSize and fleet[r][col] == 1:
            cells.append((r, col)); r += 1

    return cells

def applyShot(token, row, col):
    player = players[token]
    target = players[otherToken(token)]

    if target["fleet"][row][col] == 1:
        player["enemy"][row][col] = 2
        target["own"][row][col] = 2

        cells = shipCells(target["fleet"], row, col)
        ship = {"size": len(cells), "cells": [[r, c] for (r, c) in cells]}

        if all(target["own"][r][c] == 2 for (r, c) in cells):
            for (r, c) in cells:
                player["enemy"][r][c] = 3
                target["own"][r][c] = 3
            player["sunk"].append(len(cells))
            result = "kill"
        else:
            result = "hit"

        if all(target["own"][r][c] == 3
               for r in range(boardSize) for c in range(boardSize)
               if target["fleet"][r][c] == 1):
            game["status"] = "over"
            game["winner"] = player["slot"]
    else:
        player["enemy"][row][col] = 4
        target["own"][row][col] = 4
        result = "miss"
        ship = None
        game["turn"] = 1 - game["turn"]

    shotInfo = {"row": row, "col": col, "result": result, "ship": ship}
    player["last_shot"] = dict(shotInfo, by="you")
    target["last_shot"] = dict(shotInfo, by="enemy")

    return result

def snapshot(token):
    p = players[token]
    return {
        "ok": True,
        "slot": p["slot"],
        "players": len(players),
        "status": game["status"],
        "your_turn": game["status"] == "playing" and p["slot"] == game["turn"],
        "own": p["own"],
        "enemy": p["enemy"],
        "sunk_enemy": p["sunk"],
        "winner": game["winner"],
        "last_shot": p["last_shot"]
    }

def validShape(data):
    return (isinstance(data, list) and len(data) == boardSize
            and all(isinstance(row, list) and len(row) == boardSize for row in data))

#======================================routes=========================================================

app = Flask(__name__)
CORS(app)


@app.route("/")
def home():
    return render_template('index.html')

#получение токена
@app.route("/api/join", methods=["POST"])
def join():
    with lock:
        data = request.get_json(silent=True)

        if len(players) >= 2:
            return jsonify({"error": "game_full"}), 409

        if not validShape(data) or not cellChecker(data) or not shipChecker(data):
            return jsonify({"error": "invalid_ships"}), 409

        token = secrets.token_urlsafe(32)
        slot = len(players)
        players[token] = {
            "slot": slot,
            "fleet": data,                      # расстановка(cопернику не отдаётся!!!!)
            "own": [row[:] for row in data],    # своё поле
            "enemy": emptyBoard(),              # что игрок знает о чужом поле
            "sunk": [],                         # размеры убитых кораблей
            "last_shot": None
        }
        if len(players) == 2:
            startGame()
        return jsonify({"token": token, "slot": slot})

#проверка токена + текущее состояние игры
@app.route("/api/state", methods=["GET"])
@require_player
def state(token, player):
    with lock:
        return jsonify(snapshot(token))

#выстрел
@app.route("/api/shoot", methods=["POST"])
@require_player
def shoot(token, player):
    data = request.get_json(silent=True) or {}
    row = data.get("row")
    col = data.get("col")

    if type(row) is not int or type(col) is not int:
        return jsonify({"error": "bad_coords"}), 400
    if not (0 <= row < boardSize and 0 <= col < boardSize):
        return jsonify({"error": "bad_coords"}), 400

    with lock:
        if game["status"] != "playing":
            return jsonify({"error": "not_playing"}), 409
        if player["slot"] != game["turn"]:
            return jsonify({"error": "not_your_turn"}), 409
        if player["enemy"][row][col] != 0:
            return jsonify(snapshot(token))

        applyShot(token, row, col)
        return jsonify(snapshot(token))


app.run(host='0.0.0.0', port=8222)
