from enum import Enum
from fastapi import APIRouter, Query

from .models import UserOut

router = APIRouter(prefix="/users")


@router.get("/{user_id}", summary="Get user", response_model=UserOut)
def get_user(user_id: int, verbose: bool = Query(False)) -> UserOut:
    raise NotImplementedError


class State(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
