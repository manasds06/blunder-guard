"""The network: a small residual CNN that predicts the move a human of a given rating plays.

INPUT  19 x 8 x 8
    17 board planes from encoding.py, plus 2 constant planes holding the
    mover's and opponent's ratings, normalised to about -1..1. Feeding the
    rating in as input is what lets ONE network play like a 600 or a 1900:
    same position, different rating plane, different predicted move.
    (Maia v1 trained a separate net per rating band; one conditioned net
    shares what all ratings have in common and needs far less data per band.)

BODY   stem conv -> 6 residual blocks of 64 filters
    A residual block is conv-BN-ReLU-conv-BN plus a skip connection that
    adds the block's input to its output. The skip lets gradients flow
    straight through, so a deep stack trains as easily as a shallow one.
    Each 3x3 conv sees one square further, so 13 stacked convs see the
    whole 8x8 board from any square -- the long diagonals included.

HEAD   fully convolutional, 64 output channels
    Output channel t at board square f is the score for "move from f to t".
    That gives exactly 64 x 64 = 4096 scores -- one per move id in
    encoding.py -- without a big fully-connected layer (AlphaZero-style heads
    spend ~8M parameters there; this whole network is ~0.5M).

~0.5M parameters, the same size as Maia's 6x64 nets.
"""

from __future__ import annotations

import torch
from torch import nn

from bgml.encoding import N_MOVES, N_PLANES

ELO_CENTER = 1300.0
ELO_SCALE = 700.0
IN_PLANES = N_PLANES + 2


def normalize_elo(elo: torch.Tensor) -> torch.Tensor:
    return (elo.float() - ELO_CENTER) / ELO_SCALE


class ResidualBlock(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = torch.relu(self.bn1(self.conv1(x)))
        y = self.bn2(self.conv2(y))
        return torch.relu(x + y)


class HumanMoveNet(nn.Module):
    def __init__(self, blocks: int = 6, channels: int = 64) -> None:
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(IN_PLANES, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(),
        )
        self.body = nn.Sequential(*[ResidualBlock(channels) for _ in range(blocks)])
        self.head = nn.Sequential(
            nn.Conv2d(channels, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(),
            nn.Conv2d(channels, 64, 1),  # channel = destination square
        )

    def forward(self, planes: torch.Tensor, elo: torch.Tensor, opp_elo: torch.Tensor) -> torch.Tensor:
        """planes (B,17,8,8) float, elo/opp_elo (B,) -> logits (B, 4096)."""
        b = planes.shape[0]
        rating = torch.stack([normalize_elo(elo), normalize_elo(opp_elo)], dim=1)
        rating = rating[:, :, None, None].expand(b, 2, 8, 8)
        x = torch.cat([planes, rating], dim=1)
        out = self.head(self.body(self.stem(x)))  # (B, to=64, rank=8, file=8)
        return head_to_logits(out)


def head_to_logits(out: torch.Tensor) -> torch.Tensor:
    """(B, to, rank, file) -> (B, 4096) indexed from*64 + to, matching encoding.py.

    from_square = rank*8 + file, so flattening (rank, file) gives the from
    index; then put `from` before `to` and flatten.
    """
    b = out.shape[0]
    return out.reshape(b, 64, 64).transpose(1, 2).reshape(b, N_MOVES)


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())
