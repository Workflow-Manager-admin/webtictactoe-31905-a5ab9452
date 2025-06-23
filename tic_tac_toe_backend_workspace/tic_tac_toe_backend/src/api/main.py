from fastapi import FastAPI, HTTPException
from fastapi import Body, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from uuid import uuid4


# PUBLIC_INTERFACE
class GameCreateResponse(BaseModel):
    """Response after creating a new game."""
    game_id: str = Field(..., description="Unique ID for the Tic Tac Toe game.")
    player_token: str = Field(..., description="Token for the creator/player X.")


# PUBLIC_INTERFACE
class GameJoinRequest(BaseModel):
    player_name: Optional[str] = Field(
        None, description="Player (O) name (optional, for UI)"
    )


# PUBLIC_INTERFACE
class GameJoinResponse(BaseModel):
    player_token: str = Field(..., description="Token for the joining player (O).")
    opponent_token: str = Field(
        ..., description="Token for the game creator/player X."
    )


# PUBLIC_INTERFACE
class MoveRequest(BaseModel):
    player_token: str = Field(..., description="Token of the player making the move.")
    row: int = Field(..., description="Row index (0, 1, or 2)")
    col: int = Field(..., description="Column index (0, 1, or 2)")


# PUBLIC_INTERFACE
class MoveResponse(BaseModel):
    board: List[List[Optional[str]]] = Field(
        ...,
        description="The board after the move, "
                    "with cell as 'X', 'O', or None."
    )
    next_turn: Optional[str] = Field(
        None,
        description="Symbol whose turn is next: 'X' or 'O', or None if game over",
    )
    winner: Optional[str] = Field(
        None,
        description="'X', 'O', or 'draw' if game ended, else None"
    )


# PUBLIC_INTERFACE
class GameStateResponse(BaseModel):
    board: List[List[Optional[str]]] = Field(..., description="Current board")
    next_turn: Optional[str] = Field(
        None, description="Next turn: 'X' or 'O', or None"
    )
    winner: Optional[str] = Field(
        None, description="Winner: 'X', 'O', 'draw', or None"
    )
    players: Dict[str, Optional[str]] = Field(
        ..., description="Mapping of symbol to player_token."
    )


app = FastAPI(
    title="Tic Tac Toe Backend API",
    version="1.0.0",
    description="REST backend for a tic tac toe game. Allows creating, joining, playing, and querying games.",
    openapi_tags=[
        {"name": "game", "description": "Game management endpoints."},
        {"name": "play", "description": "Game interaction endpoints."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["game"])
def health_check():
    """Health check endpoint."""
    return {"message": "Healthy"}


# --- Game In-Memory Model & Logic ---


class GameSession:
    def __init__(self, creator_token: str):
        self.board: List[List[Optional[str]]] = [[None] * 3 for _ in range(3)]
        self.players: Dict[str, Optional[str]] = {
            "X": creator_token,
            "O": None,
        }
        # maps 'X'/'O' -> player_token
        self.player_names: Dict[str, Optional[str]] = {"X": None, "O": None}
        self.turn: str = "X"
        self.winner: Optional[str] = None
        # 'X', 'O', 'draw', or None

    def can_join(self):
        return self.players["O"] is None

    def join(self, player_token: str):
        if not self.can_join():
            raise ValueError("Game already has two players.")
        self.players["O"] = player_token

    def get_symbol_by_token(self, token: str) -> Optional[str]:
        for symbol, tok in self.players.items():
            if tok == token:
                return symbol
        return None

    def make_move(self, player_token: str, row: int, col: int):
        symbol = self.get_symbol_by_token(player_token)
        if symbol is None:
            raise ValueError("Invalid player token.")
        if self.winner is not None:
            raise ValueError("Game has ended.")
        if symbol != self.turn:
            raise ValueError("It's not your turn.")
        if not (0 <= row <= 2 and 0 <= col <= 2):
            raise ValueError("Invalid board position.")
        if self.board[row][col] is not None:
            raise ValueError("Cell already occupied.")
        self.board[row][col] = symbol
        self.turn = "O" if self.turn == "X" else "X"
        self._update_winner()

    def _update_winner(self):
        # Check for win
        lines = (
            self.board  # rows
            + [list(col) for col in zip(*self.board)]  # cols
            + [
                [self.board[i][i] for i in range(3)]
            ]  # main diagonal
            + [
                [self.board[i][2 - i] for i in range(3)]
            ]  # anti diagonal
        )
        for line in lines:
            if line == ["X"] * 3:
                self.winner = "X"
            elif line == ["O"] * 3:
                self.winner = "O"
        # Draw if no winner & no remaining moves
        if (
        self.winner is None
        and all(
            cell is not None
            for row in self.board
            for cell in row
        )
    ):
        self.winner = "draw"
        # If win/draw, null next turn
        if self.winner is not None:
            self.turn = None


# In-memory games store: game_id -> GameSession
games: Dict[str, GameSession] = {}


# --- Endpoints ---


# PUBLIC_INTERFACE
@app.post(
    "/games",
    response_model=GameCreateResponse,
    tags=["game"],
    summary="Create a new game",
    description="Create a new Tic Tac Toe game and receive your player token.",
)
def create_game():
    """Create a new tic tac toe game, returns game_id and your player_token (as X)."""
    game_id = str(uuid4())
    creator_token = str(uuid4())
    games[game_id] = GameSession(creator_token=creator_token)
    return GameCreateResponse(game_id=game_id, player_token=creator_token)


# PUBLIC_INTERFACE
@app.post(
    "/games/{game_id}/join",
    response_model=GameJoinResponse,
    tags=["game"],
    summary="Join an existing game",
    description="Join a game as player O and receive your player_token. Returns both joining and opponent tokens.",
)
def join_game(
    game_id: str = Path(..., description="ID of the game to join"),
    req: GameJoinRequest = Body(...),
):
    """Join an existing Tic Tac Toe game."""
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, detail="Game not found.")
    if not game.can_join():
        raise HTTPException(400, detail="Game already has two players.")
    join_token = str(uuid4())
    game.join(join_token)
    return GameJoinResponse(
        player_token=join_token,
        opponent_token=game.players["X"]
    )


# PUBLIC_INTERFACE
@app.post(
    "/games/{game_id}/move",
    response_model=MoveResponse,
    tags=["play"],
    summary="Submit a move",
    description="Submit a move for a given game with player token and coordinates.",
)
def make_move(
    game_id: str = Path(..., description="ID of the game"),
    req: MoveRequest = Body(...),
):
    """Submit a move in a game as 'X' or 'O'."""
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, detail="Game not found.")
    try:
        game.make_move(req.player_token, req.row, req.col)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    return MoveResponse(
        board=game.board,
        next_turn=game.turn,
        winner=game.winner,
    )


# PUBLIC_INTERFACE
@app.get(
    "/games/{game_id}/state",
    response_model=GameStateResponse,
    tags=["play"],
    summary="Get game state",
    description="Retrieve the complete current state of a game including board, whose turn, winner, and player tokens.",
)
def get_game_state(game_id: str = Path(..., description="ID of the game")):
    """Get current game state."""
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, detail="Game not found.")
    return GameStateResponse(
        board=game.board,
        next_turn=game.turn,
        winner=game.winner,
        players=game.players.copy(),
    )
