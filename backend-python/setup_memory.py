from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REQUIREMENTS_PATH = ROOT / 'requirements-memory.txt'


def read_requirements() -> tuple[list[str], list[str]]:
    required: list[str] = []
    optional: list[str] = []

    for raw_line in REQUIREMENTS_PATH.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue

        if line.startswith('lancedb'):
            optional.append(line)
        else:
            required.append(line)

    return required, optional


def install_packages(packages: list[str], label: str) -> bool:
    if not packages:
        return True

    command = [sys.executable, '-m', 'pip', 'install', *packages]
    print(f'[memory-setup] installing {label}: {" ".join(packages)}')
    result = subprocess.run(command, cwd=ROOT, check=False)
    return result.returncode == 0


def main() -> int:
    required, optional = read_requirements()

    if not install_packages(required, 'core memory dependencies'):
        print('[memory-setup] core memory dependency install failed.')
        return 1

    if optional and not install_packages(optional, 'optional vector memory dependencies'):
        print('[memory-setup] optional LanceDB install failed, continuing with DuckDB-only memory runtime.')

    print('[memory-setup] memory dependency setup finished.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
