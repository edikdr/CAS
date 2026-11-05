"""haotica.exe: командная строка (haotica . | doctor | models | llama | voice | key | ask)."""
import sys

import _console

_console.setup()

from haotica.cli import main

if __name__ == "__main__":
    sys.exit(main())
