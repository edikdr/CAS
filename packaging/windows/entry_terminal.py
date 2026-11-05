"""HaoticaTerminal.exe: окно терминала; `--module haotica.server` и т. п. — службы (их запускает супервизор)."""
import runpy
import sys

if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--module":
        mod = sys.argv[2]
        sys.argv = [sys.argv[0], *sys.argv[3:]]
        runpy.run_module(mod, run_name="__main__", alter_sys=True)
        sys.exit(0)
    from haotica.apps.host import main
    args = sys.argv[1:]
    sys.exit(main(args if args and not args[0].startswith("-") else ["terminal", *args]))
