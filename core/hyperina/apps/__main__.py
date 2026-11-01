"""hyperina-app <приложение> [аргументы…]"""
import sys

from .host import main

sys.exit(main(sys.argv[1:]))
