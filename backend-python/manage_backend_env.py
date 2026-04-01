from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
VENV_PATH = Path.home() / '.table-pet' / 'venv311'
PYTHON_PATH = VENV_PATH / 'Scripts' / 'python.exe'


def ensure_venv() -> Path:
    VENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not PYTHON_PATH.exists():
        result = subprocess.run(
            [sys.executable, '-m', 'venv', str(VENV_PATH)],
            cwd=ROOT,
            check=False,
        )
        if result.returncode != 0:
            raise SystemExit(result.returncode)
    return PYTHON_PATH


def run_venv_python(args: list[str]) -> int:
    python_path = ensure_venv()
    env = dict(os.environ)
    env.setdefault('PYTHONUTF8', '1')
    env.setdefault('PYTHONIOENCODING', 'utf-8')
    env.setdefault('HF_HUB_DISABLE_PROGRESS_BARS', '1')
    result = subprocess.run(
        [str(python_path), *args],
        cwd=ROOT,
        check=False,
        env=env,
    )
    return int(result.returncode)


def cmd_install(requirements: str) -> int:
    return run_venv_python(['-m', 'pip', 'install', '-r', requirements])


def cmd_setup_memory() -> int:
    return run_venv_python(['setup_memory.py'])


def cmd_run(script: str, script_args: list[str]) -> int:
    return run_venv_python([script, *script_args])


def cmd_run_module(module: str, module_args: list[str]) -> int:
    return run_venv_python(['-m', module, *module_args])


def cmd_path() -> int:
    print(PYTHON_PATH)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest='command', required=True)

    install_parser = subparsers.add_parser('install')
    install_parser.add_argument('--requirements', required=True)

    subparsers.add_parser('setup-memory')

    run_parser = subparsers.add_parser('run')
    run_parser.add_argument('script')
    run_parser.add_argument('script_args', nargs='*')

    run_module_parser = subparsers.add_parser('run-module')
    run_module_parser.add_argument('module')
    run_module_parser.add_argument('module_args', nargs='*')

    subparsers.add_parser('path')
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == 'install':
        return cmd_install(args.requirements)
    if args.command == 'setup-memory':
        return cmd_setup_memory()
    if args.command == 'run':
        return cmd_run(args.script, args.script_args)
    if args.command == 'run-module':
        return cmd_run_module(args.module, args.module_args)
    if args.command == 'path':
        return cmd_path()

    parser.error('Unknown command.')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
