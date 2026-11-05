import os
import subprocess
import sys
import textwrap
import time

import pytest

from haotica import supervisor


def _wait(fn, t=10.0):
    t0 = time.time()
    while time.time() - t0 < t:
        if fn():
            return True
        time.sleep(0.1)
    return False


def test_start_stop_restart(tmp_path):
    sup = supervisor.Supervisor()
    flag = tmp_path / "n"
    code = f"import pathlib,time; p=pathlib.Path(r'{flag}'); p.write_text(str(int(p.read_text() or 0)+1) if p.exists() else '1'); time.sleep(0.3); raise SystemExit(3)"
    sup.add("crashy", [sys.executable, "-c", code], restart=True)
    assert sup.start("crashy")
    assert _wait(lambda: flag.exists() and int(flag.read_text()) >= 2, 15), "перезапуск после падения"
    sup.stop("crashy")
    sup.add("sleepy", [sys.executable, "-c", "import time; time.sleep(60)"])
    sup.start("sleepy")
    assert sup.state("sleepy") == "active"
    sup.stop("sleepy", 5)
    assert sup.state("sleepy") == "inactive"
    sup.stop_all()


@pytest.mark.skipif(os.name != "nt", reason="Job Object — только Windows")
def test_job_kills_children_on_parent_exit(tmp_path):
    pidfile = tmp_path / "child.pid"
    script = textwrap.dedent("""
        import os, sys, time
        sys.path.insert(0, os.environ["HY_CORE"])
        from haotica import supervisor
        sup = supervisor.get()
        sup.add("child", [sys.executable, "-c", "import os,time; open(os.environ['HY_PID'],'w').write(str(os.getpid())); time.sleep(120)"])
        sup.start("child")
        time.sleep(120)
    """)
    env = {**os.environ, "HY_CORE": os.path.join(os.path.dirname(supervisor.__file__), ".."), "HY_PID": str(pidfile)}
    parent = subprocess.Popen([sys.executable, "-c", script], env=env)
    assert _wait(lambda: pidfile.exists() and pidfile.read_text().strip(), 20)
    child = int(pidfile.read_text())
    import psutil
    assert psutil.pid_exists(child)
    parent.kill()                      # как будто окно упало
    parent.wait(10)
    def gone():
        try:
            return not psutil.pid_exists(child) or psutil.Process(child).status() == psutil.STATUS_ZOMBIE
        except psutil.NoSuchProcess:          # исчез между двумя вызовами — тоже «завершён»
            return True
    assert _wait(gone, 10)
