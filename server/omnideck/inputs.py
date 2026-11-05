from typing import Any, Literal
from pydantic import BaseModel, Field


class InputCommand(BaseModel):
    type: Literal[
        "mouse-move",
        "mouse-click",
        "mouse-scroll",
        "key-down",
        "key-up",
        "text",
        "gamepad",
    ]
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: float | int | None = None


class InputMessage(BaseModel):
    type: Literal["input"]
    data: InputCommand
