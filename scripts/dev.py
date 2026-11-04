#!/usr/bin/env python3
"""Start the persistent Loyalty Docker environment."""
import sys
from staging import main
if __name__ == '__main__':
    raise SystemExit(main(['start', *sys.argv[1:]]))
